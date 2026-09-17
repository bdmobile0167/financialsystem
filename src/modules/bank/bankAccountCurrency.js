export function populateBankCurrencySelect(select, currencies, selectedCode = 'TWD') {
  if (!select) return;
  const rows = Array.isArray(currencies) && currencies.length
    ? currencies
    : [{ code: 'TWD', name: 'New Taiwan Dollar', is_active: true }];
  const ownerDocument = select.ownerDocument || document;
  select.replaceChildren(...rows.map(currency => {
    const option = ownerDocument.createElement('option');
    option.value = String(currency.code || '').trim();
    option.textContent = `${option.value} - ${String(currency.name || option.value)}${currency.is_active ? '' : '（停用）'}`;
    option.disabled = currency.is_active === false;
    return option;
  }));
  const requested = String(selectedCode || 'TWD').trim() || 'TWD';
  select.value = rows.some(currency => currency.code === requested) ? requested : 'TWD';
}

export function setBankCurrencyLock(select, hint, options = {}) {
  const currency = options.currency || 'TWD';
  const locked = options.locked ?? options.currency_locked ?? false;
  if (select) {
    select.value = currency || 'TWD';
    select.disabled = Boolean(locked);
  }
  if (hint) {
    hint.textContent = locked
      ? '此帳戶已有餘額或關聯資料，幣別不可變更。'
      : '帳戶首次產生餘額或關聯資料後，幣別會鎖定。';
  }
}
