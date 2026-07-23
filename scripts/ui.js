import { supabase } from './supabaseClient.js';
import { getCurrentMonthVoucherSummary } from '../src/modules/voucher/voucherSummary.js';
import { defaultState, loadState, saveState, USER_KEY } from './state.js';
import { isAdminUser } from './auth.js';
import { summarizeTransactions, buildJournal, buildIncomeStatement, buildBalanceSheet, buildCashflowStatement, buildEquityStatement, getEquityAnalysis } from './reports.js';
import { saveAttachment, openAttachment } from '../src/modules/voucher/attachments.js';
import { signInWithSupabase, getCurrentSessionUser, changeMyPassword, signOutSupabase } from './auth.js';
import { loadBankAccounts, addBankAccount, deleteBankAccount, getBankBalance, setupTransactionForm } from '../src/modules/bank/bankAccounts.js';
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
    const depts = await fetchDepartments();
    const deptOptions = depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    body.innerHTML = users.map(u => `
      <tr>
        <td>${u.email}</td>
        <td>${u.full_name || '-'}</td>
        <td>
          <select class="role-select" onchange="updateUserProfile('${u.id}', 'role', this.value)">
            ${Object.entries(ROLE_LABELS).map(([val, label]) => `<option value="${val}" ${u.role === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </td>
        <td>
          <!-- 修正：將傳入欄位與預設選取判定，皆改為符合資料庫的 department_id -->
          <select class="dept-select" onchange="updateUserProfile('${u.id}', 'department_id', this.value)">
            <option value="">未設定</option>
            ${depts.map(d => `<option value="${d.id}" ${u.department_id === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
          </select>
        </td>
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

// ===== 1. 全域狀態標籤 (移到 ui.js 最上方) =====
function getStatusBadge(status) {
  switch (status) {
    case 'pending_review':
      return `<span class="badge warning" style="background:#fef08a; color:#854d0e; padding:2px 8px; border-radius:12px; font-size:12px;">待主管審核</span>`;
    case 'pending_accounting':
      return `<span class="badge warning" style="background:#fde047; color:#854d0e; padding:2px 8px; border-radius:12px; font-size:12px;">待會計核准</span>`;
    case 'approved':
      return `<span class="badge success" style="background:#bbf7d0; color:#166534; padding:2px 8px; border-radius:12px; font-size:12px;">已核准待付款</span>`;
    case 'manager_rejected':
    case 'accounting_rejected':
      return `<span class="badge danger" style="background:#fecaca; color:#991b1b; padding:2px 8px; border-radius:12px; font-size:12px;">已退件</span>`;
    case 'closed':
      return `<span class="badge secondary" style="background:#e2e8f0; color:#475569; padding:2px 8px; border-radius:12px; font-size:12px;">已付款結案</span>`;
    case 'cancelled':
      return `<span class="badge secondary" style="background:#cbd5e1; color:#334155; padding:2px 8px; border-radius:12px; font-size:12px;">已撤銷</span>`;
    default:
      return `<span class="badge secondary" style="background:#eee; padding:2px 8px; border-radius:12px; font-size:12px;">${status || '未知'}</span>`;
  }
}

// ===== 2. 姓名遮罩工具 (新增到全域) =====
// ===== 智能姓名遮罩 (廠商不遮罩，個人遮罩) =====
function maskPersonName(name, identifier) {
  if (!name) return '';
  // 如果是統編 (通常為 8 碼)，視為公司行號，顯示全名
  if (identifier && identifier.length === 8 && !isNaN(identifier)) {
    return name;
  }
  
  // 否則視為個人，進行姓名打 O 處理
  if (name.length === 2) return name[0] + 'O';
  if (name.length === 3) return name[0] + 'O' + name[2];
  if (name.length >= 4) return name[0] + 'O' + name.slice(2);
  return name;
}

// ===== 身分證字號遮罩 (例如: U800****518) =====
function maskIdentifierString(identifier) {
  if (!identifier) return '';
  // 如果是統編 (8 碼)，不遮罩
  if (identifier.length === 8 && !isNaN(identifier)) {
    return identifier;
  }
  // 台灣身分證通常為 10 碼 (例如: A123456789)
  if (identifier.length >= 10) {
    return identifier.substring(0, 4) + '****' + identifier.substring(identifier.length - 3);
  }
  return identifier;
}

// ===== 更新自動帶入資料的 AJAX 邏輯 =====
window.fetchAndMaskPayee = async (index, identifier) => {
  if (!identifier) {
    updateLineData(index, 'payeeName', '');
    renderVoucherLines();
    return;
  }
  
  try {
    // 假設呼叫 supabase 查詢資料庫
    const { data } = await supabase.from('payees').select('name').eq('identifier', identifier).single();
    
    // 如果資料庫有找到名字，存入真實姓名
    if (data && data.name) {
      voucherLines[index].payeeName = data.name;
    } else {
      // 找不到時，若是 8 碼暫定為未知廠商，否則為未知個人
      voucherLines[index].payeeName = identifier.length === 8 ? '未知廠商' : '未知個人';
    }
    
    updateLineData(index, 'payeeIdentifier', identifier);
    renderVoucherLines(); // 觸發畫面重新渲染
  } catch (err) {
    console.error('查詢失敗:', err);
  }
};

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

// ===== 5. 重構 Dashboard (確保替換掉舊的，不要出現包裝兩層的狀況) =====
async function renderDashboard() {
  const container = document.getElementById('dashboardContainer') || document.getElementById('dashboard');
  if (!container) return;

  const user = state.currentUser || JSON.parse(localStorage.getItem('currentUser') || '{}');
  if (!user) return;

  const isPrivileged = ['admin', 'accounting'].includes(user.role);

  try {
    // ====================== 取得報支單（重要：部門權限過濾） ======================
    let voucherQuery = supabase.from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .order('created_at', { ascending: false });

    // 權限控制
    if (isPrivileged) {
      // admin 和 accounting 看全部
    } else if (user.role === 'manager' && user.department_id) {
      // manager 只能看自己部門
      voucherQuery = voucherQuery.eq('department_id', user.department_id);
    } else if (user.role === 'employee' && user.department_id) {
      // employee 只能看自己部門
      voucherQuery = voucherQuery.eq('department_id', user.department_id);
    }

    const { data: vchs, error: vError } = await voucherQuery;
    if (vError) throw vError;

    let dashboardHTML = '';

    // 4張卡片（只有管理員/會計看得到）
    if (isPrivileged) {
      const { data: projects } = await supabase.from('projects').select('total_budget');
      const annualBudget = projects?.reduce((sum, p) => sum + Number(p.total_budget || 0), 0) || 0;

      const { data: banks } = await supabase.from('bank_accounts').select('*');
      const bankBalance = banks?.reduce((sum, b) => sum + Number(b.opening_balance || 0), 0) || 0;

      const totalPaid = vchs.filter(v => v.status === 'closed')
                           .reduce((sum, v) => sum + Number(v.total_amount || 0), 0);
      const pendingPayment = vchs.filter(v => v.status === 'approved')
                                .reduce((sum, v) => sum + Number(v.total_amount || 0), 0);

      dashboardHTML += `
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:24px;">
          <div style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #10b981; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <h4 style="margin:0; color:#6b7280;">年度總預算</h4>
            <h2 style="margin:10px 0 0; color:#1f2937;">$${annualBudget.toLocaleString()}</h2>
          </div>
          <div style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #3b82f6; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <h4 style="margin:0; color:#6b7280;">已付款</h4>
            <h2 style="margin:10px 0 0; color:#1f2937;">$${totalPaid.toLocaleString()}</h2>
          </div>
          <div style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #f59e0b; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <h4 style="margin:0; color:#6b7280;">待付款</h4>
            <h2 style="margin:10px 0 0; color:#1f2937;">$${pendingPayment.toLocaleString()}</h2>
          </div>
          <div style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #8b5cf6; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <h4 style="margin:0; color:#6b7280;">銀行可用餘額</h4>
            <h2 style="margin:10px 0 0; color:#1f2937;">$${bankBalance.toLocaleString()}</h2>
          </div>
        </div>
      `;
    }

    // ====================== 明細列表（所有人都看得到，但已過濾） ======================
    dashboardHTML += `
      <div style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05); margin-top:20px;">
        <h3>${isPrivileged ? '全公司核銷明細' : '我的部門核銷紀錄'}</h3>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th>單號</th>
              <th>申請人</th>
              <th>部門</th>
              <th>摘要</th>
              <th>金額</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            ${vchs.map(v => `
              <tr>
                <td><a href="javascript:void(0)" onclick="viewVoucherDetail('${v.id}')" style="color:#007bff; font-weight:bold;">${v.voucher_no || '未編號'}</a></td>
                <td>${v.profiles?.full_name || '-'}</td>
                <td>${v.departments?.name || '-'}</td>
                <td>${v.summary || '-'}</td>
                <td>$${Number(v.total_amount || 0).toLocaleString()}</td>
                <td>${getStatusBadgeWithDate(v)}</td>
              </tr>
            `).join('') || '<tr><td colspan="6" style="text-align:center; padding:20px;">目前尚無核銷紀錄</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = dashboardHTML;

  } catch (err) {
    console.error('渲染 Dashboard 失敗:', err);
    container.innerHTML = `<p style="color:red; padding:20px;">載入失敗：${err.message}</p>`;
  }

    // ====================== 專案/全公司總覽 部分 ======================
    const selectedProj = state.currentProjectId || state.selectedProjectId || 'all';

    try {
      if (selectedProj === 'all') {
        // ==================== 全公司總覽 ====================
        let voucherQuery = supabase.from('vouchers').select('*, profiles!applicant_id(full_name), departments(name)');
        
        if (!isPrivileged) {
          voucherQuery = voucherQuery.eq('department_id', user.department_id);
        }

        const { data: vchs, error } = await voucherQuery;
        if (error) throw error;

        const validVouchers = vchs?.filter(v => v.status !== 'voided') || [];
        const totalExpense = validVouchers.reduce((sum, v) => sum + Number(v.total_amount || 0), 0);
        const txCount = vchs?.length || 0;

        // 注意：這裡使用 += ，不會蓋掉前面的 4 張卡片
        container.innerHTML += `
          <div style="margin-top: 30px;">
            <div style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05); margin-bottom:20px;">
              <h2>財務管理系統</h2>
              <p>歡迎，${user.name || '使用者'} (${user.role})</p>
            </div>
            
            <div class="stats-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; margin-bottom:24px;">
              <div class="card" style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h4>總申請筆數</h4><h3>${txCount} 筆</h3>
              </div>
              <div class="card" style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h4>全公司實際支出 (核銷完成)</h4><h3 style="color:#d9534f;">$${totalExpense.toLocaleString()}</h3>
              </div>
              <div class="card" style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h4>本月狀態</h4><h3>正常營運</h3>
              </div>
            </div>

            <h3>${isPrivileged ? '公司全體實際核銷明細流水賬' : '所屬部門核銷進度'}</h3>
            <table class="table" style="width:100%; background:#fff; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th>單號</th><th>申請人</th><th>部門</th><th>摘要說明</th><th>金額</th><th>狀態</th>
                </tr>
              </thead>
              <tbody>
                ${vchs?.map(v => `
                  <tr>
                    <td><a href="javascript:void(0)" onclick="viewVoucherDetail('${v.id}')" style="color:#007bff; font-weight:bold; text-decoration:underline;">${v.voucher_no}</a></td>
                    <td>${v.profiles?.full_name || '系統'}</td>
                    <td>${v.departments?.name || '跨部門/未分類'}</td>
                    <td>${v.summary || '-'}</td>
                    <td>$${Number(v.total_amount || 0).toLocaleString()}</td>
                    <td><span class="badge ${v.status}">${v.status === 'voided' ? '已銷案' : '處理中'}</span></td>
                  </tr>
                `).join('') || '<tr><td colspan="6" class="muted">目前無核銷明細資料</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } 
      else {
        // ==================== 單一專案模式 ====================
        const { data: proj } = await supabase.from('projects').select('*').eq('id', selectedProj).single();
        const { data: projVchs } = await supabase.from('vouchers').select('*, profiles!applicant_id(full_name)').eq('project_id', selectedProj);

        if (!proj) return;

        const validProjVchs = projVchs?.filter(v => v.status !== 'voided') || [];
        const actualSpent = validProjVchs.reduce((sum, v) => sum + Number(v.total_amount || 0), 0);
        const remainingBudget = Number(proj.total_budget || 0) - actualSpent;

        container.innerHTML += `
          <div style="margin-top: 30px;">
            <div style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05); margin-bottom:20px;">
              <h2>專案控制面板：${proj.name}</h2>
              <p>專案代碼：<strong>${proj.project_code}</strong></p>
            </div>

            <div class="stats-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; margin-bottom:24px;">
              <div class="card" style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #28a745; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h4>專案預算總額</h4><h3 style="color:#28a745;">$${Number(proj.total_budget || 0).toLocaleString()}</h3>
              </div>
              <div class="card" style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #dc3545; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h4>專案實際花費</h4><h3 style="color:#dc3545;">$${actualSpent.toLocaleString()}</h3>
              </div>
              <div class="card" style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #007bff; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h4>專案剩餘預算</h4><h3 style="color:#007bff;">$${remainingBudget.toLocaleString()}</h3>
              </div>
            </div>

            <h4>專案核銷清單 (共計 ${projVchs?.length || 0} 筆資料)</h4>
            <table class="table" style="width:100%; background:#fff;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th>報支單號</th><th>申請人</th><th>摘要</th><th>金額</th><th>狀態</th>
                </tr>
              </thead>
              <tbody>
                ${projVchs?.map(pv => `
                  <tr>
                    <td><a href="javascript:void(0)" onclick="viewVoucherDetail('${pv.id}')" style="color:#007bff; font-weight:bold; text-decoration:underline;">${pv.voucher_no}</a></td>
                    <td>${pv.profiles?.full_name || '-'}</td>
                    <td>${pv.summary || '-'}</td>
                    <td>$${Number(pv.total_amount || 0).toLocaleString()}</td>
                    <td><span class="badge">${pv.status === 'voided' ? '已銷案(不計預算)' : '生效中'}</span></td>
                  </tr>
                `).join('') || '<tr><td colspan="5">該專案目前無單據紀錄</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (e) {
      console.error('專案總覽渲染失敗:', e);
  }
}

function renderTransactionTable() {
  let txs = state.transactions || [];
  
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
    
    // 憑證顯示：若有 voucher_id 則可點擊彈出，否則顯示文字或待補
    const voucherDisplay = tx.voucher_id ? 
      `<a href="javascript:void(0)" onclick="viewVoucherDetail('${tx.voucher_id}')" style="color:#007bff; font-weight:bold; text-decoration:underline;">${tx.voucher || '檢視憑證'}</a>` : 
      (tx.voucher ? `<span class="badge">${tx.voucher}</span>` : '<span class="badge wait">無憑證</span>');

    // 嚴格對應 HTML Header: 憑證 | 日期 | 銀行 | 明細 | 類型 | 分類 | 金額 | 操作
    row.innerHTML = `
      <td>${voucherDisplay}</td>
      <td>${tx.date}</td>
      <td>${getBankNickname(tx.bankAccountId) || tx.bank || '未設定'}</td>
      <td>${tx.detail}<div class="muted">${tx.customer || ''}</div></td>
      <td>${tx.type}</td>
      <td>${tx.category || '營業'}</td>
      <td>$${Number(tx.amount).toLocaleString()}</td>
      <td><button class="secondary delete-transaction-btn" data-index="${index}">刪除</button></td>
    `;
    body.appendChild(row);
  });
}

function getReportPeriodTransactions() {
  const start = document.getElementById('reportPeriodStart')?.value;
  const end = document.getElementById('reportPeriodEnd')?.value;
  const txs = state.transactions || []; // 加上預設空陣列
  if (!start && !end) return txs;
  return txs.filter(tx => {
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

function applyReportPeriodPreset(preset) {
  const year = new Date().getFullYear();
  const startInput = document.getElementById('reportPeriodStart');
  const endInput = document.getElementById('reportPeriodEnd');
  if (!startInput || !endInput) return;
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const ranges = {
    year: [`${year}-01-01`, `${year}-12-31`],
    q1: [`${year}-01-01`, `${year}-03-31`],
    q2: [`${year}-04-01`, `${year}-06-30`],
    q3: [`${year}-07-01`, `${year}-09-30`],
    q4: [`${year}-10-01`, `${year}-12-31`],
    month: [`${year}-${pad(today.getMonth() + 1)}-01`, today.toISOString().slice(0, 10)],
    all: ['', '']
  };
  const [start, end] = ranges[preset] || ['', ''];
  startInput.value = start;
  endInput.value = end;
  renderReports();
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
  // 🔥 修正：正確宣告 body 變數來對應表格容器
  const body = document.getElementById('bankAccountTableBody');
  if (!body) return;

  try {
    let accounts = await loadBankAccounts();
    if (!accounts || !Array.isArray(accounts)) accounts = [];

    body.innerHTML = accounts.map(a => {
      const openingBalance = Number(a.opening_balance || 0); // 取得該帳戶期初餘額
      const transactionNet = getBankBalance(a.id, state.transactions || []); // 計算交易加減項
      const totalBalance = openingBalance + transactionNet; // 總餘額

      return `
        <tr>
          <td>${a.bank_name || a.bankName || '未命名'}</td>
          <td>${a.account_number || a.accountNumber || '-'}</td>
          <td>${a.nickname || '-'}</td>
          <td>${totalBalance.toLocaleString()}</td>
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
    body.innerHTML = '<tr><td colspan="5" class="muted">載入失敗</td></tr>';
  }
}

function renderVoucherCenter() {
  const body = document.getElementById('voucherCenterTableBody');
  if (!body) return;
  const keyword = (document.getElementById('voucherSearchInput')?.value || '').trim().toLowerCase();
  const txs = state.transactions || []; // 加上預設空陣列
  const filtered = txs.filter(tx => {
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
  // 加上 || [] 確保傳入的是陣列
  const rows = buildBudgetReport(state.transactions || [], period);
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.accountCode} ${r.accountName}</td>
      <td>${r.budget.toLocaleString()}</td>
      <td>${r.actual.toLocaleString()}</td>
      <td style="color:${r.variance > 0 && r.accountCode === '6100' ? 'var(--danger)' : 'inherit'}">${r.variance.toLocaleString()}</td>
      <td>${r.variancePercent.toFixed(1)}%</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">這個月尚未設定預算目標。</td></tr>';

  // ←←← 新增這一行
  renderProjectList();
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
  // 安全等待 DOM 完全載入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeEventsInternal();
    });
    return;
  }
  initializeEventsInternal();
}

function initializeEventsInternal() {
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
              ${new Date(l.created_at).toLocaleString('zh-TW')}｜${l.action}
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

  // Tab 切換（關鍵）
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      if ((tab === 'transactions' || tab === 'bankAccounts') && !['accounting', 'admin'].includes(state.currentUser?.role)) {
        showMessage('僅會計部門與 Admin 可使用', true);
        return;
      }

      state.activeTab = tab;
      renderTabs();
      closeSidebar();

      if (tab === 'voucherWorkflow') {
        populateVoucherFormOptions();
        renderVoucherWorkflowList();
      }
      if (tab === 'adminUsers') {
        populateInviteDepartmentSelect();
        renderAdminUserTable();
        renderAdminDepartmentList();
      }
      if (tab === 'budget') {
        renderBudget();
      }
      if (tab === 'reports') {
        renderReports();
      }
    });
  });
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
  // 在 initializeEventsInternal() 裡面加入/替換
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('確定要登出嗎？')) {
        try {
          await signOutSupabase();
          
          // 👉 修正：登出後直接重整頁面，釋放所有 JavaScript 記憶體變數
          window.location.reload();
          
        } catch (err) {
          console.error(err);
          showMessage('登出失敗', true);
        }
      }
    });
  }

  // 🔥 新增判斷式：確保 addTransactionForm 存在時才綁定事件
  const addTransactionForm = document.getElementById('addTransactionForm');
  if (addTransactionForm) {
    addTransactionForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // 阻止表單預設重整行為

      const bankAccountId = document.getElementById('trans_bank_account_id').value;
      const transType = document.getElementById('trans_type').value; // 'income' 或 'expense'
      const amount = parseFloat(document.getElementById('trans_amount').value);
      const transDate = document.getElementById('trans_date').value;
      const description = document.getElementById('trans_description').value;

      // 簡單防呆
      if (!bankAccountId || !transType || !amount || !transDate) {
        return alert('請填寫所有必填欄位！');
      }

      try {
        const { data, error } = await supabase
          .from('bank_transactions') // 確保這是你的交易資料表名稱
          .insert([{
            bank_account_id: bankAccountId,
            type: transType,
            amount: amount,
            transaction_date: transDate,
            description: description,
            created_by: state.currentUser?.id // 記錄是誰新增的 (如果有此欄位)
          }]);

        if (error) throw error;

        alert('交易新增成功！');
        document.getElementById('addTransactionModal').style.display = 'none';
        e.target.reset(); // 清空表單
        
        // 寫入 Supabase 成功後，同步更新本地狀態並重新渲染
        state.transactions.unshift({
          date: transDate,
          bankAccountId: bankAccountId,
          detail: description,
          type: transType,
          amount: amount,
          source: 'supabase'
        });
        saveState(state);
        render();
      } catch (err) {
        alert(`新增交易失敗: ${err.message}`);
        console.error(err);
      }
    });
  }

  const transactionTableBody = document.getElementById('transactionTableBody');
  if (transactionTableBody) {
    transactionTableBody.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-transaction-btn');
      if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index, 10);
        if (!isNaN(index)) {
          if (confirm('確定要刪除這筆交易紀錄嗎？')) {
            state.transactions.splice(index, 1); // 從陣列中移除
            saveState(state);                    // 儲存至 localStorage
            render();                            // 重新渲染畫面
            showMessage('交易已成功刪除。');
          }
        }
      }
    });
  }

  safeListener('forcePasswordForm', 'submit', async (e) => {
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
    showApp();});
  safeListener('loginForm', 'submit', async (e) => { 
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
    showApp();});
  safeListener('companyInfoForm', 'submit', (e) => {e.preventDefault();
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

  const bankForm = document.getElementById('bankAccountForm');
  if (bankForm) {
    bankForm.onsubmit = async (e) => {
      e.preventDefault();

      const bankData = {
        bank_name: document.getElementById('bankName').value.trim(),
        account_number: document.getElementById('bankAccountNumber').value.trim(),
        nickname: document.getElementById('bankNickname').value.trim(),
        opening_balance: parseFloat(document.getElementById('bankOpeningBalance').value) || 0
      };

      if (state.editingBankId) {
        // 執行更新 (Update)
        const { error } = await supabase
          .from('bank_accounts')
          .update(bankData)
          .eq('id', state.editingBankId);

        if (error) {
          alert('更新失敗：' + error.message);
        } else {
          alert('銀行帳戶已成功更新！');
          window.resetBankForm(); // 恢復新增狀態
          renderBankAccounts();   // 重新整理列表與餘額
        }
      } else {
        // 執行新增 (Insert)
        const { error } = await supabase
          .from('bank_accounts')
          .insert([bankData]);

        if (error) {
          alert('新增失敗：' + error.message);
        } else {
          alert('銀行帳戶已成功新增！');
          bankForm.reset();
          renderBankAccounts();
        }
      }
    };
  }

  document.getElementById('bankAccountTableBody')?.addEventListener('click', async (e) => {
    // 1. 處理刪除按鈕
    const deleteBtn = e.target.closest('.delete-bank-btn');
    if (deleteBtn) {
      if (confirm('確定刪除此銀行帳戶？')) {
        await deleteBankAccount(deleteBtn.dataset.id);
        renderBankAccounts();
        showMessage('銀行帳戶已刪除。');
      }
      return;
    }

    // 2. 處理編輯按鈕（補上這段讓編輯功能正常運作）
    const editBtn = e.target.closest('.edit-bank-btn');
    if (editBtn) {
      const accountId = editBtn.dataset.id;
      if (typeof window.editBankAccount === 'function') {
        window.editBankAccount(accountId);
      }
      return;
    }
  });

  // 其他重要 listener
  safeListener('transactionForm', 'submit', async (e) => { e.preventDefault();

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
  safeListener('printReportBtn', 'click', () => {
    state.activeTab = 'reports';
    renderTabs();
    setTimeout(() => {
      window.print();
    }, 100);
  });

  document.querySelectorAll('.period-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyReportPeriodPreset(btn.dataset.preset));
  });

  safeListener('exportExcelBtn', 'click', () => {
    exportReportsToExcel().catch(err => showMessage(`匯出失敗：${err.message}`, true));
  });

  safeListener('inviteUserForm', 'submit', async (e) => { e.preventDefault();
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
  // 全域函式：點擊按鈕動態往 Table 追加一列
  window.addExcelRow = () => {
    const tbody = document.getElementById('excelLinesBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="month" class="grid-month" style="width:96%; padding:4px;"></td>
      <td>
        <select class="grid-inv-type" onchange="toggleInvoiceRequired(this)">
          <option value="無">無</option>
          <option value="發票">發票</option>
          <option value="收據">收據</option>
        </select>
      </td>
      <td><input type="text" class="grid-inv-num" placeholder="可留空" style="width:90%; padding:4px;" disabled></td>
      
      <!-- 新增：會計科目選擇 -->
      <td>
        <select class="line-account-code" style="width:100%; padding:4px;">
          <option value="6100">6100 營業費用</option>
          <option value="1601">1601 固定資產</option>
          <option value="1141">1141 應收帳款</option>
          <option value="2141">2141 應付帳款</option>
          <option value="3110">3110 股本</option>
        </select>
      </td>
      
      <td><input type="text" class="grid-desc" placeholder="例如：住宿費" style="width:96%; padding:4px;"></td>
      <td><input type="number" class="grid-amount" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateVoucherTotal()"></td>
      <td>
        <input type="text" class="grid-payee-id" placeholder="身分證/統編" style="width:90%; padding:4px;">
      </td>
      <td style="text-align:center;">
        <button type="button" class="danger" onclick="this.closest('tr').remove(); calculateVoucherTotal();">刪除</button>
      </td>
    `;
    tbody.appendChild(tr);
  };

  // 表單提交封包邏輯
  const excelVoucherForm = document.getElementById('voucherCreateForm');
  if (excelVoucherForm) {
    excelVoucherForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      try {
        const fileInput = document.getElementById('voucherFileInput');
        const selectedFile = fileInput?.files[0] || null;

        const txDate = document.getElementById('vDate')?.value || new Date().toISOString().split('T')[0];
        const projectId = document.getElementById('vProject')?.value || null;
        const generalSummary = document.getElementById('vSummary')?.value.trim() || "批量多行核銷單據";

        const rows = document.querySelectorAll('#excelLinesBody tr');
        let detailLines = [];
        let invoiceLines = [];
        let calculatedTotal = 0;

        rows.forEach((row, index) => {
          const descInput = row.querySelector('.grid-desc');
          const amtInput = row.querySelector('.grid-amount');
          const invTypeInput = row.querySelector('.grid-inv-type');
          const invNumInput = row.querySelector('.grid-inv-num');
          const accountSelect = row.querySelector('.line-account-code'); // ← 新增：取得科目選擇

          if (!descInput || !amtInput) return;

          const desc = descInput.value.trim();
          const amt = Number(amtInput.value || 0);
          const invType = invTypeInput ? invTypeInput.value : '無';
          const invNum = invNumInput ? invNumInput.value.trim() : '';
          const accountCode = accountSelect ? accountSelect.value : '6100'; // ← 預設6100

          // 過濾空白列
          if (!desc || amt <= 0) return;

          calculatedTotal += amt;

          detailLines.push({
            description: desc,
            account_code: accountCode,        // ← 重要：使用使用者選擇的科目
            amount: amt
          });

          if (invType !== '無') {
            invoiceLines.push({
              invoice_type: invType,
              invoice_number: invNum || null,
              amount: amt,
              tax_amount: 0
            });
          }
        });

        if (detailLines.length === 0) {
          throw new Error('請至少填寫一筆有效的摘要與金額！');
        }

        // ==================== 送出到 Supabase ====================
        const { data: voucherMain, error: vError } = await supabase
          .from('vouchers')
          .insert([{
            // voucher_no 不要自己填，讓 trigger 產生
            project_id: projectId && projectId !== 'all' ? projectId : null,
            applicant_id: state.currentUser?.id,
            tx_date: txDate,
            category: '營業',
            summary: generalSummary,
            total_amount: calculatedTotal,
            status: 'pending_review'
          }]).select().single();

        if (vError) throw vError;

        // 2. 寫入明細（已支援不同科目）
        const finalLines = detailLines.map(l => ({ ...l, voucher_id: voucherMain.id }));
        const { error: lError } = await supabase.from('voucher_lines').insert(finalLines);
        if (lError) throw lError;

        // 3. 寫入發票
        if (invoiceLines.length > 0) {
          const finalInvoices = invoiceLines.map(i => ({ ...i, voucher_id: voucherMain.id }));
          await supabase.from('invoices').insert(finalInvoices);
        }

        // 4. 上傳附件
        if (selectedFile) {
          await saveAttachment(voucherMain.id, selectedFile);
        }

        alert(`✅ 送出成功！總計金額：$${calculatedTotal.toLocaleString()}`);

        // 重置表單
        if (fileInput) fileInput.value = '';
        excelVoucherForm.reset();

        // 重新渲染明細表格
        if (typeof renderVoucherLines === 'function') {
          renderVoucherLines();
        } else {
          const tbody = document.getElementById('excelLinesBody');
          if (tbody) tbody.innerHTML = '';
          for(let i = 0; i < 3; i++) {
            if (typeof window.addExcelRow === 'function') window.addExcelRow();
          }
        }

        // 刷新頁面
        renderDashboard();
        if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();

      } catch (err) {
        console.error(err);
        alert('送出報支單失敗：' + err.message);
      }
    });
  }
  // 新增的專案與部門
  safeListener('projectForm', 'submit', async (e) => {
    e.preventDefault();
    if (!['accounting', 'admin'].includes(state.currentUser?.role)) {
      showMessage('僅會計部門與 Admin 可建立專案', true);
      return;
    }
    
    try {
      const name = document.getElementById('projectName').value.trim();
      const totalBudget = parseFloat(document.getElementById('projectTotalBudget').value) || 0;
      
      if (!name) {
        showMessage('請輸入專案名稱', true);
        return;
      }

      // 1. 建立主專案
      const { data: newProject, error: projError } = await supabase
        .from('projects')
        .insert({
          name: name,
          start_date: document.getElementById('projectStart').value || null,
          end_date: document.getElementById('projectEnd').value || null,
          department_id: document.getElementById('projectDepartment').value || null,
          total_budget: totalBudget,
          remaining_budget: totalBudget
        })
        .select()
        .single();

      if (projError) throw projError;

      // 2. 建立預算分類項目
      if (totalBudget > 0) {
        const budgetItems = [
          { project_id: newProject.id, category: '人事費用', amount: Math.round(totalBudget * 0.4) },
          { project_id: newProject.id, category: '營運費用', amount: Math.round(totalBudget * 0.35) },
          { project_id: newProject.id, category: '資本門', amount: Math.round(totalBudget * 0.2) },
          { project_id: newProject.id, category: '其他', amount: Math.round(totalBudget * 0.05) }
        ];

        const { error: itemsError } = await supabase
          .from('project_budget_items')
          .insert(budgetItems);

        if (itemsError) console.warn('預算分類建立失敗，但專案已成功:', itemsError);
      }

      showMessage('專案已建立，並已設定預算分類！');
      e.target.reset();
      
      renderProjectList();
      loadAndRenderProjects();
      renderDashboard();

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
  // 交易表單
  setupTransactionForm();
}

let voucherLines = [];

// ===== 3. 更新新增列的資料結構 =====
// 找到你原本 push 4個欄位的地方，改成以下結構：
function addVoucherLine() {
  voucherLines.push({
    receiptMonth: '',
    receiptType: 'invoice',
    invoiceNumber: '',
    description: '',
    amount: 0,
    payeeIdentifier: '',
    payeeName: '' // 這裡未來會透過 API 自動帶入
  });
  renderVoucherLines();
}

// ===== 4. 重寫明細渲染邏輯 =====
function renderVoucherLines() {
  const tbody = document.querySelector('#voucherLinesTable tbody') || document.getElementById('excelLinesBody');
  if (!tbody) return;

  // 過濾掉金額為 0 或摘要空白的無效列
  const validLines = voucherLines.filter(line => line.description && line.description.trim() !== '' && Number(line.amount) > 0);

  if (validLines.length === 0) {
    alert('請至少填寫一筆有效的報支明細！');
    return;
  }

  tbody.innerHTML = voucherLines.map((line, i) => `
    <tr>
      <td>
        <input type="month" value="${line.receiptMonth || ''}" class="line-month" data-index="${i}" onchange="updateLineData(${i}, 'receiptMonth', this.value)">
      </td>
      <td>
        <select class="line-type" data-index="${i}" onchange="updateLineData(${i}, 'receiptType', this.value); renderVoucherLines();">
          <option value="invoice" ${line.receiptType==='invoice'?'selected':''}>發票</option>
          <option value="receipt" ${line.receiptType==='receipt'?'selected':''}>收據</option>
          <option value="none" ${line.receiptType==='none'?'selected':''}>無</option>
        </select>
      </td>
      <td>
        <input type="text" value="${line.invoiceNumber || ''}" class="line-invoice" data-index="${i}" placeholder="${line.receiptType==='invoice' ? '必填發票號碼' : '可留空'}" ${line.receiptType==='invoice' ? 'required' : ''} onchange="updateLineData(${i}, 'invoiceNumber', this.value)">
      </td>
      <td>
        <input type="text" value="${line.description || ''}" class="line-desc" data-index="${i}" placeholder="住宿費 / 餐費" required onchange="updateLineData(${i}, 'description', this.value)">
      </td>
      <td>
        <input type="number" value="${line.amount || 0}" class="line-amount" data-index="${i}" min="0" required onchange="updateLineData(${i}, 'amount', Number(this.value)); updateVoucherTotal();">
      </td>
      <td>
        <!-- 實際輸入框 (供員工輸入真實統編/身分證，送出時會傳給資料庫) -->
        <input type="text" value="${line.payeeIdentifier || ''}" class="line-payee-id" data-index="${i}" placeholder="身份證或統編" onblur="fetchAndMaskPayee(${i}, this.value)">
        
        <!-- 預覽文字區塊 (顯示智能打碼後的結果) -->
        <div class="payee-preview" style="font-size: 12px; color: #666; margin-top: 4px;">
          ${line.payeeName ? `
            姓名：${maskPersonName(line.payeeName, line.payeeIdentifier)} <br>
            證號：${maskIdentifierString(line.payeeIdentifier)}
          ` : ''}
        </div>
      </td>
      <td style="text-align: center;">
        <button type="button" class="danger" style="padding: 4px 8px; background: #dc2626; color: white; border: none; border-radius: 4px;" onclick="removeLine(${i})">刪除</button>
      </td>
    </tr>
  `).join('');
}

// 輔助函式：更新陣列資料
window.updateLineData = (index, field, value) => {
  voucherLines[index][field] = value;
};

// 輔助函式：刪除列
window.removeLine = (index) => {
  voucherLines.splice(index, 1);
  renderVoucherLines();
  updateVoucherTotal();
};

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
      fetchAccounts(), fetchBankAccounts(), fetchDepartments()
    ]);

    // 控制會計專用區塊顯示
    const role = state.currentUser?.role;
    const acctGroup = document.getElementById('accountingFieldsGroup');
    if (acctGroup) {
        acctGroup.style.display = ['accounting', 'admin'].includes(role) ? 'flex' : 'none';
    }

    // 初始進入此頁面時，預設給 5 個空列
    const tbody = document.getElementById('excelLinesBody');
    if (tbody && tbody.children.length === 0) {
        for(let i=0; i<5; i++) window.addExcelRow();
    }

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
  if (['manager', 'admin'].includes(role) && v.status === 'pending_review') {
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
    
    if (vouchers.length === 0) {
      container.innerHTML = '<p class="muted">目前沒有任何報支申請。</p>';
      return;
    }

    const htmlContent = vouchers.map(row => {
      let actionButtons = '';
      const currentUserRole = state.currentUser?.role; 
      const vStatus = row.status; 

      if (currentUserRole === 'employee') {
        if (['pending_review'].includes(vStatus)) {
          actionButtons = `
            <button class="btn-small secondary edit-voucher-btn" data-id="${row.id}">請求修正</button>
            <button class="btn-small danger cancel-voucher-btn" data-id="${row.id}">撤回</button>
          `;
        } else if (['manager_rejected', 'accounting_rejected'].includes(vStatus)) {
          actionButtons = `<button class="btn-small secondary edit-voucher-btn" data-id="${row.id}">修改並重送</button>`;
        } else {
          actionButtons = `<button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button>`;
        }
      } 
      else if (currentUserRole === 'manager') {
        if (vStatus === 'pending_review') {
          actionButtons = `
            <button class="btn-small primary approve-voucher-btn" data-id="${row.id}" data-stage="manager">核准</button>
            <button class="btn-small warning reject-voucher-btn" data-id="${row.id}" data-stage="manager">退件</button>
          `;
        } else {
          actionButtons = `<button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button>`;
        }
      } 
      else if (['accounting', 'admin'].includes(currentUserRole)) {
        if (vStatus === 'pending_accounting') {
          actionButtons = `
            <button class="btn-small success" onclick="openAccountingReviewModal('${row.id}')">
              詳細審核 & 歸帳
            </button>
            <button class="btn-small warning reject-voucher-btn" data-id="${row.id}" data-stage="accounting">退件</button>
          `;
        } else if (vStatus === 'approved') {
          actionButtons = `
            <button class="btn-small success close-voucher-btn" data-id="${row.id}" onclick="closeVoucher('${row.id}')">
              執行付款銷案
            </button>
          `;
        } else {
          actionButtons = `<button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button>`;
        }
      }

      return `
        <tr>
          <td>${row.voucher_no || '未編號'}</td>
          <td>${row.summary || '-'}</td>
          <td>$${Number(row.total_amount || 0).toLocaleString()}</td>
          <td>${getStatusBadge(vStatus)}</td>
          <td>${actionButtons}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>單號</th>
            <th>摘要</th>
            <th>金額</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${htmlContent}
        </tbody>
      </table>
    `;

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
    const depts = await fetchDepartments();
    const deptOptions = depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    container.innerHTML = projects.map(p => `
      <div style="border:1px solid #ddd; padding:12px; margin:8px 0; border-radius:6px;" id="project-card-${p.id}">
        <strong>${p.project_code || '無編號'} - ${p.name}</strong><br>
        預算：<input type="number" id="edit-budget-${p.id}" value="${p.total_budget || 0}" style="width:100px;"> | 剩餘：${Number(p.remaining_budget || 0).toLocaleString()}<br>
        部門：<select id="edit-dept-${p.id}">
                <option value="">無部門</option>
                ${deptOptions}
             </select><br>
        <div style="margin-top: 8px;">
            <button onclick="updateProject('${p.id}')" class="primary-btn">儲存修改</button>
            <button onclick="deleteProject('${p.id}')" class="danger">刪除</button>
        </div>
      </div>
    `).join('');
    // 將各專案原本的部門選上
    projects.forEach(p => {
      const select = document.getElementById(`edit-dept-${p.id}`);
      if (select && p.department_id) select.value = p.department_id;
    });
  } catch (e) {
    container.innerHTML = '<p class="muted">載入專案失敗</p>';
  }
}

// 綁定更新專案 API
window.updateProject = async (id) => {
  const newBudget = document.getElementById(`edit-budget-${id}`).value;
  const newDept = document.getElementById(`edit-dept-${id}`).value;
  
  const { error } = await supabase.from('projects').update({
    total_budget: newBudget,
    department_id: newDept || null
  }).eq('id', id);

  if (error) alert('更新失敗');
  else {
    alert('專案已更新');
    renderProjectList();
  }
};

window.deleteProject = async (id) => {
  if (confirm('確定刪除此專案？')) {
    await supabase.from('projects').delete().eq('id', id);
    renderProjectList();
  }
};

// 部門管理
async function renderAdminDepartmentList() {
  const container = document.getElementById('departmentList') || document.getElementById('adminDeptTableBody');
  if (!container) return;
  
  try {
    const { data: depts, error } = await supabase.from('departments').select('*').order('created_at');
    if (error) throw error;

    container.innerHTML = depts.map(d => `
      <tr>
        <td><span id="dept-display-name-${d.id}" style="font-weight:bold;">${d.name}</span></td>
        <td>
          <button onclick="editDepartmentName('${d.id}')" class="secondary" style="padding:4px 10px; margin-right:6px;">修改名字</button>
        </td>
      </tr>
    `).join('') || '<tr><td>暫無部門資料</td></tr>';
  } catch (err) {
    console.error(err);
  }
}

// 🔥 將此編輯函式暴露至全域 window 物件
window.editDepartmentName = async (id) => {
  const currentNameEl = document.getElementById(`dept-display-name-${id}`);
  const currentName = currentNameEl ? currentNameEl.innerText : '';
  const newName = prompt('請輸入新的部門名稱：', currentName);
  
  if (newName === null) return; // 使用者點選取消
  if (!newName.trim()) return alert('部門名稱不可為空白！');

  try {
    const { error } = await supabase
      .from('departments')
      .update({ name: newName.trim() })
      .eq('id', id);

    if (error) throw error;
    alert('部門名稱已順利修改！');
    renderAdminDepartmentList(); // 立即重新渲染畫面
  } catch (err) {
    alert(`修改失敗：${err.message}`);
  }
};

window.deleteDepartment = async (id) => {
  if (confirm('確定刪除此部門？如果已有使用者或專案綁定，可能無法刪除。')) {
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) alert('刪除失敗：' + error.message);
    else renderAdminDepartmentList();
  }
};

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
    select.innerHTML = html;

    // 關鍵修正：只有「目前沒有有效選擇」時才套用預設值，
    // 避免每次 render() 都把使用者剛選好的專案強制改回全公司總覽
    const hasValidSelection = state.currentProjectId &&
      Array.from(select.options).some(opt => opt.value === state.currentProjectId);

    if (hasValidSelection) {
      select.value = state.currentProjectId;
    } else if (['accounting', 'admin'].includes(userRole)) {
      state.currentProjectId = 'all';
      select.value = 'all';
    } else if (projects.length > 0) {
      state.currentProjectId = projects[0].id;
      select.value = projects[0].id;
    } else {
      state.currentProjectId = null;
      select.value = '';
    }

    // 只綁定一次事件，不要每次都 clone/replace（那樣會丟失狀態）
    if (!select.dataset.listenerBound) {
      select.addEventListener('change', () => {
        state.currentProjectId = select.value;
        renderDashboard();
        renderTransactionTable();
        renderReports();
        if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
      });
      select.dataset.listenerBound = 'true';
    }
  } catch (e) {
    console.error('載入專案失敗:', e);
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

// 🔥 統一合併版：點擊單號跳出 Modal 詳細表單視窗
window.viewVoucherDetail = async (voucherId) => {
  try {
    const { data: vch, error: vError } = await supabase
      .from('vouchers').select('*, profiles!applicant_id(full_name)')
      .eq('id', voucherId).single();
    
    if (vError || !vch) throw new Error('無法讀取報支明細資料');

    const { data: lines } = await supabase.from('voucher_lines').select('*').eq('voucher_id', voucherId);
    const { data: invoices } = await supabase.from('invoices').select('*').eq('voucher_id', voucherId);

    // 建立一個覆蓋式動態 Modal 視窗
    let modal = document.getElementById('voucherDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voucherDetailModal';
      modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:9999;";
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff; padding:24px; border-radius:8px; width:90%; max-width:650px; box-shadow:0 4px 20px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #eee; padding-bottom:10px; margin-bottom:15px;">
          <h3 style="margin:0;">單據詳細內容 [${vch.voucher_no}]</h3>
          <button onclick="document.getElementById('voucherDetailModal').style.display='none'" style="font-size:24px; cursor:pointer; background:none; border:none;">&times;</button>
        </div>
        <p><strong>申請日期：</strong>${vch.tx_date}</p>
        <p><strong>申請人：</strong>${vch.profiles?.full_name || '未知'}</p>
        <p><strong>主旨總結：</strong>${vch.summary}</p>
        <p><strong>目前審核狀態：</strong><span style="color:orange; font-weight:bold;">${vch.status}</span></p>
        
        <h4 style="margin-top:20px; border-left:4px solid #007bff; padding-left:8px;">報支項目拆分清單</h4>
        <table class="table" style="width:100%; margin-bottom:15px; border:1px solid #ddd;">
          <tr style="background:#f9f9f9;"><th>摘要項目說明</th><th>科目編號</th><th>核銷金額</th></tr>
          ${lines?.map(l => `<tr><td>${l.description}</td><td>${l.account_code || '-'}</td><td>$${Number(l.amount).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="3">無明細</td></tr>'}
        </table>

        ${invoices?.length ? `<p><strong>憑證關聯：</strong>${invoices[0].invoice_type} - 號碼：${invoices[0].invoice_number || '未填'}</p>` : ''}
        
        <div style="margin-top:20px; text-align:right; gap:10px; display:flex; justify-content:flex-end;">
          ${vch.status !== 'voided' ? `
            <button onclick="processVoidVoucher('${vch.id}', '${vch.project_id}', ${vch.total_amount})" style="background:#d9534f; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">辦理銷案</button>
          ` : '<span style="color:#d9534f; font-weight:bold; align-self:center;">此單據已成功銷案</span>'}
          <button onclick="document.getElementById('voucherDetailModal').style.display='none'" style="background:#6c757d; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">關閉</button>
        </div>
      </div>
    `;
  } catch (err) {
    alert(err.message);
  }
};

// 🔥 統一合併版：執行銷案 (包含返還專案預算邏輯)
window.processVoidVoucher = async (voucherId, projectId, totalAmount) => {
  if (!confirm('確認要將此張報支單辦理「銷案」嗎？系統將保留此單據明細與歷史紀錄，並釋放（返還）已被扣減的專案預算額度。')) return;

  try {
    // 1. 將單據狀態改為已銷案 (voided)
    const { error: updateError } = await supabase
      .from('vouchers')
      .update({ status: 'voided' })
      .eq('id', voucherId);

    if (updateError) throw updateError;

    // ✅ 改成只有原本有扣過預算的才加回去（更安全）
    if (projectId) {
      const { data: proj } = await supabase
        .from('projects')
        .select('remaining_budget')
        .eq('id', projectId)
        .single();

      if (proj) {
        const restored = Number(proj.remaining_budget || 0) + Number(totalAmount || 0);
        await supabase
          .from('projects')
          .update({ remaining_budget: restored })
          .eq('id', projectId);
      }
    }

    // 3. 寫入審批流歷程檔案日誌
    await supabase.from('voucher_workflow_logs').insert([{
      voucher_id: voucherId,
      actor_id: state.currentUser?.id,
      action: 'recall',
      from_status: 'pending_review',
      to_status: 'voided',
      reject_reason: '使用者手動撤銷與辦理銷案'
    }]);

    alert('銷案手續已完成，預算已即時返還！');
    document.getElementById('voucherDetailModal').style.display = 'none';
    
    // 重新更新 Dashboard 和工作流列表
    renderDashboard();
    if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
  } catch (err) {
    alert(`銷案操作失敗：${err.message}`);
  }
};

function updateMenuVisibility() {
  const user = state.currentUser; 
  if (!user) return;

  // 判斷是否為 Admin 或 財務部
  const isFinanceOrAdmin = user.role === 'admin' || user.department === '財務部';

  // 取得銀行與交易管理的選單 DOM 元素 (請替換成你實際的 ID)
  const bankMenu = document.getElementById('nav-bank-management');
  const transactionMenu = document.getElementById('nav-transaction-management');

  if (bankMenu) {
    bankMenu.style.display = isFinanceOrAdmin ? 'block' : 'none';
  }
  
  if (transactionMenu) {
    transactionMenu.style.display = isFinanceOrAdmin ? 'block' : 'none';
  }
}

// 記得在登入成功後，或者畫面載入時呼叫 updateMenuVisibility()

window.updateUserProfile = async (id, field, value) => {
  try {
    const payload = {};
    if (field === 'role') payload.role = value;
    else if (field === 'department_id') payload.departmentId = value || null;
    else if (field === 'full_name') payload.fullName = value;
    await updateUserProfile(id, payload); // calls the imported function
    showMessage('使用者資料已更新。');
    renderAdminUserTable();
  } catch (err) {
    alert('更新失敗：' + err.message);
  }
};

window.editBankAccount = async (id) => {
  try {
    const { data: account, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) throw error;

    // 將資料填入下方的表單欄位中
    document.getElementById('bankName').value = account.bank_name || '';
    document.getElementById('bankAccountNumber').value = account.account_number || '';
    document.getElementById('bankNickname').value = account.nickname || '';
    document.getElementById('bankOpeningBalance').value = account.opening_balance || 0; // 確保期初餘額正確帶入
    // 記錄目前正在編輯的 ID
    state.editingBankId = id;

    // 變更按鈕文字提示修改中
    const submitBtn = document.getElementById('bankAccountForm').querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = '儲存修改';
      submitBtn.style.background = '#ffc107'; 
    }

    // 加上取消按鈕（若還沒有的話）
    let cancelBtn = document.getElementById('cancelEditBankBtn');
    if (!cancelBtn && submitBtn) {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.id = 'cancelEditBankBtn';
      cancelBtn.className = 'secondary';
      cancelBtn.style.cssText = 'margin-top:10px; margin-left:8px;';
      cancelBtn.textContent = '取消編輯';
      cancelBtn.onclick = window.resetBankForm;
      submitBtn.parentNode.appendChild(cancelBtn);
    }

    // 自動滑動到表單區塊
    document.getElementById('bankAccountForm').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(`讀取帳號資料失敗: ${err.message}`);
  }
};

window.resetBankForm = () => {
  state.editingBankId = null;
  const form = document.getElementById('bankAccountForm');
  if (!form) return;
  form.reset();

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = '新增帳戶';
    submitBtn.style.background = '';
  }

  const cancelBtn = document.getElementById('cancelEditBankBtn');
  if (cancelBtn) cancelBtn.remove();
};

// 儲存編輯內容
window.saveBankEdit = async () => {
  const id = document.getElementById('edit_bank_id').value;
  const updateData = {
    bank_name: document.getElementById('edit_bank_name').value,
    account_name: document.getElementById('edit_account_name').value,
    account_number: document.getElementById('edit_account_number').value,
    currency: document.getElementById('edit_currency').value,
    branch: document.getElementById('edit_branch').value
  };

  try {
    const { error } = await supabase
      .from('bank_accounts')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    alert('銀行帳號更新成功！');
    document.getElementById('editBankModal').style.display = 'none';
    renderBankAccounts(); // 重新載入列表
  } catch (err) {
    alert(`更新失敗: ${err.message}`);
  }
};

// ===== 6. 統編/身分證自動查詢對象名稱 (整合到明細中) =====
window.fetchAndMaskPayee = async (index, identifier) => {
  if (!identifier) return;
  
  try {
    const { data, error } = await supabase
      .from('payees')
      .select('name')
      .eq('identifier', identifier)
      .single();
      
    if (data && data.name) {
      voucherLines[index].payeeName = data.name;
    } else {
      voucherLines[index].payeeName = '未知對象 (未建檔)';
    }
    // 重新渲染表格以顯示遮罩後的名稱
    renderVoucherLines();
  } catch (err) {
    console.error('查詢付款對象失敗:', err);
  }
};

// 會計詳細審核 Modal
window.openAccountingReviewModal = async (voucherId) => {
  try {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*, voucher_lines(*), invoices(*)')
      .eq('id', voucherId)
      .single();

    if (!voucher) return alert('找不到單據');

    // 取得銀行帳戶
    const { data: banks } = await supabase.from('bank_accounts').select('*');

    let html = `
      <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; padding:25px; border-radius:12px; width:90%; max-width:700px; max-height:90vh; overflow:auto;">
          <h3>會計審核 - ${voucher.voucher_no}</h3>
          <p><strong>摘要：</strong>${voucher.summary}</p>
          <p><strong>總金額：</strong>$${Number(voucher.total_amount).toLocaleString()}</p>
          
          <h4>明細項目</h4>
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th>摘要</th><th>科目</th><th>金額</th></tr></thead>
            <tbody>
              ${voucher.voucher_lines.map(line => `
                <tr>
                  <td>${line.description}</td>
                  <td>${line.account_code}</td>
                  <td>$${Number(line.amount).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h4 style="margin-top:20px;">歸帳設定</h4>
          <label>會計科目：</label>
          <select id="reviewAccountCode" style="width:100%; padding:8px; margin:8px 0;">
            <option value="6100">6100 營業費用</option>
            <option value="1601">1601 固定資產</option>
          </select>

          <label>付款銀行帳戶：</label>
          <select id="reviewBankAccount" style="width:100%; padding:8px; margin:8px 0;">
            ${banks.map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('')}
          </select>

          <label>備註：</label>
          <textarea id="reviewNote" style="width:100%; height:80px; padding:8px;"></textarea>

          <div style="margin-top:20px; text-align:right;">
            <button onclick="accountingApproveAndClose('${voucherId}')" class="primary-btn">核准並歸帳</button>
            <button onclick="this.closest('.modal-backdrop').remove()" style="margin-left:10px;">取消</button>
          </div>
        </div>
      </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = html;
    document.body.appendChild(modal);

  } catch (err) {
    alert('載入明細失敗：' + err.message);
  }
};

// 執行歸帳
window.accountingApproveAndClose = async (voucherId) => {
  const accountCode = document.getElementById('reviewAccountCode').value;
  const bankId = document.getElementById('reviewBankAccount').value;
  const note = document.getElementById('reviewNote').value;

  // 這裡可以呼叫你原本的 closeVoucherByAccounting 函式
  alert(`已核准並歸帳！\n科目：${accountCode}\n銀行：${bankId}\n備註：${note}`);
  
  // 關閉 Modal 並刷新列表
  document.querySelector('.modal-backdrop').remove();
  renderVoucherWorkflowList();
  renderDashboard();
};

window.closeVoucher = async (voucherId) => {
  if (!confirm('確定要執行付款銷案嗎？')) return;

  try {
    const { error } = await supabase
      .from('vouchers')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', voucherId);

    if (error) throw error;

    alert('銷案成功！');
    renderVoucherWorkflowList();
    renderDashboard();
  } catch (err) {
    alert('銷案失敗：' + err.message);
  }
};

function getStatusBadgeWithDate(v) {
  let text = '';
  if (v.status === 'closed') {
    text = `已付款 ${v.payment_date ? v.payment_date : ''}`;
    return `<span class="badge success">已付款</span>`;
  } else if (v.status === 'approved') {
    return `<span class="badge warning">待付款</span>`;
  } else if (v.status === 'pending_accounting') {
    return `<span class="badge warning">待會計核准</span>`;
  } else if (v.status === 'pending_review') {
    return `<span class="badge warning">待主管審核</span>`;
  }
  return `<span class="badge">${v.status || '處理中'}</span>`;
}