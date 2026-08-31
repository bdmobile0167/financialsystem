function toNumber(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(/,/g, '')) || 0;
}

function parseYushan187(lines) {
  const records = [];

  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line || line.includes('餘額') || line.includes('page:') || line.includes('合計')) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 9) continue;
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(tokens[1])) continue;

    const detail = tokens[4];
    const expense = tokens[5] !== '0' ? toNumber(tokens[5]) : 0;
    const income = tokens[6] !== '0' ? toNumber(tokens[6]) : 0;
    const balance = toNumber(tokens[7]);
    const counterparty = tokens.slice(8).join(' ').trim();

    records.push({ date: tokens[1], detail, expense, income, balance, counterparty });
  }

  return records;
}

function parseMegaGeneric(lines) {
  const moneyPattern = /\d{1,3}(?:,\d{3})*\.\d{2}/;
  const datePattern = /^\d{4}\/\d{2}\/\d{2}/;
  const datetimePattern = /\d{4}\/\d{2}\/\d{2}\(\d{2}:\d{2}:\d{2}\)/g;
  const noisePattern = /交易明細|帳號|Mega International|兆豐|頁次|列印|合計|餘額/;
  const headerPattern = /交易日期|摘要|支出|收入|交易金額|存入|提出/;

  const cleanDetail = text => String(text || '')
    .replace(datePattern, '')
    .replace(new RegExp(moneyPattern, 'g'), '')
    .replace(datetimePattern, '')
    .trim();

  const isMainTrade = tokens => tokens.some(token => datePattern.test(token)) && tokens.some(token => moneyPattern.test(token));
  const records = [];
  let buffer = [];
  let current = null;

  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line || noisePattern.test(line) || headerPattern.test(line)) continue;

    const tokens = line.split(/\s+/);
    const moneyTokens = tokens.filter(token => moneyPattern.test(token));

    if (isMainTrade(tokens)) {
      if (current) {
        current.detail = buffer.join(' ');
        records.push(current);
      }

      const dateToken = tokens.find(token => datePattern.test(token));
      const amount = moneyTokens.length ? toNumber(moneyTokens[0]) : 0;
      let income = 0;
      let expense = amount;
      let balance = null;

      if (moneyTokens.length === 2) {
        balance = toNumber(moneyTokens[1]);
      } else if (amount === 0 && moneyTokens.length >= 2) {
        income = toNumber(moneyTokens[1]);
        expense = 0;
      }

      current = {
        date: dateToken ? dateToken.slice(0, 10) : null,
        counterparty: '',
        detail: '',
        expense,
        income,
        balance
      };
      buffer = [cleanDetail(line)];
    } else if (current) {
      buffer.push(cleanDetail(line));
    }
  }

  if (current) {
    current.detail = buffer.join(' ');
    records.push(current);
  }

  return records;
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
    res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
    return;
  }

  try {
    const { fileBase64, bankCode } = req.body || {};
    if (!fileBase64 || !bankCode) {
      res.status(400).json({ ok: false, message: 'fileBase64 and bankCode are required.' });
      return;
    }

    const parser = PARSERS[bankCode];
    if (!parser) {
      res.status(400).json({ ok: false, message: `Unsupported bank parser: ${bankCode}` });
      return;
    }

    const pdfParse = require('pdf-parse');
    const buffer = Buffer.from(fileBase64, 'base64');
    const pdfData = await pdfParse(buffer);
    const records = parser(pdfData.text.split('\n'));

    res.status(200).json({ ok: true, count: records.length, records });
  } catch (error) {
    res.status(500).json({ ok: false, message: `Bank statement parse failed: ${error.message}` });
  }
};
