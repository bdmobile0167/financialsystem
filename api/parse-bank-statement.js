function toNumber(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(/,/g, '')) || 0;
}

function parseYushan187(lines) {
  const records = [];
  const balanceLabel = '\u9918\u984d';
  const totalLabel = '\u5408\u8a08';

  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line || line.includes(balanceLabel) || line.includes('page:') || line.includes(totalLabel)) continue;

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
  const noisePattern = new RegExp([
    '\u4ea4\u6613\u660e\u7d30',
    '\u5e33\u865f',
    'Mega International',
    '\u5146\u8c50',
    '\u9801\u6b21',
    '\u5217\u5370',
    '\u5408\u8a08',
    '\u9918\u984d'
  ].join('|'));
  const headerPattern = new RegExp([
    '\u4ea4\u6613\u65e5\u671f',
    '\u6458\u8981',
    '\u652f\u51fa',
    '\u6536\u5165',
    '\u4ea4\u6613\u91d1\u984d',
    '\u5b58\u5165',
    '\u63d0\u51fa'
  ].join('|'));

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
  ['\u7389\u5c71187']: parseYushan187,
  ['\u5146\u8c50347']: parseMegaGeneric,
  ['\u5146\u8c50703']: parseMegaGeneric,
  ['\u5146\u8c50182']: parseMegaGeneric,
  ['\u5146\u8c50697']: parseMegaGeneric
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
