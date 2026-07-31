const pdfParse = require('pdf-parse');

function toNumber(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/,/g, '')) || 0;
}

// 玉山187 解析器
function parseYushan187(lines) {
  const recs = [];
  for (const raw of lines) {
    const line = (raw || '').trim();
    if (!line || line.includes('總計') || line.includes('page:') || line.includes('提')) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 9) continue;
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(tokens[1])) continue;

    const summary = tokens[4];
    const expense = tokens[5] !== '0' ? toNumber(tokens[5]) : 0;
    const income = tokens[6] !== '0' ? toNumber(tokens[6]) : 0;
    const balance = toNumber(tokens[7]);
    const rawClient = tokens.slice(8).join(' ').trim();
    const spaceIdx = rawClient.indexOf(' ');
    const counterparty = spaceIdx > -1 ? `${rawClient.slice(0, spaceIdx)}｜${rawClient.slice(spaceIdx + 1)}` : rawClient;

    recs.push({ date: tokens[1], detail: summary, expense, income, balance, counterparty });
  }
  return recs;
}

// 兆豐系列共用解析器（347/182/697/703 邏輯共通）
function parseMegaGeneric(lines) {
  const MONEY = /\d{1,3}(?:,\d{3})*\.\d{2}/;
  const DATE = /^\d{4}\/\d{2}\/\d{2}/;
  const DATETIME = /\d{4}\/\d{2}\/\d{2}\(\d{2}:\d{2}:\d{2}\)/;
  const NOISE = /本頁合計|累計|Mega International|存款明細表|查詢人員|查詢時間|帳號|設帳行|戶名|第\d頁\/共\d頁/;
  const HEADER = /帳務日期|摘要|存入金額|支出金額|帳戶餘額|交易日期/;

  const cleanDetail = (text) => text.replace(DATE, '').replace(new RegExp(MONEY, 'g'), '').replace(new RegExp(DATETIME, 'g'), '').trim();
  const isMainTrade = (tokens) => tokens.some(t => DATE.test(t)) && tokens.some(t => MONEY.test(t));

  const recs = [];
  let buffer = [];
  let current = null;

  for (const raw of lines) {
    const line = (raw || '').trim();
    if (!line || NOISE.test(line) || HEADER.test(line)) continue;

    const tokens = line.split(/\s+/);
    const moneyTokens = tokens.filter(t => MONEY.test(t));

    if (isMainTrade(tokens)) {
      if (current) { current.detail = buffer.join('｜'); recs.push(current); }

      const dateToken = tokens.find(t => DATE.test(t));
      const amount = moneyTokens.length ? toNumber(moneyTokens[0]) : 0;
      let income = 0, expense = amount, balance = null;
      if (moneyTokens.length === 2) {
        balance = toNumber(moneyTokens[1]);
      } else if (amount === 0 && moneyTokens.length >= 2) {
        income = toNumber(moneyTokens[1]);
        expense = 0;
      }
      current = { date: dateToken ? dateToken.slice(0, 10) : null, counterparty: '', detail: '', expense, income, balance };
      buffer = [cleanDetail(line)];
    } else if (current) {
      buffer.push(cleanDetail(line));
    }
  }
  if (current) { current.detail = buffer.join('｜'); recs.push(current); }
  return recs;
}

const PARSERS = {
  '玉山187': parseYushan187,
  '兆豐347': parseMegaGeneric,
  '兆豐703': parseMegaGeneric,
  '兆豐182': parseMegaGeneric,
  '兆豐697': parseMegaGeneric
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: '只允許 POST 請求。' });
    return;
  }
  try {
    const { fileBase64, bankCode } = req.body || {};
    if (!fileBase64 || !bankCode) {
      res.status(400).json({ ok: false, message: '缺少檔案或銀行別。' });
      return;
    }
    const parser = PARSERS[bankCode];
    if (!parser) {
      res.status(400).json({ ok: false, message: `尚未支援的銀行別：${bankCode}` });
      return;
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const pdfData = await pdfParse(buffer);
    const lines = pdfData.text.split('\n');
    const records = parser(lines);

    res.status(200).json({ ok: true, count: records.length, records });
  } catch (error) {
    res.status(500).json({ ok: false, message: `解析失敗：${error.message}` });
  }
};