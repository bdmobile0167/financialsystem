const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 關鍵字規則式分類（沒有設定 GEMINI_API_KEY 時使用，或 AI 呼叫失敗時的備援）
// 對照的是系統實際的會計科目代碼（accounts 資料表），而非固定寫死的示範資料。
const KEYWORD_RULES = [
  { keywords: ['機票', '高鐵', '台鐵', '出差', '飯店', '旅館', '計程車', 'uber', '住宿'], code: '6110' }, // 差旅費
  { keywords: ['廣告', 'facebook', 'fb', 'google ads', '行銷', '投放', 'ads', 'ig'], code: '6160' }, // 廣告費
  { keywords: ['房租', '租金', '辦公室租', '車位租', '場地租'], code: '6220' }, // 租金支出
  { keywords: ['文具', '影印紙', '碳粉', '辦公用品', '耗材'], code: '6130' }, // 文具用品費
  { keywords: ['水費', '電費', '瓦斯費', '台電', '自來水'], code: '6140' }, // 水電瓦斯費
  { keywords: ['修繕', '維修', '保養'], code: '6150' }, // 修繕費
  { keywords: ['電話費', '網路費', '郵資', '快遞', '通訊費'], code: '6170' }, // 郵電通訊費
  { keywords: ['保險費', '保費'], code: '6180' }, // 保險費
  { keywords: ['訓練', '課程', '講師', '教育'], code: '6190' }, // 教育訓練費
  { keywords: ['顧問', '諮詢服務', '外包服務'], code: '6200' }, // 顧問服務費
  { keywords: ['餐費', '聚餐', '交際', '飲料', '咖啡', '請客戶'], code: '6210' }, // 餐飲交際費
  { keywords: ['業務推廣', '展覽', '攤位', '禮品', '贈品'], code: '6120' }, // 業務推廣費
];

function getFallbackClassification(accounts, description = '', vendor = '') {
  const text = `${description} ${vendor}`.toLowerCase();
  const hit = KEYWORD_RULES.find(rule => rule.keywords.some(k => text.includes(k.toLowerCase())));
  const code = hit ? hit.code : '6230'; // 找不到就歸類到雜項支出
  const account = accounts.find(a => a.code === code) || accounts.find(a => a.code === '6230');
  return {
    accountCode: account?.code || '6230',
    accountName: account?.name || '雜項支出',
    explanation: hit ? `依關鍵字比對，歸類為「${account?.name}」。` : '未比對到明確類別，暫歸類為「雜項支出」，請人工複核。'
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: '只允許 POST 請求。' });
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ ok: false, message: 'Supabase 環境變數未設定。' });
    return;
  }

  try {
    // 僅限已登入使用者呼叫
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ ok: false, message: '未登入。' });
      return;
    }
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      res.status(401).json({ ok: false, message: '登入狀態已失效，請重新登入。' });
      return;
    }

    const { description = '', vendor = '', amount = 0 } = req.body || {};

    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('accounts').select('code, name, type').eq('type', 'expense').order('code');
    if (accErr) throw accErr;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(200).json({ ok: true, mode: 'fallback', suggestion: getFallbackClassification(accounts, description, vendor) });
      return;
    }

    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const accountList = accounts.map(a => `${a.code} ${a.name}`).join('、');
      const prompt = `你是熟悉台灣稅務與會計實務的資深會計師。請依據以下報支單據內容，從「可用會計科目清單」中選出最適合的一個費用科目：

單據描述：${description || '無詳細描述'}
廠商/店家：${vendor || '未註明'}
金額：NT$ ${amount}

可用會計科目清單（僅能從中選擇，不可自創）：
${accountList}

請只回傳純 JSON，格式如下，不要有 Markdown 符號或其他文字：
{"accountCode": "科目代碼", "accountName": "科目名稱", "explanation": "約30字的分類理由"}`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      // 驗證 AI 回傳的科目代碼確實存在，避免幻覺出不存在的科目
      const valid = accounts.some(a => a.code === parsed.accountCode);
      if (!valid) throw new Error('AI 回傳的科目代碼不在系統清單中');

      res.status(200).json({ ok: true, mode: 'ai', suggestion: parsed });
    } catch (aiErr) {
      console.error('AI 分類失敗，改用關鍵字規則:', aiErr);
      res.status(200).json({ ok: true, mode: 'fallback_error', suggestion: getFallbackClassification(accounts, description, vendor) });
    }
  } catch (error) {
    res.status(500).json({ ok: false, message: `伺服器發生錯誤：${error.message}` });
  }
};
