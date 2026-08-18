import { supabase } from '../../../scripts/supabaseClient.js';

export async function renderDashboard() {
  const container = document.getElementById('dashboardContainer') || document.getElementById('dashboard');
  if (!container) return;

  const user = window.state?.currentUser;
  if (!user || !user.id) {
    container.innerHTML = '<p class="muted">請先登入</p>';
    return;
  }

  try {
    // 1. 從 Supabase 載入交易資料
    let txs = window.state?.transactions || [];
    
    // 如果 localStorage 沒有資料，從 Supabase 載入
    if (!txs.length) {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .order('tx_date', { ascending: false })
        .limit(100);
      
      if (!error && data) {
        txs = data.map(t => ({
          id: t.id,
          date: t.tx_date,
          bankAccountId: t.bank_account_id,
          detail: t.description || '',
          type: t.type,
          amount: Number(t.amount || 0),
          source: 'supabase'
        }));
        window.state.transactions = txs;
      }
    }

    // 2. 計算摘要數據
    const count = txs.length;
    const income = txs.filter(t => t.type === '收入').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = txs.filter(t => t.type === '支出').reduce((s, t) => s + Number(t.amount || 0), 0);
    const profit = income - expense;

    // 3. 組裝 HTML
    let html = `
      <div class="summary">
        <div class="summary-item">
          <span class="muted">交易筆數</span>
          <strong id="countValue">${count}</strong>
        </div>
        <div class="summary-item">
          <span class="muted">總收入</span>
          <strong id="incomeValue">$${income.toLocaleString()}</strong>
        </div>
        <div class="summary-item">
          <span class="muted">總支出</span>
          <strong id="expenseValue">$${expense.toLocaleString()}</strong>
        </div>
        <div class="summary-item">
          <span class="muted">本期淨利</span>
          <strong id="profitValue">$${profit.toLocaleString()}</strong>
        </div>
      </div>
      <div class="panel" style="margin-top: 16px;">
        <h3>最新交易</h3>
        <table>
          <thead>
            <tr><th>日期</th><th>銀行</th><th>明細</th><th>類型</th><th>金額</th><th>憑證</th></tr>
          </thead>
          <tbody id="dashboardTableBody">
    `;

    // 顯示最近 10 筆交易
    const recentTxs = txs.slice(0, 10);
    if (recentTxs.length === 0) {
      html += '<tr><td colspan="6" class="muted">目前尚無交易資料。</td></tr>';
    } else {
      recentTxs.forEach(tx => {
        const bankName = tx.bank || tx.bankAccountId || '-';
        const amount = Number(tx.amount || 0).toLocaleString();
        const typeLabel = tx.type || '-';
        const voucherLink = tx.voucher_id 
          ? `<a href="javascript:void(0)" onclick="viewVoucherDetail('${tx.voucher_id}')" style="color:#2563eb; font-weight:600;">${tx.voucher || '檢視'}</a>`
          : (tx.voucher || '<span class="muted">-</span>');
        
        html += `
          <tr>
            <td>${tx.date || '-'}</td>
            <td>${bankName}</td>
            <td>${tx.detail || '-'}</td>
            <td>${typeLabel}</td>
            <td>$${amount}</td>
            <td>${voucherLink}</td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error('Dashboard 失敗:', err);
    container.innerHTML = `<p style="color:red; padding:16px;">載入失敗：${err.message}</p>`;
  }
}
