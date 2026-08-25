const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const KEYWORD_RULES = [
  { codeHints: ['6110'], keywords: ['車馬', '交通', '住宿', '旅費', '差旅', '高鐵', '台鐵', '捷運', '計程車', 'taxi', 'uber', '飯店', '旅館', 'hotel', '機票'] },
  { codeHints: ['6210'], keywords: ['餐飲', '交際', '餐費', '便當', '咖啡', '午餐', '晚餐', '聚餐', '招待', 'meal', 'restaurant'] },
  { codeHints: ['6130'], keywords: ['文具', '紙張', '影印', '列印', '墨水', '耗材', 'office supplies', 'stationery'] },
  { codeHints: ['6170'], keywords: ['郵電', '通訊', '電話', '網路', '電信', '郵資', '網域', 'domain', 'internet', 'phone'] },
  { codeHints: ['6200'], keywords: ['顧問', '勞務', '服務費', '專業服務', '律師', '會計師', 'consulting', 'consultant', 'service fee'] },
  { codeHints: ['6160'], keywords: ['廣告', 'facebook', 'google ads', 'meta ads', 'ig', '行銷', '投放', 'ads', 'advertising'] },
  { codeHints: ['6220'], keywords: ['租金', '房租', '場租', 'rent', 'lease'] },
  { codeHints: ['6150'], keywords: ['修繕', '維修', '保養', 'repair', 'maintenance'] },
  { codeHints: ['6180'], keywords: ['保險', 'insurance'] },
  { codeHints: ['6190'], keywords: ['教育', '訓練', '課程', '研習', 'training', 'course'] }
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function findAccountByHints(accounts, hints) {
  return hints
    .map(code => accounts.find(account => account.code === code))
    .find(Boolean);
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
      explanation: `依關鍵字比對，建議歸類為「${account.code} ${account.name}」。`
    };
  }

  const misc = accounts.find(account => account.code === '6230') || accounts.find(account => account.type === 'expense');
  return {
    accountCode: misc?.code || '',
    accountName: misc?.name || '',
    needsReview: true,
    explanation: '未比對到明確費用類型，暫以最低信心建議，請會計人工覆核或新增更精確的會計科目。'
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: '只允許 POST' });
    return;
  }
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    res.status(500).json({ ok: false, message: 'Supabase server-side key 尚未設定' });
    return;
  }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ ok: false, message: '缺少登入權杖' });
      return;
    }
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      res.status(401).json({ ok: false, message: '登入權杖無效，請重新登入' });
      return;
    }

    const { description = '', vendor = '', amount = 0 } = req.body || {};

    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('accounts')
      .select('code, name, type')
      .eq('type', 'expense')
      .order('code');
    if (accErr) throw accErr;

    const fallbackSuggestion = getFallbackClassification(accounts || [], description, vendor);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(200).json({ ok: true, mode: 'fallback', suggestion: fallbackSuggestion });
      return;
    }

    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const accountList = (accounts || []).map(account => `${account.code} ${account.name}`).join('\n');
      const prompt = `
你是台灣公司內部報支的會計科目分類助手。請只從下列費用科目選一個最適合的代碼。

規則：
- 車馬費、交通費、住宿費、出差相關費用通常歸類為差旅費。
- 餐飲、招待、交際通常歸類為餐飲交際費。
- 文具、紙張、列印耗材通常歸類為文具用品費。
- 電話、網路、郵資通常歸類為郵電通訊費。
- 若不確定，仍需選最接近科目，但 needsReview 必須為 true；不要一律選雜項支出。
- 僅回傳 JSON，不要 Markdown。

可用科目：
${accountList}

報支內容：${description || '未提供'}
付款人：${vendor || '未提供'}
金額：NT$ ${amount}

JSON 格式：
{"accountCode":"科目代碼","accountName":"科目名稱","needsReview":false,"explanation":"20字以內理由"}
`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      const account = (accounts || []).find(item => item.code === parsed.accountCode);
      if (!account) throw new Error('AI 回傳不存在的會計科目');

      res.status(200).json({
        ok: true,
        mode: 'ai',
        suggestion: {
          accountCode: account.code,
          accountName: account.name,
          needsReview: Boolean(parsed.needsReview),
          explanation: parsed.explanation || `建議歸類為「${account.code} ${account.name}」。`
        }
      });
    } catch (aiErr) {
      console.error('AI 分類失敗，改用關鍵字規則:', aiErr);
      res.status(200).json({ ok: true, mode: 'fallback_error', suggestion: fallbackSuggestion });
    }
  } catch (error) {
    res.status(500).json({ ok: false, message: `分類失敗：${error.message}` });
  }
};
