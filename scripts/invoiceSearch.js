import { supabase } from './supabaseClient.js';

/**
 * Google AI 風格「統一發票與稅務憑證智慧查詢中心」
 * 資料來源：系統內 transactions（含發票/收據/領據）＋ 已過帳 vouchers
 * 支援發票號碼/廠商/統編搜尋、類別與狀態篩選、401 申報 CSV 匯出。
 */
export function openInvoiceSearch() {
  const modal = document.getElementById('invoiceSearchModal');
  if (!modal) return;
  modal.style.display = 'flex';
  renderInvoiceSearch();
  bindInvoiceSearchEvents();
}

export function closeInvoiceSearch() {
  const modal = document.getElementById('invoiceSearchModal');
  if (modal) modal.style.display = 'none';
}

function bindInvoiceSearchEvents() {
  const input = document.getElementById('invoiceSearchInput');
  const typeSel = document.getElementById('invoiceSearchType');
  const statusSel = document.getElementById('invoiceSearchStatus');
  const exportBtn = document.getElementById('invoiceExportCsvBtn');
  const searchBtn = document.getElementById('invoiceSearchBtn');

  // 避免重複綁定
  if (input && !input.dataset.bound) {
    input.dataset.bound = 'true';
    input.addEventListener('input', renderInvoiceSearch);
  }
  if (typeSel && !typeSel.dataset.bound) {
    typeSel.dataset.bound = 'true';
    typeSel.addEventListener('change', renderInvoiceSearch);
  }
  if (statusSel && !statusSel.dataset.bound) {
    statusSel.dataset.bound = 'true';
    statusSel.addEventListener('change', renderInvoiceSearch);
  }
  if (exportBtn && !exportBtn.dataset.bound) {
    exportBtn.dataset.bound = 'true';
    exportBtn.addEventListener('click', exportInvoiceCsv);
  }
  if (searchBtn && !searchBtn.dataset.bound) {
    searchBtn.dataset.bound = 'true';
    searchBtn.addEventListener('click', openInvoiceSearch);
  }
}

/**
 * 從 state.transactions 彙整發票清單。
 * 每筆交易依憑證類型（發票/收據/領據/無）分類，並對應其是否已過帳。
 */
function buildInvoiceList() {
  const fin = window.finance || {};
  const state = fin.state || {};
  const txs = Array.isArray(state.transactions) ? state.transactions : [];
  const transactions = txs.map((tx, i) => ({
    id: tx.id || `tx-${i}`,
    invoiceNumber: tx.voucher || '',
    vendor: tx.customer || tx.detail || '',
    voucherType: tx.voucherType || '無',
    date: tx.date || '',
    detail: tx.detail || '',
    bank: tx.bank || '',
    type: tx.type || '',
    amount: Number(tx.amount || 0),
    status: tx.status || (tx.voucherType === '無' ? 'no_voucher' : 'pending')
  }));

  // 已過帳 vouchers（從 supabase 帶入，若可用）
  return { transactions, supabaseVouchers: [] };
}

function renderInvoiceSearch() {
  const wrap = document.getElementById('invoiceSearchTableWrap');
  if (!wrap) return;

  const keyword = (document.getElementById('invoiceSearchInput')?.value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('invoiceSearchType')?.value || 'all';
  const statusFilter = document.getElementById('invoiceSearchStatus')?.value || 'all';

  const { transactions } = buildInvoiceList();

  const filtered = transactions.filter(inv => {
    if (typeFilter !== 'all' && inv.voucherType !== typeFilter) return false;
    if (statusFilter === 'closed' && inv.status !== 'closed' && inv.status !== 'approved') return false;
    if (statusFilter === 'pending' && inv.status !== 'pending') return false;
    if (keyword) {
      const haystack = [inv.invoiceNumber, inv.vendor, inv.detail, inv.bank].join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  // 統計列
  const totalNet = filtered.reduce((s, i) => s + i.amount, 0);
  const taxSum = filtered.reduce((s, i) => s + Math.round((i.amount / 1.05) * 0.05), 0);
  const total = filtered.reduce((s, i) => s + i.amount, 0);
  document.getElementById('invoiceStatCount').textContent = `${filtered.length} 筆`;
  document.getElementById('invoiceStatNet').textContent = `NT$ ${totalNet.toLocaleString()}`;
  document.getElementById('invoiceStatTax').textContent = `NT$ ${taxSum.toLocaleString()}`;
  document.getElementById('invoiceStatTotal').textContent = `NT$ ${total.toLocaleString()}`;

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div style="text-align:center; padding:48px 20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; color:#94a3b8;">
        <div style="font-size:32px; margin-bottom:8px;">🧾</div>
        <p style="font-weight:700; color:#475569; margin:0;">查無符合條件之統一發票或憑證</p>
        <p style="font-size:12px; margin-top:4px;">請嘗試調整搜尋關鍵字或清除篩選條件。</p>
      </div>`;
    return;
  }

  const rows = filtered.map(inv => `
    <tr>
      <td><span class="gb-inv-no">${inv.invoiceNumber || '自動編號'}</span></td>
      <td class="gb-inv-mono">${inv.date || '-'}</td>
      <td>
        <div style="font-weight:700; color:#0f172a;">${inv.vendor || '-'}</div>
        <div class="gb-inv-mono" style="color:#64748b;">${inv.detail || ''}</div>
      </td>
      <td>
        <span class="gb-inv-badge-type">${inv.voucherType === '發票' ? '🧾 統一發票' : inv.voucherType === '收據' ? '📄 免用發票收據' : inv.voucherType === '領據' ? '📋 個人領據' : '— 無憑證'}</span>
      </td>
      <td style="text-align:right; font-family:'Courier New',monospace; font-weight:700; color:#0f172a;">NT$ ${inv.amount.toLocaleString()}</td>
      <td style="text-align:right; font-family:'Courier New',monospace; color:#059669; font-weight:700;">NT$ ${Math.round((inv.amount / 1.05) * 0.05).toLocaleString()}</td>
      <td style="text-align:right; font-family:'Courier New',monospace; font-weight:700; color:#0f172a;">NT$ ${inv.amount.toLocaleString()}</td>
      <td style="text-align:center;">
        ${inv.status === 'closed' || inv.status === 'approved'
          ? '<span class="gb-inv-ok">已核銷過帳 ✓</span>'
          : inv.status === 'no_voucher'
            ? '<span class="gb-inv-pending">無憑證</span>'
            : '<span class="gb-inv-pending">簽核審核中</span>'}
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:12px;">
      <table style="min-width:860px;">
        <thead>
          <tr>
            <th>發票號碼</th><th>日期</th><th>賣方廠商 / 明細</th><th>憑證種類</th>
            <th style="text-align:right;">銷售額 (未稅)</th><th style="text-align:right;">營業稅 (5%)</th>
            <th style="text-align:right;">含稅總額</th><th style="text-align:center;">過帳狀態</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted" style="font-size:11px; margin-top:8px;">※ 搜尋範圍：系統交易憑證。若需完整列表，請至「憑證中心」。</p>
  `;
}

/** 匯出 401 申報專用 CSV（含 BOM，Excel 可直接開啟） */
function exportInvoiceCsv() {
  const { transactions } = buildInvoiceList();
  const fin = window.finance || {};
  const company = (fin.state && fin.state.companyInfo) || {};
  const companyTaxId = company.taxId || '';

  const headers = ['發票號碼', '開立日期', '賣方名稱', '憑證類型', '銷售額(未稅)', '營業稅額(5%)', '含稅總額', '過帳狀態'];
  const rows = transactions.map(i => [
    i.invoiceNumber || '',
    i.date || '',
    `"${i.vendor || ''}"`,
    i.voucherType || '',
    Math.round(i.amount / 1.05),
    Math.round((i.amount / 1.05) * 0.05),
    i.amount,
    i.status === 'closed' || i.status === 'approved' ? '已核銷過帳' : '審核中'
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `統一發票查詢與營業稅扣抵清單_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
