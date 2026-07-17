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

function getBankNickname(bankAccountId) {
  const account = loadBankAccounts().find(a => a.id === bankAccountId);
  return account ? account.nickname : '未設定';
}

function populateBankSelect(selectEl) {
  if (!selectEl) return;
  const accounts = loadBankAccounts();
  if (accounts.length === 0) {
    selectEl.innerHTML = '<option value="">尚未設定銀行帳戶</option>';
    return;
  }
  selectEl.innerHTML = accounts.map(a => 
    `<option value="${a.id}">${a.nickname || a.bank_name}</option>`
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

function renderDashboard() {
  let txs = state.transactions || [];
  
  // 專案過濾
  if (state.currentProjectId && state.currentProjectId !== 'all') {
    txs = txs.filter(tx => tx.project_id === state.currentProjectId);
  }

  const summary = summarizeTransactions(txs);
  
  setText('#countValue', txs.length);
  setText('#incomeValue', summary.revenue.toLocaleString());
  setText('#expenseValue', summary.expense.toLocaleString());
  setText('#profitValue', summary.netProfit.toLocaleString());

  const body = document.getElementById('dashboardTableBody');
  if (!body) return;
  
  body.innerHTML = '';
  const recent = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  
  if (!recent.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">目前尚無交易資料。</td></tr>';
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

function renderBankAccounts() {
  const body = document.getElementById('bankAccountTableBody');
  if (!body) return;

  const userRole = state.currentUser?.role;
  const isFinance = ['accounting', 'admin'].includes(userRole);

  if (!isFinance) {
    body.innerHTML = '<tr><td colspan="5" class="muted">僅會計部門與 Admin 可管理銀行帳戶</td></tr>';
    return;
  }

  try {
    const accounts = loadBankAccounts(); // 後續會改成 Supabase
    body.innerHTML = accounts.map(a => `
      <tr>
        <td>${a.bank_name || a.bankName}</td>
        <td>${a.account_number || a.accountNumber}</td>
        <td>${a.nickname}</td>
        <td>${getBankBalance(a.id, state.transactions).toLocaleString()}</td>
        <td><button class="secondary delete-bank-btn" data-id="${a.id}">刪除</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="muted">尚未設定銀行帳戶。</td></tr>';

    populateBankSelect(document.getElementById('txBankAccount'));
    populateBankSelect(document.getElementById('vBankAccount'));
  } catch (e) {
    console.error(e);
    body.innerHTML = '<tr><td colspan="5" class="muted">載入銀行帳戶失敗，請稍後重試</td></tr>';
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

  document.getElementById('voucherSearchInput')?.addEventListener('input', renderVoucherCenter);
  document.getElementById('journalSearchInput')?.addEventListener('input', renderJournalFiltered);

  document.getElementById('budgetForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    setBudgetTarget(
      document.getElementById('budgetPeriod').value,
      document.getElementById('budgetAccountCode').value,
      document.getElementById('budgetAmount').value
    );
    renderBudget();
    showMessage('預算目標已儲存。');
  });

  document.getElementById('budgetViewPeriod')?.addEventListener('change', renderBudget);

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
      }
      if (btn.dataset.tab === 'transactions' && !['accounting', 'admin'].includes(state.currentUser?.role)) {
        showMessage('交易管理僅限會計部門使用', true);
        return;
      }
    });
  });

  document.getElementById('forcePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('forceNewPassword').value;
    const confirmPassword = document.getElementById('forceConfirmPassword').value;
    const messageEl = document.getElementById('forcePasswordMessage');

    if (newPassword !== confirmPassword) {
      messageEl.className = 'message error';
      messageEl.textContent = '兩次輸入的密碼不一致。';
      return;
    }
    const result = await changeMyPassword(newPassword);
    if (!result.ok) {
      messageEl.className = 'message error';
      messageEl.textContent = result.message;
      return;
    }
    state.currentUser.mustChangePassword = false;
    document.getElementById('forcePasswordView').style.display = 'none';
    showApp();
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const result = await signInWithSupabase(email, password);
    if (!result.ok) {
      showMessage(result.message, true);
      return;
    }
    state.currentUser = result.user;
    if (result.user.mustChangePassword) {
      showForcePasswordView();
      return;
    }
    showApp();
  });

  document.getElementById('companyInfoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.companyInfo = {
      ...state.companyInfo,
      companyNameZh: document.getElementById('companyNameZh').value.trim(),
      companyNameEn: document.getElementById('companyNameEn').value.trim(),
      taxId: document.getElementById('companyTaxId').value.trim(),
      phone: document.getElementById('companyPhone').value.trim(),
      address: document.getElementById('companyAddress').value.trim(),
      representativeName: document.getElementById('companyRepresentative').value.trim(),
      boardCount: Number(document.getElementById('companyBoardCount').value || 0),
      totalCapital: Number(document.getElementById('companyTotalCapital').value || 0),
      plannedOpenDate: document.getElementById('companyOpenDate').value
    };
    saveState(state);
    render();
    showMessage('公司資料已儲存。');
  });

  document.getElementById('bankAccountForm')?.addEventListener('submit', async (e) => {
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

      await addBankAccount(newAccount);   // 確保這個函式是 async 且呼叫 Supabase
      showMessage('銀行帳戶已新增。');
      renderBankAccounts();
      e.target.reset();
    } catch (err) {
      showMessage('新增失敗：' + err.message, true);
    }
  });

  document.getElementById('transactionForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    let attachmentId = '';
    const file = document.getElementById('txAttachment').files[0];
    if (file) {
      try {
        attachmentId = await saveAttachment(file);
      } catch (error) {
        showMessage(error.message, true);
        return;
      }
    }
    const voucherType = document.getElementById('txVoucherType').value;
    const rawVoucher = document.getElementById('txVoucher').value.trim();
    const date = document.getElementById('txDate').value;

    const item = {
      date,
      bankAccountId: document.getElementById('txBankAccount').value,
      customer: document.getElementById('txCustomer').value.trim(),
      detail: document.getElementById('txDetail').value.trim(),
      type: document.getElementById('txType').value,
      category: document.getElementById('txCategory').value,
      amount: Number(document.getElementById('txAmount').value),
      voucherType,
      voucher: resolveVoucherNumber(voucherType, rawVoucher, date),
      remark: document.getElementById('txRemark').value.trim(),
      attachmentId,
      source: 'input'
    };
    state.transactions.unshift(item);
    saveState(state);
    render();
    e.target.reset();
    showMessage('交易已新增並已儲存。');
  });

  document.getElementById('transactionTableBody').addEventListener('click', (event) => {
    const viewButton = event.target.closest('.view-attachment-btn');
    if (viewButton) {
      openAttachment(viewButton.dataset.attachment);
      return;
    }
    const button = event.target.closest('.delete-btn');
    if (!button) return;
    const idx = Number(button.dataset.index);
    if (Number.isInteger(idx)) {
      state.transactions.splice(idx, 1);
      saveState(state);
      render();
      showMessage('交易已刪除。', false);
    }
  });

  document.getElementById('loadSampleBtn').addEventListener('click', () => {
    state.transactions = SAMPLE_DATA;
    saveState(state);
    render();
    showMessage('已載入 notebook 範例資料。');
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    state.transactions = [];
    saveState(state);
    render();
    showMessage('已清空本機交易資料。', true);
  });

  document.getElementById('exportReportBtn').addEventListener('click', () => {
    state.activeTab = 'reports';
    renderTabs();
    setTimeout(() => window.print(), 100);
  });

  document.getElementById('printReportBtn').addEventListener('click', () => {
    state.activeTab = 'reports';
    renderTabs();
    setTimeout(() => window.print(), 100);
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    state.systemName = document.getElementById('systemName').value.trim() || '財務管理系統';
    saveState(state);
    render();
    showMessage('系統設定已儲存。');
  });

  document.getElementById('approvalTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('.approve-btn');
    if (!button) return;
    const email = button.dataset.email;
    approveEmail(email);
    renderApprovalTable();
    showMessage(`${email} 已核准。`);
  });

  document.getElementById('inviteUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultBox = document.getElementById('inviteResultBox');
    try {
      const result = await inviteNewUser({
        email: document.getElementById('inviteEmail').value.trim(),
        fullName: document.getElementById('inviteFullName').value.trim(),
        role: document.getElementById('inviteRole').value,
        departmentId: document.getElementById('inviteDepartment').value,
        password: document.getElementById('invitePassword').value.trim()
      });
      resultBox.style.display = 'block';
      resultBox.className = 'message success';
      resultBox.textContent = `帳號已建立：${result.credentials.email}｜初始密碼：${result.credentials.tempPassword}（請自行告知使用者）`;
      e.target.reset();
      renderAdminUserTable();
    } catch (error) {
      resultBox.style.display = 'block';
      resultBox.className = 'message error';
      resultBox.textContent = `開通失敗：${error.message}`;
    }
  });

  document.getElementById('adminUserTableBody')?.addEventListener('change', async (e) => {
    const select = e.target.closest('.role-select');
    if (!select) return;
    try {
      await updateUserProfile(select.dataset.id, { role: select.value });
      showMessage('角色已更新。');
    } catch (error) {
      showMessage(`更新失敗：${error.message}`, true);
    }
  });

  document.getElementById('adminUserTableBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.toggle-active-btn');
    if (!btn) return;
    const isActive = btn.dataset.active === 'true';
    try {
      await toggleUserActive(btn.dataset.id, !isActive);
      showMessage(isActive ? '帳號已停用。' : '帳號已啟用。');
      renderAdminUserTable();
    } catch (error) {
      showMessage(`操作失敗：${error.message}`, true);
    }
  });

    document.getElementById('voucherCreateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
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
        }
      });
      if (invoice.type === '發票' && !invoice.number) {
        showMessage('發票必須填寫發票號碼', true);
        return;
      }
      async function deductProjectBudget(projectId, amount) {
        const { error } = await supabase.rpc('deduct_project_budget', { 
          p_id: projectId, 
          p_amount: amount 
        });
        if (error) throw error;
      }
      e.target.reset();
      showMessage('報支申請已送出，等待主管審核。');
      renderVoucherWorkflowList();
    } catch (error) {
      showMessage(`送出失敗：${error.message}`, true);
    }
  });

  document.getElementById('voucherWorkflowList')?.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.approve-voucher-btn');
    const rejectBtn = e.target.closest('.reject-voucher-btn');
    const historyBtn = e.target.closest('.view-history-btn');

    if (approveBtn || rejectBtn) {
      const btn = approveBtn || rejectBtn;
      const id = btn.dataset.id;
      const stage = btn.dataset.stage;
      const vouchers = await fetchMyVouchers();
      const voucher = vouchers.find(v => v.id === id);
      if (!voucher) return;

      try {
        if (approveBtn) {
          stage === 'manager' ? await managerApprove(voucher) : await accountingApprove(voucher);
          showMessage('已核准。');
        } else {
          const reason = prompt('請輸入退件原因（必填）：');
          if (!reason || !reason.trim()) {
            showMessage('已取消，退件必須填寫原因。', true);
            return;
          }
          stage === 'manager' ? await managerReject(voucher, reason.trim()) : await accountingReject(voucher, reason.trim());
          showMessage('已退件。');
        }
        renderVoucherWorkflowList();
      } catch (error) {
        showMessage(`操作失敗：${error.message}`, true);
      }
      return;
    }

    if (historyBtn) {
      const id = historyBtn.dataset.id;
      const historyEl = document.getElementById(`history-${id}`);
      if (!historyEl) return;
      if (historyEl.style.display === 'none') {
        historyEl.style.display = 'block';
        historyEl.innerHTML = '<p class="muted">載入中…</p>';
        try {
          const logs = await fetchWorkflowLogs(id);
          historyEl.innerHTML = logs.length ? logs.map(l => `
            <div style="font-size:13px; padding:4px 0; border-top:1px solid var(--border);">
              ${new Date(l.created_at).toLocaleString('zh-TW')}｜${l.actor?.full_name || l.actor?.email || '未知'}｜${l.action}
              ${l.to_status ? ` → ${STATUS_LABELS[l.to_status] || l.to_status}` : ''}
              ${l.reject_reason ? `｜原因：${l.reject_reason}` : ''}
            </div>`).join('') : '<p class="muted">尚無紀錄。</p>';
        } catch (error) {
          historyEl.innerHTML = `<p class="muted">載入失敗：${error.message}</p>`;
        }
      } else {
        historyEl.style.display = 'none';
      }
    }
  });
  
  document.getElementById('exportBtn').addEventListener('click', () => {
    const data = JSON.stringify({
      transactions: state.transactions,
      companyInfo: state.companyInfo,
      businessItems: state.businessItems,
      directorShareholders: state.directorShareholders,
      structureSettings: state.structureSettings,
      optionList: state.optionList,
      standardizedSettings: state.standardizedSettings
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance_data_export.json';
    a.click();
    URL.revokeObjectURL(url);
    showMessage('已匯出交易與公司資料 JSON。');
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOutSupabase();
    localStorage.removeItem('finance_netlify_user');
    state.currentUser = null;
    document.getElementById('loginView').style.display = 'grid';
    document.getElementById('appView').classList.remove('active');
    document.getElementById('reportPeriodStart')?.addEventListener('change', renderReports);
    document.getElementById('reportPeriodEnd')?.addEventListener('change', renderReports);
    document.getElementById('printReportBtn')?.addEventListener('click', () => {
      state.activeTab = 'reports';
      renderTabs();
      window.print();
    });
    document.getElementById('exportExcelBtn')?.addEventListener('click', () => {
      exportReportsToExcel().catch(err => showMessage(`匯出失敗：${err.message}`, true));
    });
});
}   // ← 新增這一行，補上 initializeEvents() 函式的結尾

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

// === 專案相關 ===
async function loadAndRenderProjects() {
  try {
    const projects = await fetchProjects(); // 需實作 fetchProjects
    const select = document.getElementById('globalProjectSelect');
    if (!select) return;

    let html = '<option value="all">全公司總覽</option>';
    projects.forEach(p => {
      html += `<option value="${p.id}">${p.project_code} - ${p.name}</option>`;
    });
    select.innerHTML = html;

    // 預設全公司
    state.currentProjectId = 'all';
    
    select.addEventListener('change', () => {
      state.currentProjectId = select.value;
      render(); // 重新渲染整個 dashboard
    });
  } catch (e) {
    console.error(e);
  }
}

async function fetchProjects() {
  const { data } = await supabase.from('projects').select('*').order('project_code');
  return data || [];
}
