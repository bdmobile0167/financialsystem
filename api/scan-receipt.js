const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 費用類別對照（需與前端 grid-item-category 選項一致）
const CATEGORY_OPTIONS = ['車馬費', '住宿費', '文具用品', '餐飲交際', '郵電通訊', '設備與軟體授權', '專業服務費', '其他'];
const DOC_TYPE_OPTIONS = ['發票', '收據', '領據', '無'];

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(200).json({ ok: false, message: '尚未設定 GEMINI_API_KEY，無法使用 AI 掃描功能，請手動填寫。' });
      return;
    }

    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      res.status(400).json({ ok: false, message: '請提供憑證圖片（imageBase64）。' });
      return;
    }

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `你是熟悉台灣稅務憑證格式的資深會計師助理。請閱讀這張憑證圖片（可能是統一發票、收據或領據），盡量準確擷取以下資訊。

憑證種類請從這幾種中選一個最符合的：${DOC_TYPE_OPTIONS.join('、')}
費用類別請從這幾種中選一個最符合的：${CATEGORY_OPTIONS.join('、')}

請只回傳純 JSON，不要有 Markdown 符號或其他文字，格式如下（看不清楚或無法判斷的欄位請填 null，金額看不到就填 0）：
{
  "docType": "發票 | 收據 | 領據 | 無",
  "invoiceNumber": "發票或收據號碼，看不到填 null",
  "vendorName": "廠商或店家名稱，看不到填 null",
  "amount": 0,
  "txDate": "YYYY-MM-DD 格式的憑證日期，看不到填 null",
  "expenseCategory": "從費用類別清單中選一個",
  "confidence": "high | medium | low，代表你對這次擷取結果的信心程度"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }
          ]
        }
      ]
    });

    const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    // 驗證回傳值落在允許清單內，避免幻覺出不存在的分類
    if (parsed.docType && !DOC_TYPE_OPTIONS.includes(parsed.docType)) parsed.docType = null;
    if (parsed.expenseCategory && !CATEGORY_OPTIONS.includes(parsed.expenseCategory)) parsed.expenseCategory = null;

    res.status(200).json({ ok: true, extracted: parsed });
  } catch (error) {
    console.error('AI 憑證掃描失敗:', error);
    res.status(200).json({ ok: false, message: `AI 掃描失敗（${error.message}），請手動填寫。` });
  }
};
