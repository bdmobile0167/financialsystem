const COUNTER_KEY = 'voucherCounters';

function loadCounters() {
  return JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}');
}
function saveCounters(counters) {
  localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
}

// 收據類自動編號：RC-202607-0001，每月重新從 0001 開始，方便會計師按月核對
export function generateReceiptVoucherNumber(dateStr) {
  const monthKey = (dateStr || new Date().toISOString()).slice(0, 7).replace('-', '');
  const counters = loadCounters();
  const current = (counters[monthKey] || 0) + 1;
  counters[monthKey] = current;
  saveCounters(counters);
  return `RC-${monthKey}-${String(current).padStart(4, '0')}`;
}

// 依憑證類型決定最終編號：發票用使用者輸入的統一發票號碼；收據沒填就自動產生
export function resolveVoucherNumber(voucherType, inputNumber, dateStr) {
  if (voucherType === '發票') {
    return (inputNumber || '').trim().toUpperCase();
  }
  if (voucherType === '收據') {
    return (inputNumber || '').trim() || generateReceiptVoucherNumber(dateStr);
  }
  return '';
}