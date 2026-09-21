const DEFAULT_CURRENCY = 'TWD';

export function normalizeVoucherCurrency(value) {
  const code = String(value || DEFAULT_CURRENCY).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : DEFAULT_CURRENCY;
}

export function formatVoucherMoney(value, currency = DEFAULT_CURRENCY, currencies = []) {
  const code = normalizeVoucherCurrency(currency);
  const row = (currencies || []).find((item) => item.code === code);
  const decimals = Number.isInteger(Number(row?.decimal_places))
    ? Number(row.decimal_places)
    : (code === DEFAULT_CURRENCY || code === 'JPY' ? 0 : 2);
  return `${code} ${Number(value || 0).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

export function populateVoucherCurrencySelect(select, currencies, selectedCode = DEFAULT_CURRENCY) {
  if (!select) return;
  const rows = Array.isArray(currencies)
    ? currencies.filter((item) => item?.is_active !== false)
    : [];
  const available = rows.length
    ? rows
    : [{ code: DEFAULT_CURRENCY, name: 'New Taiwan Dollar', decimal_places: 0, is_active: true }];

  select.replaceChildren();
  for (const currency of available) {
    const option = document.createElement('option');
    option.value = normalizeVoucherCurrency(currency.code);
    option.textContent = `${option.value} - ${currency.name || option.value}`;
    select.appendChild(option);
  }

  const selected = normalizeVoucherCurrency(selectedCode);
  select.value = available.some((item) => normalizeVoucherCurrency(item.code) === selected)
    ? selected
    : DEFAULT_CURRENCY;
}

export async function fetchActiveVoucherCurrencies(client) {
  const { data, error } = await client
    .from('currencies')
    .select('code, name, symbol, decimal_places, is_active')
    .eq('is_active', true)
    .order('code');
  if (error) throw error;
  return data || [];
}

export async function fetchVoucherExchangeRate(client, currency, txDate) {
  const code = normalizeVoucherCurrency(currency);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(txDate || ''))) {
    throw new Error('請先選擇報支日期。');
  }
  const { data, error } = await client.rpc('get_exchange_rate', {
    p_currency_code: code,
    p_date: txDate
  });
  if (error) throw error;
  const rate = Number(data);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`找不到 ${code} 在 ${txDate} 可用的匯率，請先由會計在設定頁建立匯率。`);
  }
  return rate;
}

export function buildVoucherRatePreview(total, currency, rate, currencies = []) {
  const code = normalizeVoucherCurrency(currency);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return '尚未取得有效匯率';
  }
  if (code === DEFAULT_CURRENCY) {
    return '基準幣別 TWD，匯率 1';
  }
  const original = formatVoucherMoney(total, code, currencies);
  const base = formatVoucherMoney(Number(total || 0) * numericRate, DEFAULT_CURRENCY, currencies);
  return `${original} × ${numericRate.toLocaleString('zh-TW', { maximumFractionDigits: 6 })} = ${base}`;
}
