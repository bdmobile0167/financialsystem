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
export function resolveVoucherNumber(voucherType, manualNumber, date) {
  if (voucherType === '發票' && manualNumber) {
    return manualNumber; // 使用手動輸入的發票號碼
  }

  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  // 簡單序號（實際可改用 Supabase sequence 或查詢當日最大序號）
  const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0');

  return `VOU-${year}${month}${day}-${seq}`;
}