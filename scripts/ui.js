import { supabase } from './supabaseClient.js';
import { getCurrentMonthVoucherSummary } from '../src/modules/voucher/voucherSummary.js';
import { defaultState, loadState, saveState, SAMPLE_DATA, USER_KEY } from './state.js';
import { isAdminUser } from './auth.js';
import { summarizeTransactions, buildJournal, buildIncomeStatement, buildBalanceSheet, buildCashflowStatement, buildEquityStatement, getEquityAnalysis } from './reports.js';
import { saveAttachment, openAttachment } from '../src/modules/voucher/attachments.js';
import { signInWithSupabase, getCurrentSessionUser, changeMyPassword, signOutSupabase } from './auth.js';
import { loadBankAccounts, addBankAccount, deleteBankAccount, getBankBalance } from '../src/modules/bank/bankAccounts.js';
import { resolveVoucherNumber } from '../src/modules/voucher/voucherNumbering.js';
import { loadBudgetTargets, setBudgetTarget, buildBudgetReport } from '../src/modules/budget/budget.js';
import { fetchAccounts, fetchBankAccounts, fetchDepartments, fetchMyVouchers, fetchWorkflowLogs, createVoucher, managerApprove, managerReject, accountingApprove, accountingReject } from '../src/modules/voucher/voucherApi.js';
import { fetchAllUsers, updateUserProfile, toggleUserActive, inviteNewUser } from '../src/modules/admin/adminApi.js';

const ROLE_LABELS = { admin: '管理員', accounting: '會計部門', manager: '部門主管', employee: '一般專員' };

async function populateInviteDepartmentSelect() {
  const select = document.getElementById('inviteDepartment');
  if (!select) return;
  const departments = await fetchDepartments();
  select.innerHTML = departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function renderAdminUserTable() {
  const body = document.getElementById('adminUserTableBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="6" class="muted">載入中…</td></tr>';
  try {
    const users = await fetchAllUsers();
    body.innerHTML = users.map(u => `
      <tr>
        <td>${u.email}</td>
        <td>${u.full_name || '-'}</td>
        <td>
          <select class="role-select" data-id="${u.id}">
            ${Object.entries(ROLE_LABELS).map(([val, label]) => `<option value="${val}" ${u.role === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </td>
        <td>${u.department?.name || '未設定'}</td>
        <td>${u.active === false ? '<span class="badge wait">已停用</span>' : '<span class="badge">啟用中</span>'}</td>
        <td><button class="secondary toggle-active-btn" data-id="${u.id}" data-active="${u.active !== false}">${u.active === false ? '啟用' : '停用'}</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">尚無使用者資料。</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" class="muted">載入失敗：${error.message}</td></tr>`;
  }
}

const STATUS_LABELS = {
  pending_review: '待主管審核',
  manager_rejected: '主管退回',
  pending_accounting: '待會計核准',
  accounting_rejected: '會計退回',
  approved: '已核准入帳',
  cancelled: '已撤銷'
};

const state = { ...defaultState };

function getBankNickname(bankAccountId, accounts = []) {
  const account = accounts.find(a => a.id === bankAccountId);
  return account ? account.nickname : '未設定';
}

function populateBankSelect(selectEl, accounts = []) {
  if (!selectEl) return;
  if (!accounts || !Array.isArray(accounts)) accounts = [];
  if (accounts.length === 0) {
    selectEl.innerHTML = '<option value="">尚未設定銀行帳戶</option>';
    return;
  }
  selectEl.innerHTML = accounts.map(a => 
    `<option value="${a.id}">${a.nickname || a.bank_name || '未命名'}</option>`
  ).join('');
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function showMessage(text, isError = false) {
  const el = document.getElementById('loginMessage');
  if (!el) return;
  el.className = `message ${isError ? 'error' : 'success'}`;
  el.textContent = text;
}

function render() {
  function updateAdminNavVisibility() {
    const btn = document.getElementById('adminUsersNavBtn');
    if (btn) btn.style.display = state.currentUser?.role === 'admin' ? 'block' : 'none';
  }
  // 只給 Admin 顯示的區塊
  const adminOnlyElements = ['departmentForm', 'inviteUserForm', /* 其他 Admin 專屬 ID */];
  adminOnlyElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = state.currentUser?.role === 'admin' ? 'block' : 'none';
  });
  const passwordEmail = document.getElementById('passwordUserEmail');
  if (state.currentUser) {
    setText('#welcomeText', `歡迎，${state.currentUser.name}`);
    if (passwordEmail) passwordEmail.value = state.currentUser.username || '';
  } else {
    setText('#welcomeText', '歡迎，使用者');
  }
  document.getElementById('systemName').value = state.systemName;
  document.title = `${state.systemName} | Netlify Demo`;

  updateAdminNavVisibility();
  renderDashboard();
  renderTransactionTable();
  renderReports();
  renderCompanyData();
  fillCompanyInfoForm();
  renderBusinessData();
  updateSettings();
  renderBankAccounts();
  renderVoucherCenter();
  renderBudget();
  renderEquityTab();
  renderTabs();
  populateProjectDepartmentSelect();
  renderProjectList();
  loadAndRenderProjects();
}

function renderCompanyData() {
  const container = document.getElementById('companyInfoContent');
  if (!container) return;
  const info = state.companyInfo || {};
  const entries = [
    ['公司名稱（中文）', info.companyNameZh],
    ['公司名稱（英文）', info.companyNameEn],
    ['公司地址', info.address],
    ['公司電話', info.phone],
    ['統一編號', info.taxId],
    ['預查編號', info.precheckNumber],
    ['預定開業日期', info.plannedOpenDate],
    ['資本總額', info.totalCapital?.toLocaleString()],
    ['董事人數', info.boardCount],
    ['代表人', info.representativeName],
    ['章程訂定日期', info.articlesDate],
    ['資本-現金', info.capitalCash?.toLocaleString()],
    ['資本-財產', info.capitalProperty?.toLocaleString()],
    ['資本-技術', info.capitalTechnology?.toLocaleString()],
    ['資本-合併新設', info.capitalMergeNew?.toLocaleString()],
    ['合併公司名稱', info.mergedCompanyName],
    ['合併公司統編', info.mergedCompanyTaxId],
    ['合併基準日', info.mergedCompanyBaseDate]
  ];
  container.innerHTML = entries
    .map(([label, value]) => `<div class="info-row"><strong>${label}</strong><span>${value ?? '-'}</span></div>`)
    .join('');
}

function fillCompanyInfoForm() {
  const info = state.companyInfo || {};
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };
  setVal('companyNameZh', info.companyNameZh);
  setVal('companyNameEn', info.companyNameEn);
  setVal('companyTaxId', info.taxId);
  setVal('companyPhone', info.phone);
  setVal('companyAddress', info.address);
  setVal('companyRepresentative', info.representativeName);
  setVal('companyBoardCount', info.boardCount);
  setVal('companyTotalCapital', info.totalCapital);
  setVal('companyOpenDate', info.plannedOpenDate);
}

function renderBusinessData() {
  const container = document.getElementById('businessInfoContent');
  if (!container) return;
  const businessRows = (state.businessItems || []).map(item => `<li>${item.code} - ${item.item}</li>`).join('');
  const directorRows = (state.directorShareholders || []).map(person => `<li>姓名：${person.name} / 職務：${person.role} / 身分證：${person.idNumber} / 出資：${Number(person.amount).toLocaleString()} / 地址：${person.address}</li>`).join('');
  container.innerHTML = `
    <div class="info-block">
      <h4>營業項目</h4>
      <ul>${businessRows}</ul>
    </div>
    <div class="info-block">
      <h4>董監名單</h4>
      <ul>${directorRows}</ul>
    </div>
  `;
}

// === Dashboard 專案過濾版 ===
function renderDashboard() {
  // 預設顯示最近 2 年
  if (!state.reportStartDate) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    // 可套用在 filter
  }
  const userRole = state.currentUser?.role;
  let txs = state.transactions || [];

  // 權限過濾
  if (['accounting', 'admin'].includes(userRole)) {
    // 可看全公司或指定專案
    if (state.currentProjectId && state.currentProjectId !== 'all') {
      txs = txs.filter(tx => tx.project_id === state.currentProjectId);
    }
  } else {
    // 一般員工/主管只能看自己專案
    const userProjectId = state.currentUser?.project_id || state.currentProjectId;
    if (userProjectId) {
      txs = txs.filter(tx => tx.project_id === userProjectId);
    } else {
      txs = []; // 無專案則顯示空
    }
  }

  const summary = summarizeTransactions(txs);

  // 顯示總計（只有財務角色顯示完整數字）
  if (['accounting', 'admin'].includes(userRole)) {
    setText('#countValue', txs.length);
    setText('#incomeValue', summary.revenue.toLocaleString());
    setText('#expenseValue', summary.expense.toLocaleString());
    setText('#profitValue', summary.netProfit.toLocaleString());
  } else {
    setText('#countValue', txs.length);
    setText('#incomeValue', '—');
    setText('#expenseValue', '—');
    setText('#profitValue', summary.netProfit.toLocaleString()); // 只顯示淨利
  }

  const body = document.getElementById('dashboardTableBody');
  if (!body) return;
  body.innerHTML = '';

  const recent = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  if (!recent.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">目前尚無專案交易資料。</td></tr>';
    return;
  }

  recent.forEach(tx => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${tx.date}</td><td>${getBankNickname(tx.bankAccountId)}</td><td>${tx.detail}</td><td>${tx.type}</td><td>${Number(tx.amount).toLocaleString()}</td><td>${tx.voucher ? `<span class="badge">${tx.voucher}</span>` : '<span class="badge wait">待補</span>'}</td>`;
    body.appendChild(row);
  });
}

function renderTransactionTable() {
  let txs = state.transactions || [];
  
  // 專案過濾
  if (state.currentProjectId && state.currentProjectId !== 'all') {
    txs = txs.filter(tx => tx.project_id === state.currentProjectId);
  }

  const body = document.getElementById('transactionTableBody');
  if (!body) return;
  
  body.innerHTML = '';
  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="8" class="muted">目前尚無交易資料。</td></tr>';
    return;
  }
  
  txs.forEach((tx, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${tx.date}</td><td>${getBankNickname(tx.bankAccountId)}</td><td>${tx.detail}<div class="muted">${tx.customer || ''}</div></td><td>${tx.type}</td><td>${tx.category || '營業'}</td><td>${Number(tx.amount).toLocaleString()}</td><td>${tx.voucher ? `<span class="badge">${tx.voucher}</span>` : '<span class="badge wait">待補</span>'}</td><td><button class="secondary delete-btn" data-index="${index}">刪除</button></td>`;
    body.appendChild(row);
  });
}

function getReportPeriodTransactions() {
  const start = document.getElementById('reportPeriodStart')?.value;
  const end = document.getElementById('reportPeriodEnd')?.value;
  if (!start && !end) return state.transactions;
  return state.transactions.filter(tx => {
    if (start && tx.date < start) return false;
    if (end && tx.date > end) return false;
    return true;
  });
}

function renderReportLetterhead(elementId, reportTitle) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const start = document.getElementById('reportPeriodStart')?.value;
  const end = document.getElementById('reportPeriodEnd')?.value;
  const periodText = start && end ? `${start} 至 ${end}` : (start ? `${start} 起` : (end ? `截至 ${end}` : '全部歷史資料'));
  const today = new Date().toLocaleDateString('zh-TW');
  const company = state.companyInfo || {};
  el.innerHTML = `
    <div class="report-company">${company.companyNameZh || '（尚未設定公司名稱）'}</div>
    <div class="report-meta">統一編號：${company.taxId || '-'}</div>
    <div class="report-title">${reportTitle}</div>
    <div class="report-period">期間：${periodText}</div>
    <div class="report-printdate">列印日期：${today}</div>
  `;
}

function renderReportSignature(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = `
    <div class="sign-box">製表</div>
    <div class="sign-box">會計</div>
    <div class="sign-box">主管</div>
  `;
}

function renderReports() {
  let periodTx = getReportPeriodTransactions();
  
  // 專案過濾
  if (state.currentProjectId && state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === state.currentProjectId);
  }

  renderReportLetterhead('incomeLetterhead', '損益表');
  renderTable('incomeTable', buildIncomeStatement(periodTx));
  renderReportSignature('incomeSignature');

  renderReportLetterhead('balanceLetterhead', '資產負債表');
  renderTable('balanceTable', buildBalanceSheet(periodTx));
  renderReportSignature('balanceSignature');

  renderReportLetterhead('cashflowLetterhead', '現金流量表');
  renderTable('cashflowTable', buildCashflowStatement(periodTx));
  renderReportSignature('cashflowSignature');

  renderReportLetterhead('equityLetterhead', '權益變動表');
  renderTable('equityTable', buildEquityStatement(periodTx));
  renderReportSignature('equitySignature');

  const analysis = getEquityAnalysis(periodTx);
  const note = document.getElementById('fundraisingNote');
  if (note) {
    note.textContent = `現金水位：${analysis.cashBalance.toLocaleString()}｜可撐月數：${analysis.cashRunwayMonths ? analysis.cashRunwayMonths.toFixed(1) + ' 個月' : '尚無支出紀錄'}｜建議：${analysis.fundraisingSuggestion}`;
  }

  renderJournalFiltered();

  // 最新交易也只顯示該專案
  const body = document.getElementById('dashboardTableBody');
  // ... 後續渲染使用 txs 而非 state.transactions
}

async function exportReportsToExcel() {
  showMessage('正在產生 Excel，請稍候…');
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');

  const periodTx = getReportPeriodTransactions();
  const company = state.companyInfo || {};
  const start = document.getElementById('reportPeriodStart')?.value;
  const end = document.getElementById('reportPeriodEnd')?.value;
  const periodText = start && end ? `${start} 至 ${end}` : (start ? `${start} 起` : (end ? `截至 ${end}` : '全部歷史資料'));
  const printDate = new Date().toLocaleDateString('zh-TW');

  const wb = XLSX.utils.book_new();

  function addStatementSheet(sheetName, title, rows) {
    const aoa = [
      [company.companyNameZh || '（尚未設定公司名稱）'],
      [`統一編號：${company.taxId || '-'}`],
      [title],
      [`期間：${periodText}`],
      [`列印日期：${printDate}`],
      [],
      ['項目', '金額'],
      ...rows.map(([label, amount]) => [label, amount])
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = [{ wch: 26 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  }

  addStatementSheet('損益表', '損益表', buildIncomeStatement(periodTx));
  addStatementSheet('資產負債表', '資產負債表', buildBalanceSheet(periodTx));
  addStatementSheet('現金流量表', '現金流量表', buildCashflowStatement(periodTx));
  addStatementSheet('權益變動表', '權益變動表', buildEquityStatement(periodTx));

  const journal = buildJournal(periodTx);
  const journalAoa = [
    ['日期', '摘要', '銀行', '借方科目', '借方金額', '貸方科目', '貸方金額', '憑證', '狀態'],
    ...journal.map(row => [row.date, row.summary, row.bank, row.debitAccount, row.debitAmount, row.creditAccount, row.creditAmount, row.voucher || '-', row.status])
  ];
  const journalSheet = XLSX.utils.aoa_to_sheet(journalAoa);
  journalSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, journalSheet, '會計分錄');

  const fileName = `財務報表_${start || '全部'}_${end || '至今'}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showMessage('Excel 已匯出完成。');
}

function renderVoucherSummary() {
  const container = document.getElementById('voucherSummaryContent');
  if (!container) return;
  const summary = getCurrentMonthVoucherSummary(state.transactions);

  const counterpartyRows = Object.entries(summary.byCounterparty)
    .map(([name, v]) => `<tr><td>${name}</td><td>${v.received.toLocaleString()}</td><td>${v.paid.toLocaleString()}</td></tr>`)
    .join('') || '<tr><td colspan="3" class="muted">本月尚無交易</td></tr>';

  const bankRows = Object.entries(summary.byBank)
    .map(([name, v]) => `<tr><td>${name}</td><td>${v.received.toLocaleString()}</td><td>${v.paid.toLocaleString()}</td></tr>`)
    .join('') || '<tr><td colspan="3" class="muted">本月尚無交易</td></tr>';

  container.innerHTML = `
    <div class="summary" style="margin-bottom: 16px;">
      <div class="summary-item"><span class="muted">本月憑證總數</span><strong>${summary.totalCount}</strong></div>
      <div class="summary-item"><span class="muted">已對應</span><strong>${summary.matchedCount}</strong></div>
      <div class="summary-item"><span class="muted">待補憑證</span><strong>${summary.unmatchedCount}</strong></div>
    </div>
    <div class="grid grid-2">
      <div>
        <h4>依對象（收誰的錢 / 付給誰）</h4>
        <table><thead><tr><th>對象</th><th>收入</th><th>支出</th></tr></thead><tbody>${counterpartyRows}</tbody></table>
      </div>
      <div>
        <h4>依銀行帳戶（哪個帳戶收 / 付）</h4>
        <table><thead><tr><th>銀行</th><th>收入</th><th>支出</th></tr></thead><tbody>${bankRows}</tbody></table>
      </div>
    </div>`;
}

function renderTable(id, rows) {
  const table = document.getElementById(id);
  table.innerHTML = '<thead><tr><th>項目</th><th>金額</th></tr></thead><tbody></tbody>';
  const body = table.querySelector('tbody');
  rows.forEach(([label, amount]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${label}</td><td>${Number(amount).toLocaleString()}</td>`;
    body.appendChild(row);
  });
}

function renderApprovalTable() {
  const body = document.getElementById('approvalTableBody');
  body.innerHTML = '';
  if (!state.currentUser || !isAdminUser(state.currentUser.username)) {
    body.innerHTML = '<tr><td colspan="4" class="muted">僅限管理者檢視核准申請。</td></tr>';
    return;
  }
  const approvals = loadApprovalRequests();
  if (!approvals.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">目前尚無使用者申請。</td></tr>';
    return;
  }
  approvals.forEach(item => {
    const tr = document.createElement('tr');
    const action = item.status === 'pending' ? `<button class="secondary approve-btn" data-email="${item.email}">核准</button>` : '已核准';
    tr.innerHTML = `<td>${item.email}</td><td>${new Date(item.timestamp).toLocaleString()}</td><td>${item.status}</td><td>${action}</td>`;
    body.appendChild(tr);
  });
}

function updateSettings() {
  const passwordCard = document.getElementById('passwordCard');
  if (passwordCard) {
    passwordCard.style.display = state.currentUser && isAdminUser(state.currentUser.username) ? 'block' : 'none';
  }
}

async function updateGoogleButtonState() {
  const button = document.getElementById('googleBtn');
  if (!button) return;
  const enabled = await checkIdentityEndpoint();
  button.disabled = !enabled;
  button.textContent = enabled ? '使用 Google 登入' : 'Google 登入（需 netlify dev / 部署）';
  button.title = enabled ? '使用 Netlify Identity 登入' : '請使用 netlify dev 或部署到 Netlify 後再試 Google 登入。';
  if (!enabled) {
    showMessage('Google 登入目前僅支援 Netlify Identity，請使用 netlify dev 或部署至 Netlify。', true);
  }
}

async function renderBankAccounts() {
  const body = document.getElementById('bankAccountTableBody');
  if (!body) return;

  const userRole = state.currentUser?.role;
  const isFinance = ['accounting', 'admin'].includes(userRole);

  if (!isFinance) {
    body.innerHTML = '<tr><td colspan="5" class="muted">僅會計部門與 Admin 可管理銀行帳戶</td></tr>';
    return;
  }

  try {
    let accounts = await loadBankAccounts();
    if (!accounts || !Array.isArray(accounts)) accounts = [];

    body.innerHTML = accounts.map(a => {
      const balance = getBankBalance(a.id, state.transactions || []);
      return `
        <tr>
          <td>${a.bank_name || a.bankName || '未命名'}</td>
          <td>${a.account_number || a.accountNumber || '-'}</td>
          <td>${a.nickname || '-'}</td>
          <td>${(balance || 0).toLocaleString()}</td>
          <td>
            <button class="secondary edit-bank-btn" data-id="${a.id}">編輯</button>
            <button class="danger delete-bank-btn" data-id="${a.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5" class="muted">尚未設定銀行帳戶。</td></tr>';

    populateBankSelect(document.getElementById('txBankAccount'), accounts);
    populateBankSelect(document.getElementById('vBankAccount'), accounts);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<tr><td colspan="5" class="muted">載入失敗，請檢查 Supabase</td></tr>';
  }
}

function renderVoucherCenter() {
  const body = document.getElementById('voucherCenterTableBody');
  if (!body) return;
  const keyword = (document.getElementById('voucherSearchInput')?.value || '').trim().toLowerCase();
  const filtered = state.transactions.filter(tx => {
    if (!keyword) return true;
    return [tx.detail, tx.customer, tx.voucher, getBankNickname(tx.bankAccountId)]
      .some(field => (field || '').toLowerCase().includes(keyword));
  });
  body.innerHTML = filtered.map(tx => `
    <tr>
      <td>${tx.date}</td><td>${tx.voucherType || '無'}</td><td>${tx.voucher || '-'}</td>
      <td>${getBankNickname(tx.bankAccountId)}</td><td>${tx.customer || tx.detail}</td>
      <td>${tx.type}</td><td>${Number(tx.amount).toLocaleString()}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">沒有符合條件的憑證資料。</td></tr>';
}

function renderBudget() {
  const body = document.getElementById('budgetTableBody');
  if (!body) return;
  const period = document.getElementById('budgetViewPeriod')?.value || new Date().toISOString().slice(0, 7);
  const rows = buildBudgetReport(state.transactions, period);
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.accountCode} ${r.accountName}</td>
      <td>${r.budget.toLocaleString()}</td>
      <td>${r.actual.toLocaleString()}</td>
      <td style="color:${r.variance > 0 && r.accountCode === '6100' ? 'var(--danger)' : 'inherit'}">${r.variance.toLocaleString()}</td>
      <td>${r.variancePercent.toFixed(1)}%</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">這個月尚未設定預算目標。</td></tr>';
}

function renderEquityTab() {
  const table = document.getElementById('equityDetailTable');
  const note = document.getElementById('fundraisingNoteDetail');
  if (!table) return;
  renderTable('equityDetailTable', buildEquityStatement(state.transactions));
  if (note) {
    const analysis = getEquityAnalysis(state.transactions);
    note.textContent = `現金水位：${analysis.cashBalance.toLocaleString()}｜可撐月數：${analysis.cashRunwayMonths ? analysis.cashRunwayMonths.toFixed(1) + ' 個月' : '尚無支出紀錄'}｜建議：${analysis.fundraisingSuggestion}`;
  }
}

function renderJournalFiltered() {
  const keyword = (document.getElementById('journalSearchInput')?.value || '').trim().toLowerCase();
  const journalBody = document.getElementById('journalTableBody');
  if (!journalBody) return;
  const journal = buildJournal(state.transactions).filter(row => {
    if (!keyword) return true;
    return [row.summary, row.bank, row.debitAccount, row.creditAccount, row.voucher]
      .some(field => (field || '').toLowerCase().includes(keyword));
  });
  journalBody.innerHTML = '';
  if (!journal.length) {
    journalBody.innerHTML = '<tr><td colspan="9" class="muted">沒有符合條件的分錄。</td></tr>';
    return;
  }
  journal.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.date}</td><td>${row.summary}</td><td>${row.bank}</td><td>${row.debitAccount}</td><td>${Number(row.debitAmount).toLocaleString()}</td><td>${row.creditAccount}</td><td>${Number(row.creditAmount).toLocaleString()}</td><td>${row.voucher || '-'}</td><td>${row.status}</td>`;
    journalBody.appendChild(tr);
  });
}

function renderTabs() {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === state.activeTab));
  const currentPanel = document.getElementById(state.activeTab);
  if (currentPanel) currentPanel.style.display = 'block';
}

function showApp() {
  if (!state.currentUser) {
    document.getElementById('loginView').style.display = 'grid';
    document.getElementById('appView').classList.remove('active');
    return;
  }
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').classList.add('active');
  render();
  state.activeTab = 'dashboard';
  renderTabs();
}

function showForcePasswordView() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').classList.remove('active');
  document.getElementById('forcePasswordView').style.display = 'grid';
}

function initializeEvents() {
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function closeSidebar() {
    sidebarEl?.classList.remove('open');
    sidebarOverlay?.classList.remove('open');
    menuToggleBtn?.classList.remove('open');
    menuToggleBtn?.setAttribute('aria-expanded', 'false');
  }

  function openSidebar() {
    sidebarEl?.classList.add('open');
    sidebarOverlay?.classList.add('open');
    menuToggleBtn?.classList.add('open');
    menuToggleBtn?.setAttribute('aria-expanded', 'true');
  }

  menuToggleBtn?.addEventListener('click', () => {
    sidebarEl?.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  sidebarOverlay?.addEventListener('click', closeSidebar);

  // 安全的事件綁定
  const safeListener = (id, event, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };

  safeListener('voucherSearchInput', 'input', renderVoucherCenter);
  safeListener('journalSearchInput', 'input', renderJournalFiltered);
  safeListener('budgetForm', 'submit', (e) => {
    e.preventDefault();
    setBudgetTarget(
      document.getElementById('budgetPeriod').value,
      document.getElementById('budgetAccountCode').value,
      document.getElementById('budgetAmount').value
    );
    renderBudget();
    showMessage('預算目標已儲存。');
  });
  safeListener('budgetViewPeriod', 'change', renderBudget);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      renderTabs();
      closeSidebar();
      if (btn.dataset.tab === 'voucherWorkflow') {
        populateVoucherFormOptions();
        renderVoucherWorkflowList();
      }
      if (btn.dataset.tab === 'adminUsers') {
        populateInviteDepartmentSelect();
        renderAdminUserTable();
        renderAdminDepartmentList();
      }
      if (btn.dataset.tab === 'transactions' && !['accounting', 'admin'].includes(state.currentUser?.role)) {
        showMessage('交易管理僅限會計部門使用', true);
        return;
      }
    });
  });

  document.getElementById('bankAccountTableBody')?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-bank-btn');
    if (deleteBtn) {
      if (confirm('確定刪除此銀行帳戶？')) {
        await deleteBankAccount(deleteBtn.dataset.id);
        renderBankAccounts();
        showMessage('銀行帳戶已刪除。');
      }
      return;
    }

    const editBtn = e.target.closest('.edit-bank-btn');
    if (editBtn) {
      // 簡單 alert 示範，之後可擴充表單
      alert('編輯功能開發中（可自行擴充表單）');
    }
  });

  safeListener('forcePasswordForm', 'submit', async (e) => { /* 原有 forcePasswordForm 邏輯 */ });
  safeListener('loginForm', 'submit', async (e) => { /* 原有 loginForm 邏輯 */ });
  safeListener('companyInfoForm', 'submit', (e) => { /* 原有 companyInfoForm 邏輯 */ });

  // 銀行帳戶
  safeListener('bankAccountForm', 'submit', async (e) => {
    e.preventDefault();
    const userRole = state.currentUser?.role;
    if (!['accounting', 'admin'].includes(userRole)) {
      showMessage('僅會計部門與 Admin 可新增銀行帳戶', true);
      return;
    }
    try {
      const newAccount = {
        bank_name: document.getElementById('bankName').value.trim(),
        account_number: document.getElementById('bankAccountNumber').value.trim(),
        nickname: document.getElementById('bankNickname').value.trim() || document.getElementById('bankName').value.trim(),
        opening_balance: parseFloat(document.getElementById('bankOpeningBalance').value) || 0
      };
      await addBankAccount(newAccount);
      showMessage('銀行帳戶已新增。');
      renderBankAccounts();
      e.target.reset();
    } catch (err) {
      showMessage('新增失敗：' + err.message, true);
    }
  });

  document.getElementById('bankAccountTableBody')?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-bank-btn');
    if (deleteBtn) {
      if (confirm('確定刪除此銀行帳戶？')) {
        await deleteBankAccount(deleteBtn.dataset.id);
        renderBankAccounts();
        showMessage('銀行帳戶已刪除。');
      }
      return;
    }
    // 編輯按鈕可後續擴充
  });

  // 其他重要 listener
  safeListener('transactionForm', 'submit', async (e) => { /* 原有 transactionForm */ });
  safeListener('printReportBtn', 'click', () => {
    state.activeTab = 'reports';
    renderTabs();
    setTimeout(() => {
      window.print();
    }, 100);
  });

  safeListener('inviteUserForm', 'submit', async (e) => { /* 原有 inviteUserForm */ });
  safeListener('voucherCreateForm', 'submit', async (e) => {
    e.preventDefault();
    try {
      const projectId = document.getElementById('vProject')?.value;

      await createVoucher({
        txDate: document.getElementById('vDate').value,
        category: document.getElementById('vCategory').value,
        summary: document.getElementById('vSummary').value.trim(),
        departmentId: document.getElementById('vDepartment').value,
        line: {
          description: document.getElementById('vSummary').value.trim(),
          accountCode: document.getElementById('vAccountCode').value,
          amount: Number(document.getElementById('vAmount').value)
        },
        invoice: {
          type: document.getElementById('vInvoiceType').value,
          number: document.getElementById('vInvoiceNumber').value.trim()
        },
        payment: {
          type: document.getElementById('vPaymentType').value,
          bankAccountId: document.getElementById('vBankAccount').value || null
        },
        projectId: projectId || null
      });

      if (projectId) {
        await supabase.rpc('deduct_project_budget', { 
          p_id: projectId, 
          p_amount: Number(document.getElementById('vAmount').value) 
        });
      }

      showMessage('報支申請已送出，並已扣除專案預算。');
      e.target.reset();
      renderVoucherWorkflowList();
    } catch (error) {
      showMessage(`送出失敗：${error.message}`, true);
    }
  });

  // 新增的專案與部門
  safeListener('projectForm', 'submit', async (e) => {
    e.preventDefault();
    if (!['accounting', 'admin'].includes(state.currentUser?.role)) {
      showMessage('僅會計部門與 Admin 可建立專案', true);
      return;
    }
    try {
      const totalBudget = parseFloat(document.getElementById('projectTotalBudget').value) || 0;
      const { error } = await supabase.from('projects').insert({
        name: document.getElementById('projectName').value.trim(),
        start_date: document.getElementById('projectStart').value || null,
        end_date: document.getElementById('projectEnd').value || null,
        department_id: document.getElementById('projectDepartment').value || null,
        total_budget: totalBudget,
        remaining_budget: totalBudget
      });
      if (error) throw error;
      showMessage('專案已建立。');
      e.target.reset();
      renderProjectList();
    } catch (err) {
      showMessage('建立專案失敗：' + err.message, true);
    }
  });

  safeListener('departmentForm', 'submit', async (e) => {
    e.preventDefault();
    if (state.currentUser?.role !== 'admin') {
      showMessage('僅 Admin 可新增部門', true);
      return;
    }
    try {
      const name = document.getElementById('newDepartmentName').value.trim();
      const { error } = await supabase.from('departments').insert({ name });
      if (error) throw error;
      showMessage('部門已新增。');
      e.target.reset();
      renderAdminDepartmentList();
      populateInviteDepartmentSelect();
      populateProjectDepartmentSelect();
    } catch (err) {
      showMessage('新增部門失敗：' + err.message, true);
    }
  });
  safeListener('addVoucherLineBtn', 'click', () => {
    voucherLines.push({ description: '', accountCode: '', amount: 0 });
    renderVoucherLines();
  });
}

let voucherLines = [];

function renderVoucherLines() {
  const tbody = document.querySelector('#voucherLinesTable tbody');
  if (!tbody) return;
  tbody.innerHTML = voucherLines.map((line, i) => `
    <tr>
      <td><input value="${line.description}" class="line-desc" data-index="${i}"></td>
      <td><select class="line-account" data-index="${i}"></select></td>
      <td><input type="number" value="${line.amount}" class="line-amount" data-index="${i}"></td>
      <td><button class="danger" onclick="removeLine(${i})">刪除</button></td>
    </tr>
  `).join('');
}

window.removeLine = (i) => { voucherLines.splice(i,1); renderVoucherLines(); };

async function initialize() {
    loadState(state);
    initializeEvents();

    const user = await getCurrentSessionUser();
    if(user){
        state.currentUser=user;
        if(user.mustChangePassword){
            showForcePasswordView();
        }else{
            showApp();
        }
    }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function populateVoucherFormOptions() {
  try {
    const [accounts, banks, departments] = await Promise.all([
      fetchAccounts(), 
      fetchBankAccounts(), 
      fetchDepartments()
    ]);

    // 會計科目
    const accountSelect = document.getElementById('vAccountCode');
    if (accountSelect) {
      accountSelect.innerHTML = accounts.map(a => 
        `<option value="${a.code}">${a.code} ${a.name}</option>`
      ).join('');
    }

    // 銀行帳戶
    const bankSelect = document.getElementById('vBankAccount');
    if (bankSelect) {
      bankSelect.innerHTML = '<option value="">（現金支付免選）</option>' + 
        banks.map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('');
    }

    // 部門 - 避免重複宣告
    const deptSelect = document.getElementById('vDepartment');
    if (deptSelect) {
      if (state.currentUser?.role === 'employee') {
        // 員工只能看到自己的部門
        deptSelect.innerHTML = `<option value="${state.currentUser.department_id || ''}">${state.currentUser.department_name || '我的部門'}</option>`;
        deptSelect.disabled = true;
      } else {
        deptSelect.innerHTML = departments.length
          ? departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
          : '<option value="">尚未建立部門</option>';
      }
    }

    const projectSelect = document.getElementById('vProject');
    if (projectSelect) {
      const projects = await fetchProjects();
      projectSelect.innerHTML = '<option value="">無專案</option>' + 
        projects.map(p => `<option value="${p.id}">${p.project_code} - ${p.name}</option>`).join('');
    }
  } catch (error) {
    console.error(error);
    showMessage(`載入表單選項失敗：${error.message}`, true);
  }
}

function renderVoucherCard(v) {
  const role = state.currentUser?.role;
  const isMine = v.applicant_id === state.currentUser?.id;
  let actions = '';

  if (isMine && ['pending_review', 'manager_rejected', 'accounting_rejected'].includes(v.status)) {
    actions += `<span class="muted" style="font-size:12px;">可修改後重送（下一階段補上編輯介面）</span>`;
  }
  if (role === 'manager' && v.status === 'pending_review') {
    actions += `<button class="primary-btn approve-voucher-btn" data-id="${v.id}" data-stage="manager">核准</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="manager">退件</button>`;
  }
  if (['accounting', 'admin'].includes(role) && v.status === 'pending_accounting') {
    actions += `<button class="primary-btn approve-voucher-btn" data-id="${v.id}" data-stage="accounting">核准入帳</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="accounting">退件</button>`;
  }

  return `
    <div class="voucher-card">
      <div class="voucher-card-header">
        <strong>${v.voucher_no || '（產生中）'}</strong>
        <span class="badge">${STATUS_LABELS[v.status] || v.status}</span>
      </div>
      <div class="muted">${v.tx_date}｜${v.summary || ''}｜金額 ${Number(v.total_amount).toLocaleString()}</div>
      <div class="button-row" style="margin-top:8px;">
        ${actions}
        <button class="secondary view-history-btn" data-id="${v.id}">查看審批歷程</button>
      </div>
      <div class="voucher-history" id="history-${v.id}" style="display:none; margin-top:8px;"></div>
    </div>`;
}

async function renderVoucherWorkflowList() {
  const container = document.getElementById('voucherWorkflowList');
  if (!container) return;
  container.innerHTML = '<p class="muted">載入中…</p>';
  try {
    const vouchers = await fetchMyVouchers();
    container.innerHTML = vouchers.length
      ? vouchers.map(v => renderVoucherCard(v)).join('')
      : '<p class="muted">目前沒有任何報支申請。</p>';
  } catch (error) {
    container.innerHTML = `<p class="muted">載入失敗：${error.message}</p>`;
  }
}

// === 專案與部門管理 ===
async function populateProjectDepartmentSelect() {
  const select = document.getElementById('projectDepartment');
  if (!select) return;
  try {
    const depts = await fetchDepartments();
    select.innerHTML = depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  } catch (e) {
    console.error(e);
  }
}

async function renderProjectList() {
  const container = document.getElementById('projectList');
  if (!container) return;
  try {
    const projects = await fetchProjects();
    container.innerHTML = projects.map(p => `
      <div style="border:1px solid #ddd; padding:12px; margin:8px 0; border-radius:6px;">
        <strong>${p.project_code || '無編號'} - ${p.name}</strong><br>
        預算：${Number(p.total_budget || 0).toLocaleString()} | 剩餘：${Number(p.remaining_budget || 0).toLocaleString()}<br>
        期間：${p.start_date || '-'} ~ ${p.end_date || '-'}
        <button onclick="deleteProject('${p.id}')" class="danger" style="float:right;">刪除</button>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p class="muted">載入專案失敗</p>';
  }
}

window.deleteProject = async (id) => {
  if (confirm('確定刪除此專案？')) {
    await supabase.from('projects').delete().eq('id', id);
    renderProjectList();
  }
};

// 部門管理
async function renderAdminDepartmentList() {
  const container = document.getElementById('departmentList');
  if (!container) return;
  const depts = await loadDepartments();
  container.innerHTML = depts.map(d => `<div>${d.name}</div>`).join('');
}

// === 專案相關 ===
async function loadAndRenderProjects() {
  try {
    const projects = await fetchProjects();
    const select = document.getElementById('globalProjectSelect');
    if (!select) return;

    let html = '';
    const userRole = state.currentUser?.role;

    if (['accounting', 'admin'].includes(userRole)) {
      html = '<option value="all">全公司總覽</option>';
    }

    projects.forEach(p => {
      html += `<option value="${p.id}">${p.project_code} - ${p.name}</option>`;
    });
    
    select.addEventListener('change', () => {
      state.currentProjectId = select.value;
      render(); // 重新 render dashboard + 其他
    });
    
    select.innerHTML = html;
    state.currentProjectId = 'all';
  } catch (e) {
    console.error(e);
  }
}

async function fetchProjects() {
  const userRole = state.currentUser?.role;
  let query = supabase.from('projects').select('*').order('project_code');

  if (userRole === 'employee' || userRole === 'manager') {
    query = query.eq('department_id', state.currentUser.department_id);
  }

  const { data } = await query;
  return data || [];
}

async function loadDepartments() {
  const { data } = await supabase.from('departments').select('*');
  return data;
}

const permissions = ['dashboard', 'voucher', 'transactions', 'reports', 'budget', 'bank_accounts'];

function renderPermissionCheckboxes() {
  const container = document.getElementById('permissionCheckboxes');
  container.innerHTML = permissions.map(p => `
    <label><input type="checkbox" value="${p}" checked> ${p}</label>
  `).join('');
}