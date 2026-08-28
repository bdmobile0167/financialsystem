const { createAdminClient, json, requireAuthenticatedUser } = require('./_supabaseServer');

const KEYWORD_RULES = [
  {
    codeHints: ['6110'],
    keywords: ['車馬', '交通', '住宿', '旅費', '差旅', '高鐵', '台鐵', '捷運', '計程車', '停車', '過路費', 'taxi', 'uber', 'hotel']
  },
  {
    codeHints: ['6210'],
    keywords: ['餐飲', '交際', '餐費', '便當', '咖啡', '午餐', '晚餐', '聚餐', '招待', 'meal', 'restaurant']
  },
  {
    codeHints: ['6130'],
    keywords: ['文具', '辦公用品', '耗材', '紙張', '墨水', 'office supplies', 'stationery']
  },
  {
    codeHints: ['6170'],
    keywords: ['郵電', '通訊', '電話', '網路', '郵資', 'domain', 'internet', 'phone']
  },
  {
    codeHints: ['6200'],
    keywords: ['顧問', '專業服務', '法律', '會計師', '記帳士', 'consulting', 'consultant', 'service fee']
  },
  {
    codeHints: ['6160'],
    keywords: ['廣告', 'facebook', 'google ads', 'meta ads', 'ig', '行銷', '投放', 'ads', 'advertising']
  },
  {
    codeHints: ['6220'],
    keywords: ['租金', '房租', '租賃', 'rent', 'lease']
  },
  {
    codeHints: ['6150'],
    keywords: ['修繕', '維修', '保養', 'repair', 'maintenance']
  },
  {
    codeHints: ['6180'],
    keywords: ['保險', 'insurance']
  },
  {
    codeHints: ['6190'],
    keywords: ['訓練', '課程', '教育', 'training', 'course']
  },
  {
    codeHints: ['6230'],
    keywords: ['雜項', '其他']
  }
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function findAccountByHints(accounts, hints) {
  return hints.map(code => accounts.find(account => account.code === code)).find(Boolean);
}

function getFallbackClassification(accounts, description = '', vendor = '') {
  const text = normalizeText(`${description} ${vendor}`);
  const hit = KEYWORD_RULES.find(rule => rule.keywords.some(keyword => text.includes(normalizeText(keyword))));
  const account = hit ? findAccountByHints(accounts, hit.codeHints) : null;

  if (account) {
    return {
      accountCode: account.code,
      accountName: account.name,
      needsReview: false,
      explanation: `Matched by keyword rule: ${account.code} ${account.name}.`
    };
  }

  const misc = accounts.find(account => account.code === '6230') || accounts.find(account => account.type === 'expense');
  return {
    accountCode: misc?.code || '',
    accountName: misc?.name || '',
    needsReview: true,
    explanation: 'No confident keyword match. Please review the account manually; do not rely on miscellaneous expense unless it is truly appropriate.'
  };
}

function parseAiJson(text) {
  const cleanJson = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, message: 'Only POST is allowed.' });
    return;
  }

  try {
    const supabaseAdmin = createAdminClient();
    const auth = await requireAuthenticatedUser(req, supabaseAdmin);
    if (!auth.ok) {
      json(res, auth.status, { ok: false, message: auth.message });
      return;
    }

    const { description = '', vendor = '', amount = 0 } = req.body || {};

    const { data: accounts, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('code, name, type')
      .eq('type', 'expense')
      .order('code');
    if (accountError) throw accountError;

    const accountList = accounts || [];
    const fallbackSuggestion = getFallbackClassification(accountList, description, vendor);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      json(res, 200, { ok: true, mode: 'fallback', suggestion: fallbackSuggestion });
      return;
    }

    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const accountOptions = accountList.map(account => `${account.code} ${account.name}`).join('\n');
      const prompt = `
You are classifying one reimbursement line into the best accounting expense account.
Return only JSON. Do not use Markdown.

Available expense accounts:
${accountOptions}

Rules:
- 車馬費, 交通費, 住宿費, taxi, train, MRT, hotel and business travel usually map to 差旅費 if that account exists.
- 餐費, coffee, restaurant and entertainment usually map to 交際費 or the closest meal/entertainment account.
- Office supplies should map to 文具用品 or the closest office supply account.
- Software, cloud service, SaaS, equipment license and authorization should map to the closest equipment/software/license account.
- Professional, legal, accounting and consulting services should map to the closest professional service account.
- Do not default to 雜項支出 unless none of the available accounts fit.
- If the confidence is low, still choose the closest valid account and set needsReview to true.

Line description: ${description || '(empty)'}
Vendor/counterparty: ${vendor || '(empty)'}
Amount: NT$ ${amount}

Expected JSON:
{"accountCode":"account code from list","accountName":"account name from list","needsReview":false,"explanation":"short reason"}
`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const parsed = parseAiJson(response.text);
      const account = accountList.find(item => item.code === parsed.accountCode);
      if (!account) throw new Error('AI returned an account code that is not in the account list.');

      json(res, 200, {
        ok: true,
        mode: 'ai',
        suggestion: {
          accountCode: account.code,
          accountName: account.name,
          needsReview: Boolean(parsed.needsReview),
          explanation: parsed.explanation || `Selected ${account.code} ${account.name}.`
        }
      });
    } catch (aiError) {
      console.error('AI classification failed, using fallback:', aiError);
      json(res, 200, { ok: true, mode: 'fallback_error', suggestion: fallbackSuggestion });
    }
  } catch (error) {
    json(res, 500, { ok: false, message: `Classification failed: ${error.message}` });
  }
};
