const { createAdminClient, json, requireAuthenticatedUser } = require('./_supabaseServer');

const CATEGORY_OPTIONS = [
  '車馬費',
  '住宿費',
  '文具用品',
  '餐飲交際',
  '郵電通訊',
  '設備與軟體授權',
  '專業服務費',
  '其他'
];

const DOC_TYPE_OPTIONS = ['發票', '收據', '憑證', '其他'];

function parseAiJson(text) {
  const cleanJson = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, message: 'Only POST is allowed.' });
    return;
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createAdminClient();
  } catch (error) {
    json(res, 500, { ok: false, message: error.message });
    return;
  }

  try {
    const auth = await requireAuthenticatedUser(req, supabaseAdmin);
    if (!auth.ok) {
      json(res, auth.status, { ok: false, message: auth.message });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      json(res, 200, { ok: false, message: 'GEMINI_API_KEY is not configured. Please enter receipt details manually.' });
      return;
    }

    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      json(res, 400, { ok: false, message: 'imageBase64 is required.' });
      return;
    }

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Analyze this reimbursement receipt image and return one compact JSON object only.
Use Traditional Chinese values where requested.

Allowed docType values: ${DOC_TYPE_OPTIONS.join('、')}
Allowed expenseCategory values: ${CATEGORY_OPTIONS.join('、')}

Classification rules:
- 車馬費: taxi, ride share, train, MRT, flight, parking, toll, travel transport.
- 住宿費: hotel, lodging, accommodation.
- 文具用品: office supplies, stationery, consumables.
- 餐飲交際: meals, coffee, restaurants, entertainment.
- 郵電通訊: postage, phone, internet, domain, communication fees.
- 設備與軟體授權: hardware, software, SaaS, license, subscription.
- 專業服務費: consulting, legal, accounting, professional service.
- 其他: only when no better category fits.

Return JSON with this exact shape:
{
  "docType": "發票 | 收據 | 憑證 | 其他",
  "invoiceNumber": "string or null",
  "vendorName": "string or null",
  "amount": 0,
  "txDate": "YYYY-MM-DD or null",
  "expenseCategory": "one allowed expenseCategory",
  "confidence": "high | medium | low"
}
`;

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

    const parsed = parseAiJson(response.text);
    if (parsed.docType && !DOC_TYPE_OPTIONS.includes(parsed.docType)) parsed.docType = null;
    if (parsed.expenseCategory && !CATEGORY_OPTIONS.includes(parsed.expenseCategory)) parsed.expenseCategory = null;

    json(res, 200, { ok: true, extracted: parsed });
  } catch (error) {
    console.error('receipt scan failed:', error);
    json(res, 200, { ok: false, message: `Receipt scan failed: ${error.message}. Please enter details manually.` });
  }
};
