import { supabase } from './supabaseClient.js';
import { getCurrentMonthVoucherSummary } from '../src/modules/voucher/voucherSummary.js';
import { defaultState, loadState, saveState, USER_KEY } from './state.js';
import { isAdminUser } from './auth.js';
import { summarizeTransactions, buildJournal, buildIncomeStatement, buildBalanceSheet, buildCashflowStatement, buildEquityStatement, buildTrialBalance, buildFundraisingSnapshot, fetchAccountBalancesByCode, getEquityAnalysis } from './reports.js';
import { fetchIfrsAdjustments, createIfrsAdjustment, approveIfrsAdjustment, reverseIfrsAdjustment, deleteIfrsAdjustmentDraft } from '../src/modules/ifrsAdjustments/ifrsAdjustmentsApi.js';
import { fetchFinancialReportNotes, updateFinancialReportNote } from '../src/modules/notes/financialNotesApi.js';
import { getAttachmentsByVoucherId, saveAttachment, deleteAttachment, uploadAttachmentFile, openAttachment } from '../src/modules/voucher/attachments.js';
import { signInWithSupabase, getCurrentSessionUser, changeMyPassword, signOutSupabase } from './auth.js';
import { loadBankAccounts, addBankAccount, deleteBankAccount, getBankBalance, setupTransactionForm } from '../src/modules/bank/bankAccounts.js';
import { resolveVoucherNumber } from '../src/modules/voucher/voucherNumbering.js';
import { createProject, updateProjectBudget, fetchProjectBudgetLogs } from '../src/modules/budget/budget.js';
import { fetchAccounts, fetchBankAccounts, fetchDepartments, fetchMyVouchers, fetchWorkflowLogs, createVoucher, updateVoucher, deleteVoucher, managerApprove, managerReject, accountingApprove, accountingReject, closeVoucherByAccounting } from '../src/modules/voucher/voucherApi.js';
import { fetchAllUsers, updateUserProfile, resetUserPassword, toggleUserActive, inviteNewUser, updateUserPermissions, getDefaultPermissions, fetchProjectMembers, updateProjectMembers as saveProjectMembersApi } from '../src/modules/admin/adminApi.js';
import { fetchMyNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from './notifications.js';
import { calcInvoiceTax } from './taxCalc.js';
import { runVoucherCrossVerification } from './voucherVerification.js';
import { userHasPermission as hasUserPermission } from '../src/modules/utils/permissions.js';
import { getCompanyDataBundle, saveCompanyInfo, saveCompanyBusinessItems, saveCompanyShareholders } from './companyContext.js';

// Import modular components
import { renderDashboard } from '../src/modules/dashboard/dashboard.js';
import { renderHeader, renderTabs } from '../src/modules/navigation/navigation.js';
import { 
  showToast, 
  showMessage, 
  setText, 
  getBankNickname, 
  populateBankSelect, 
  maskPersonName, 
  maskIdentifierString, 
  maskPayeeName, 
  getStatusBadge, 
  buildApprovalStepperHtml, 
  buildMiniStepperDots, 
  formatTwd, 
  downloadJsonFile, 
  updateAdminNavVisibility, 
  applyRoleBasedTabVisibility, 
  safeListener, 
  withActionLock,
  closeSidebar, 
  openSidebar, 
  toggleSidebar,
  STATUS_LABELS,
  ROLE_LABELS
} from '../src/modules/utils/uiHelpers.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function renderCompanyInfo() {
    const data = await fetchCompanyData();
    // 進行 DOM 操作將資料顯示在網頁上
}

// 假設全域有一個 state 物件（使用從 `state.js` 匯入的 `defaultState`）

async function initPage() {
  try {
    // 1. 取得目前登入者資訊
    const sessionUser = await getCurrentSessionUser();
    
    if (sessionUser) {
      state.currentUser = sessionUser;

      // 2. 目前不再使用多公司切換模式
      state.myCompanies = [];

      // 3. 渲染 Header (包含版本號)
      await renderHeader(sessionUser);

      // 4. 初始化公司設定
      state.companyInfo = {};
      state.structureSettings = {};

      // 5. 執行既有的渲染函式（若有）
      if (typeof renderCompanyData === 'function') renderCompanyData();
      if (typeof fillCompanyInfoForm === 'function') fillCompanyInfoForm();
      if (typeof renderBusinessData === 'function') renderBusinessData();
    }

    // 6. 一律繼續 app 初始化流程（載入 state、綁定事件、顯示主畫面或登入畫面）
    //    注意：即使未登入，initialize() 內也會綁定 loginForm 事件，讓使用者可以登入。
    await initialize();

  } catch (error) {
    console.error('載入失敗：', error);
  }
}

// 頁面載入完成時執行
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

// ROLE_LABELS 已從 '../src/modules/utils/uiHelpers.js' 匯入（見檔案開頭 import），
// 這裡原本重複宣告了一次同名常數，導致瀏覽器丟出
// "SyntaxError: Identifier 'ROLE_LABELS' has already been declared" 讓整個模組初始化失敗。
// 直接移除這行重複宣告即可，兩處定義內容原本就完全相同。

async function populateInviteDepartmentSelect() {
  const select = document.getElementById('inviteDepartment');
  if (!select) return;
  const departments = await fetchDepartments();
  select.innerHTML = departments.map(d => `<option value="${d.id}">${d.display_name || d.name}</option>`).join('');
}

async function renderAdminUserTable() {
  const body = document.getElementById('adminUserTableBody');
  if (!body) return;
  body.innerHTML = '<p class="muted">載入中...</p>';
  try {
    const users = await fetchAllUsers();
    const depts = await fetchDepartments();
    body.innerHTML = users.map(u => {
      const effectivePermissions = { ...getDefaultPermissions(u.role), ...(u.permissions || {}) };
      return `
      <article class="admin-account-row">
        <div class="admin-account-heading">
          <div>
            <strong>${escapeHtml(u.full_name || u.email)}</strong>
            <span>${escapeHtml(u.email)}</span>
          </div>
          <div class="admin-account-status">
            ${u.active === false ? '<span class="badge wait">已停用</span>' : '<span class="badge success">啟用中</span>'}
            <button
              class="${u.active === false ? 'secondary' : 'danger'}"
              type="button"
              onclick="toggleAdminUserActive('${u.id}', ${u.active !== false})"
            >${u.active === false ? '啟用' : '停用'}</button>
          </div>
        </div>
        <div class="admin-account-fields">
          <label>姓名
          <input
            type="text"
            value="${escapeHtml(u.full_name || '')}"
            placeholder="姓名"
            onchange="updateUserProfile('${u.id}', 'full_name', this.value)"
          />
          </label>
          <label>角色
          <select onchange="updateUserProfile('${u.id}', 'role', this.value)">
            ${Object.entries(ROLE_LABELS).map(([val, label]) => `<option value="${val}" ${u.role === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          </label>
          <label>部門
          <select onchange="updateUserProfile('${u.id}', 'department_id', this.value)">
            <option value="">未設定</option>
            ${depts.map(d => `<option value="${d.id}" ${u.department_id === d.id ? 'selected' : ''}>${d.display_name || d.name}</option>`).join('')}
          </select>
          </label>
        </div>
        <fieldset class="admin-permission-list">
          <legend>可使用功能</legend>
          ${permissions.map(([key, label]) => `
            <label class="permission-option">
              <input type="checkbox" ${effectivePermissions[key] ? 'checked' : ''}
                onchange="toggleUserPermission('${u.id}', '${key}')" />
              <span>${label}</span>
            </label>
          `).join('')}
        </fieldset>
      </article>`;
    }).join('') || '<p class="muted">尚無使用者資料。</p>';
  } catch (error) {
    body.innerHTML = `<p class="muted">載入失敗：${escapeHtml(error.message)}</p>`;
  }
}

// ===== 完整的使用者權限管理視圖 =====
async function renderUserManagementPanel() {
  const container = document.getElementById('userManagementContainer');
  if (!container) return;
  
  const currentUser = state.currentUser;
  if (!currentUser || currentUser.role !== 'admin') {
    container.innerHTML = `
      <div class="bg-rose-50 border border-rose-200 text-rose-800 p-8 rounded-xl text-center space-y-3">
        <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <h2 class="text-lg font-bold">存取被拒：缺乏系統管理員權限</h2>
        <p class="text-xs text-rose-700 max-w-md mx-auto">
          「帳號權限管理」功能屬於最高的專屬權限控制區，僅提供系統管理員 (Admin) 進行帳號發放與權限調整。
        </p>
      </div>
    `;
    return;
  }

  try {
    const users = await fetchAllUsers();
    const depts = await fetchDepartments();
    
    const PERMISSION_LABELS = {
      canViewFinancials: 'IFRS 財報',
      canViewJournalLedger: '日記帳總帳',
      canViewVouchers: '憑證中心',
      canViewBankAccounts: '銀行帳戶',
      canReconcileBank: '對帳單掃描比對',
      canApproveBills: '簽核單據',
      canManageProjects: '專案管理',
      canManageUsers: '帳號管理',
      canViewReports: '財務報表',
      canManageSettings: '系統設定'
    };

    const PERMISSION_GROUPS = {
      financial: ['canViewFinancials', 'canViewJournalLedger', 'canViewVouchers', 'canViewBankAccounts'],
      approval: ['canApproveBills', 'canReconcileBank'],
      management: ['canManageProjects', 'canManageUsers', 'canViewReports', 'canManageSettings']
    };

    container.innerHTML = `
      <div class="space-y-6 max-w-7xl mx-auto">
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900 flex items-center">
              <svg class="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              系統帳號與權限管理 (Admin Only)
            </h1>
            <p class="text-xs text-slate-500 mt-1">
              由系統管理員發放帳號、調整角色類別（一般員工、部門主管、會計部門、管理員）以及個別頁面模組開啟權限。
            </p>
          </div>
          <button
            onclick="openCreateUserModal()"
            class="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center cursor-pointer shrink-0"
          >
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
            新增人員帳號
          </button>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div class="relative w-full sm:w-72">
            <svg class="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input
              type="text"
              id="userSearchInput"
              placeholder="搜尋姓名、工號、電子郵件..."
              oninput="filterUserTable()"
              class="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <span class="text-xs text-slate-500">角色過濾:</span>
            <select
              id="userRoleFilter"
              onchange="filterUserTable()"
              class="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
            >
              <option value="all">所有角色</option>
              <option value="admin">系統管理員 (Admin)</option>
              <option value="accounting">會計部門 (Accounting)</option>
              <option value="manager">部門主管 (Manager)</option>
              <option value="employee">一般專員 (Employee)</option>
            </select>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th class="py-3 px-4">成員與工號</th>
                  <th class="py-3 px-4">部門與信箱</th>
                  <th class="py-3 px-4">角色分類</th>
                  <th class="py-3 px-4">財務 / 帳冊權限</th>
                  <th class="py-3 px-4">審核 / 對帳權限</th>
                  <th class="py-3 px-4">管理權限</th>
                  <th class="py-3 px-4 text-center">狀態</th>
                  <th class="py-3 px-4 text-right">管理操作</th>
                </tr>
              </thead>
              <tbody id="userManagementTableBody" class="divide-y divide-slate-100 text-xs">
                ${renderUserManagementRows(users, depts, PERMISSION_LABELS, PERMISSION_GROUPS, currentUser)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Create User Modal -->
      <div id="createUserModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" style="display:none;">
        <div class="bg-white w-full max-w-lg rounded-xl shadow-xl border border-slate-200 overflow-hidden space-y-4">
          <div class="px-6 py-4 bg-purple-600 text-white flex justify-between items-center">
            <h2 class="text-base font-bold flex items-center">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
              建立新成員帳號 (Admin)
            </h2>
            <button
              onclick="closeCreateUserModal()"
              className="text-white/80 hover:text-white cursor-pointer"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <form onsubmit="handleCreateUserSubmit(event)" class="p-6 space-y-4 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">同仁姓名 *</label>
                <input
                  type="text"
                  id="newUserName"
                  required
                  placeholder="如: 張小花"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">員工編號 (工號)</label>
                <input
                  type="text"
                  id="newUserEmpId"
                  placeholder="如: EMP-006"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label class="block font-semibold text-slate-700 mb-1">電子郵件 (登入帳號) *</label>
              <input
                type="email"
                id="newUserEmail"
                required
                placeholder="xiaohua.zhang@company.com"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">系統角色權限 *</label>
                <select
                  id="newUserRole"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
                >
                  <option value="employee">一般專員 (Employee)</option>
                  <option value="manager">部門主管 (Manager)</option>
                  <option value="accounting">會計部門 (Accounting)</option>
                  <option value="admin">系統管理員 (Admin)</option>
                </select>
              </div>

              <div>
                <label class="block font-semibold text-slate-700 mb-1">所屬部門</label>
                <select
                  id="newUserDepartment"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
                >
                  <option value="">未設定</option>
                  ${depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <div>
              <label class="block font-semibold text-slate-700 mb-1">預設初始密碼 *</label>
              <input
                type="text"
                id="newUserPassword"
                required
                value="Bd@1234"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
              <button
                type="button"
                onclick="closeCreateUserModal()"
                class="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                確認建立帳號
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Reset Password Modal -->
      <div id="resetPasswordModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" style="display:none;">
        <div class="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-200 p-5 space-y-4">
          <h3 class="text-sm font-bold text-slate-900 flex items-center">
            <svg class="w-4 h-4 mr-1.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            管理員重設同仁密碼
          </h3>
          <p class="text-xs text-slate-500">
            請輸入要賦予該使用者的全新密碼，更換後立即生效。
          </p>
          <input
            type="text"
            id="resetPassInput"
            placeholder="輸入新密碼..."
            class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <div class="flex justify-end space-x-2 text-xs">
            <button
              onclick="closeResetPasswordModal()"
              class="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg cursor-pointer"
            >
              取消
            </button>
            <button
              onclick="handleResetPassword()"
              class="px-4 py-1.5 bg-purple-600 text-white rounded-lg font-semibold shadow-xs cursor-pointer"
            >
              儲存新密碼
            </button>
          </div>
        </div>
      </div>
    `;

    // 綁定搜尋和過濾事件
    document.getElementById('userSearchInput')?.addEventListener('input', filterUserTable);
    document.getElementById('userRoleFilter')?.addEventListener('change', filterUserTable);

  } catch (error) {
    container.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">載入失敗：${error.message}</div>`;
  }
}

function renderUserManagementRows(users, depts, PERMISSION_LABELS, PERMISSION_GROUPS, currentUser) {
  return users.map(u => {
    const perms = u.permissions || {};
    const isCurrentSelf = u.id === currentUser.id;
    const deptName = depts.find(d => d.id === u.department_id)?.name || '未設定';

    return `
      <tr class="hover:bg-slate-50/60 transition-colors">
        <td class="py-3.5 px-4 font-medium">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 shrink-0">
              ${(u.full_name || u.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="font-bold text-slate-900 flex items-center">
                ${u.full_name || u.email}
                ${isCurrentSelf && (
                  '<span class="ml-1.5 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-normal">您自己</span>'
                )}
              </div>
              <div class="text-[10px] text-slate-400 font-mono">${u.id}</div>
            </div>
          </div>
        </td>

        <td class="py-3.5 px-4">
          <div class="font-semibold text-slate-700">${deptName}</div>
          <div class="text-[11px] text-slate-400 font-mono">${u.email}</div>
        </td>

        <td class="py-3.5 px-4">
          <select
            value="${u.role}"
            disabled="${isCurrentSelf}"
            onchange="updateUserProfile('${u.id}', 'role', this.value)"
            class="px-2 py-1 text-xs border border-slate-300 rounded font-semibold focus:ring-1 focus:ring-purple-500 cursor-pointer bg-white"
          >
            <option value="admin">系統管理員</option>
            <option value="accounting">會計部門</option>
            <option value="manager">部門主管</option>
            <option value="employee">一般專員</option>
          </select>
        </td>

        <td class="py-3.5 px-4">
          <div class="flex flex-wrap gap-1">
            ${PERMISSION_GROUPS.financial.map(key => `
              <button
                onclick="toggleUserPermission('${u.id}', '${key}')"
                class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                  perms[key]
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                }"
              >
                ${PERMISSION_LABELS[key]}
              </button>
            `).join('')}
          </div>
        </td>

        <td class="py-3.5 px-4">
          <div class="flex flex-wrap gap-1">
            ${PERMISSION_GROUPS.approval.map(key => `
              <button
                onclick="toggleUserPermission('${u.id}', '${key}')"
                class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                  perms[key]
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                }"
              >
                ${PERMISSION_LABELS[key]}
              </button>
            `).join('')}
          </div>
        </td>

        <td class="py-3.5 px-4">
          <div class="flex flex-wrap gap-1">
            ${PERMISSION_GROUPS.management.map(key => `
              <button
                onclick="toggleUserPermission('${u.id}', '${key}')"
                class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                  perms[key]
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                }"
              >
                ${PERMISSION_LABELS[key]}
              </button>
            `).join('')}
          </div>
        </td>

        <td class="py-3.5 px-4 text-center">
          <button
            disabled="${isCurrentSelf}"
            onclick="toggleUserActive('${u.id}', ${u.active !== false})"
            class="px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
              u.active === false
                ? 'bg-slate-100 text-slate-500 border border-slate-200'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }"
          >
            ${u.active === false ? '停用中' : '正常啟用'}
          </button>
        </td>

        <td class="py-3.5 px-4 text-right space-x-2">
          <button
            onclick="openResetPasswordModal('${u.id}')"
            class="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors cursor-pointer inline-flex items-center"
            title="重設密碼"
          >
            <svg class="w-3 h-3 mr-1 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            重設密碼
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.filterUserTable = function() {
  const searchTerm = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const roleFilter = document.getElementById('userRoleFilter')?.value || 'all';
  const rows = document.querySelectorAll('#userManagementTableBody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const role = row.querySelector('select')?.value || '';
    const matchesSearch = text.includes(searchTerm);
    const matchesRole = roleFilter === 'all' || role === roleFilter;
    row.style.display = matchesSearch && matchesRole ? '' : 'none';
  });
};

window.toggleUserPermission = async (userId, permKey) => {
  try {
    const users = await fetchAllUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const currentPerms = { ...getDefaultPermissions(user.role), ...(user.permissions || {}) };
    const updatedPerms = {
      ...currentPerms,
      [permKey]: !currentPerms[permKey]
    };
    
    await updateUserPermissions(userId, updatedPerms);
    showMessage('權限已更新');
    await renderAdminUserTable();
  } catch (error) {
    alert('更新權限失敗：' + error.message);
  }
};

window.toggleAdminUserActive = async (userId, currentlyActive) => {
  try {
    if (currentlyActive && !confirm('確定要停用此使用者嗎？停用後將無法正常使用系統功能。')) return;
    await toggleUserActive(userId, !currentlyActive);
    showMessage(currentlyActive ? '使用者已停用。' : '使用者已啟用。');
    await renderAdminUserTable();
  } catch (error) {
    console.error('切換使用者狀態失敗:', error);
    alert('切換使用者狀態失敗：' + error.message);
  }
};

window.openCreateUserModal = () => {
  document.getElementById('createUserModal').style.display = 'flex';
};

window.closeCreateUserModal = () => {
  document.getElementById('createUserModal').style.display = 'none';
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserEmpId').value = '';
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserRole').value = 'employee';
  document.getElementById('newUserDepartment').value = '';
  document.getElementById('newUserPassword').value = 'Bd@1234';
};

window.handleCreateUserSubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const role = document.getElementById('newUserRole').value;
  const departmentId = document.getElementById('newUserDepartment').value || null;
  const password = document.getElementById('newUserPassword').value;
  const empId = document.getElementById('newUserEmpId').value.trim();

  if (!name || !email) {
    alert('姓名與電子郵件為必填');
    return;
  }

  try {
    const defaultPerms = getDefaultPermissions(role);
    const result = await inviteNewUser({
      email,
      fullName: name,
      role,
      departmentId,
      password,
      permissions: defaultPerms
    });
    
    showMessage('帳號已建立');
    closeCreateUserModal();
    renderUserManagementPanel();
  } catch (error) {
    alert('建立失敗：' + error.message);
  }
};

let resetPassUserId = null;

window.openResetPasswordModal = (userId) => {
  resetPassUserId = userId;
  document.getElementById('resetPasswordModal').style.display = 'flex';
  document.getElementById('resetPassInput').value = '';
};

window.closeResetPasswordModal = () => {
  resetPassUserId = null;
  document.getElementById('resetPasswordModal').style.display = 'none';
};

window.handleResetPassword = async () => {
  if (!resetPassUserId) return;
  const newPass = document.getElementById('resetPassInput').value.trim();
  if (!newPass) {
    alert('請輸入新密碼');
    return;
  }
  
  try {
    await resetUserPassword(resetPassUserId, newPass);
    showMessage('密碼已重設');
    closeResetPasswordModal();
    renderUserManagementPanel();
  } catch (error) {
    alert('重設失敗：' + error.message);
  }
};



const state = { ...defaultState };
// 讓抽出到 uiHelpers.js 的共用函式（例如 applyRoleBasedTabVisibility、updateAdminNavVisibility）
// 也能讀到目前的登入使用者狀態。state 為 const 且只會原地修改屬性、不會整個重新賦值，
// 所以這裡指派一次參考即可，之後對 state.xxx 的修改都會同步反映在 window.state 上。
window.state = state;
let eventsInitialized = false;

function userHasPermission(permissionKey, user = state.currentUser) {
  return hasUserPermission(user, permissionKey);
}

// ===== 1. 全域狀態標籤 (移到 ui.js 最上方) =====
// 多階段簽核流程指示器：把單據狀態轉換成「提交→主管→會計→付款結案」的視覺步驟

// ===== Audit Trail Logs（全系統單據異動稽核軌跡） =====
async function renderAuditTrailLegacy() {
  const container = document.getElementById('auditTrailList');
  if (!container) return;
  container.innerHTML = '<p class="muted">載入中…</p>';

  const actionFilter = document.getElementById('auditTrailActionFilter')?.value || '';
  const keyword = (document.getElementById('auditTrailSearchInput')?.value || '').trim().toLowerCase();

  try {
    let query = supabase
      .from('voucher_workflow_logs')
      .select('*, profiles!actor_id(full_name), vouchers(voucher_no, summary)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (actionFilter) query = query.eq('action', actionFilter);

    const { data: logs, error } = await query;
    if (error) throw error;

    const ACTION_LABELS = {
      submit: '提交申請',
      manager_approve: '主管核准',
      manager_reject: '主管退件',
      accounting_approve: '會計核准',
      reject: '會計退件',
      close: '付款銷案'
    };

    let filtered = logs || [];
    if (keyword) {
      filtered = filtered.filter(l => [
        l.vouchers?.voucher_no, l.vouchers?.summary, l.profiles?.full_name, l.action, l.reject_reason
      ].some(f => (f || '').toLowerCase().includes(keyword)));
    }

    if (filtered.length === 0) {
      container.innerHTML = '<p class="muted">沒有符合條件的稽核紀錄。</p>';
      return;
    }

    container.innerHTML = `
      <div class="space-y-6">
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center space-x-2">
              <svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h2 class="text-lg font-bold text-slate-900">系統完整稽核軌跡 (Audit Trail Logs)</h2>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              記錄專案修改、單據簽核、會計憑證生成與權限切換之所有操作，提供不可篡改之內部控制追蹤憑據。
            </p>
          </div>
          <div class="relative w-full sm:w-64">
                <svg class="audit-icon audit-icon-search" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input
              type="text"
              id="auditTrailSearchInput"
              placeholder="搜尋操作人、動作、標的..."
              value="${keyword}"
              class="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-900 text-white font-semibold text-[11px]">
                <th class="p-3">時間戳記 (Timestamp)</th>
                <th class="p-3">操作人員與角色</th>
                <th class="p-3">動作名稱 (Action)</th>
                <th class="p-3">詳細紀錄說明</th>
                <th class="p-3">變更前後對照 (Delta)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filtered.map(l => {
                const roleLabel = l.actor_role === 'admin' ? '管理員' : l.actor_role === 'accounting' ? '會計' : l.actor_role === 'manager' ? '主管' : '員工';
                const hasDelta = l.from_status || l.to_status;
                return `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="p-3 font-mono text-slate-500 whitespace-nowrap text-[11px] tabular-nums">
                      ${new Date(l.created_at).toLocaleString('zh-TW')}
                    </td>
                    <td class="p-3 font-medium text-slate-900 whitespace-nowrap">
                      <div class="flex items-center space-x-1.5">
                        <span>${l.profiles?.full_name || '系統'}</span>
                        <span class="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">${roleLabel}</span>
                      </div>
                    </td>
                    <td class="p-3 font-bold text-indigo-700 whitespace-nowrap">
                      ${ACTION_LABELS[l.action] || l.action}
                    </td>
                    <td class="p-3 text-slate-700 max-w-md leading-relaxed text-[11px]">
                      ${l.vouchers?.voucher_no ? `<a href="javascript:void(0)" onclick="viewVoucherDetail('${l.voucher_id}')" style="color:#2563eb; font-weight:600;">[${l.vouchers.voucher_no}]</a>` : ''}
                      ${l.vouchers?.summary ? ` ${l.vouchers.summary}` : ''}
                      ${l.reject_reason ? `<div class="text-rose-600 mt-1">${l.reject_reason}</div>` : ''}
                    </td>
                    <td class="p-3 text-slate-600 font-mono text-[10px] tabular-nums">
                      ${hasDelta ? `
                        <div class="flex items-center space-x-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                          <span class="text-slate-400 line-through">${l.from_status || '-'}</span>
                          <svg class="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                          <span class="text-emerald-700 font-bold">${l.to_status || '-'}</span>
                        </div>
                      ` : '<span class="text-slate-300">-</span>'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('auditTrailSearchInput')?.addEventListener('input', () => renderAuditTrail());
  } catch (err) {
    console.error('讀取 Audit Trail 失敗:', err);
    container.innerHTML = `<p class="muted">載入失敗：${err.message}</p>`;
  }
}

async function renderAuditTrail() {
  const container = document.getElementById('auditTrailList');
  if (!container) return;
  container.innerHTML = '<p class="muted">載入中...</p>';

  const actionFilter = document.getElementById('auditTrailActionFilter')?.value || '';
  const keyword = (document.getElementById('auditTrailSearchInput')?.value || '').trim().toLowerCase();

  try {
    let workflowQuery = supabase
      .from('voucher_workflow_logs')
      .select('*, profiles!actor_id(full_name), vouchers(voucher_no, summary)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (actionFilter) workflowQuery = workflowQuery.eq('action', actionFilter);

    let systemAuditQuery = supabase
      .from('audit_logs')
      .select('*')
      .in('table_name', ['department_budget_requests', 'department_budgets'])
      .order('created_at', { ascending: false })
      .limit(200);
    if (actionFilter) systemAuditQuery = systemAuditQuery.eq('action', actionFilter);

    const [{ data: workflowLogs, error: workflowError }, { data: systemLogs, error: systemError }] = await Promise.all([
      workflowQuery,
      systemAuditQuery
    ]);
    if (workflowError) throw workflowError;
    if (systemError) throw systemError;

    const operatorIds = [...new Set((systemLogs || []).map(log => log.user_id).filter(Boolean))];
    const operatorNameById = {};
    if (operatorIds.length) {
      const { data: operators, error: operatorsError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', operatorIds);
      if (operatorsError) console.warn('讀取 audit 操作人失敗:', operatorsError.message);
      (operators || []).forEach(operator => {
        operatorNameById[operator.id] = operator.full_name || operator.email;
      });
    }

    const actionLabels = {
      submit: '提交申請',
      manager_approve: '主管核准',
      manager_reject: '主管退件',
      accounting_approve: '會計核准',
      reject: '會計退件',
      close: '付款銷案',
      void: '銷案撤回',
      department_budget_request_create: '預算申請送出',
      department_budget_request_update: '預算申請更新',
      department_budget_request_approve: '預算申請核准',
      department_budget_request_reject: '預算申請退件',
      department_budget_create: '部門預算建立',
      department_budget_update: '部門預算調整',
      department_budget_delete: '部門預算刪除'
    };

    const normalizedWorkflowLogs = (workflowLogs || []).map(log => ({
      source: 'voucher',
      created_at: log.created_at,
      actorName: log.profiles?.full_name || '系統',
      actorRole: log.actor_role,
      action: log.action,
      targetNo: log.vouchers?.voucher_no || '-',
      summary: log.vouchers?.summary || '',
      reason: log.reject_reason || '',
      fromStatus: log.from_status || '',
      toStatus: log.to_status || '',
      voucherId: log.voucher_id
    }));

    const normalizedSystemLogs = (systemLogs || []).map(log => {
      const nextData = log.new_data || {};
      const previousData = log.old_data || {};
      const departmentName = nextData.department_name || previousData.department_name || '';
      const amount = nextData.requested_amount || nextData.amount || previousData.requested_amount || previousData.amount || '';
      return {
        source: 'system',
        created_at: log.created_at,
        actorName: operatorNameById[log.user_id] || '系統',
        actorRole: '',
        action: log.action,
        targetNo: log.record_id || '-',
        summary: [
          log.table_name === 'department_budget_requests' ? '部門預算申請' : '部門預算',
          nextData.fiscal_year || previousData.fiscal_year || '',
          departmentName,
          amount ? `NT$ ${Number(amount).toLocaleString()}` : ''
        ].filter(Boolean).join(' / '),
        reason: nextData.review_note || nextData.reason || previousData.review_note || previousData.reason || '',
        fromStatus: previousData.status || '',
        toStatus: nextData.status || '',
        voucherId: null
      };
    });

    const mergedLogs = [...normalizedWorkflowLogs, ...normalizedSystemLogs]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 200);

    const filtered = mergedLogs.filter(log => {
      if (!keyword) return true;
      return [
        log.targetNo,
        log.summary,
        log.actorName,
        log.action,
        log.reason
      ].some(value => String(value || '').toLowerCase().includes(keyword));
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p class="muted audit-empty">沒有符合條件的稽核紀錄。</p>';
      return;
    }

    container.innerHTML = `
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>操作人</th>
              <th>動作</th>
              <th>單據與摘要</th>
              <th>狀態變更</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(log => {
              const roleLabel = log.actorRole === 'admin' ? '管理員'
                : log.actorRole === 'accounting' ? '會計'
                  : log.actorRole === 'manager' ? '主管'
                    : log.actorRole ? '員工' : '系統';
              const targetNo = escapeHtml(log.targetNo || '-');
              const summary = escapeHtml(log.summary || '');
              const reason = escapeHtml(log.reason || '');
              const fromStatus = escapeHtml(log.fromStatus || '-');
              const toStatus = escapeHtml(log.toStatus || '-');
              return `
                <tr>
                  <td class="audit-time">${new Date(log.created_at).toLocaleString('zh-TW')}</td>
                  <td>
                    <strong>${escapeHtml(log.actorName || '系統')}</strong>
                    <span class="audit-role">${roleLabel}</span>
                  </td>
                  <td><span class="audit-action">${escapeHtml(actionLabels[log.action] || log.action || '-')}</span></td>
                  <td>
                    ${log.voucherId ? `<button type="button" class="audit-voucher-link" onclick="viewVoucherDetail('${log.voucherId}')">${targetNo}</button>` : targetNo}
                    ${summary ? `<div class="audit-summary">${summary}</div>` : ''}
                    ${reason ? `<div class="audit-reason">原因：${reason}</div>` : ''}
                  </td>
                  <td>${log.fromStatus || log.toStatus
                    ? `<span class="audit-delta"><s>${fromStatus}</s><span aria-hidden="true">→</span><strong>${toStatus}</strong></span>`
                    : '<span class="muted">-</span>'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (error) {
    console.error('讀取 Audit Trail 失敗:', error);
    container.innerHTML = `<p class="muted audit-empty">載入失敗：${escapeHtml(error.message)}</p>`;
  }
}


// ===== 2. 姓名遮罩工具 (新增到全域) =====
// ===== 智能姓名遮罩 (廠商不遮罩，個人遮罩) =====

// ===== 身分證字號遮罩 (例如: U800****518) =====





// 1. 將這兩個函式獨立移到外面（全域範圍）


function render() {
  const canViewFinancials = userHasPermission('canViewFinancials');
  const canViewReports = userHasPermission('canViewReports') || canViewFinancials;
  const canViewBankAccounts = userHasPermission('canViewBankAccounts');
  const canManageProjects = userHasPermission('canManageProjects');

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
  document.title = state.systemName;

  updateAdminNavVisibility();
  applyRoleBasedTabVisibility();
  const paymentNav = document.getElementById('paymentManagementNavBtn');
  if (paymentNav) paymentNav.style.display = isFinanceOperator() ? '' : 'none';
  renderDashboard();
  if (userHasPermission('canViewJournalLedger') || canViewFinancials) {
    renderTransactionTable();
  }
  // 財報僅限 會計(accounting)/管理員(admin) 檢視；
  // employee/manager 不觸發報表 DB 查詢，避免因 RLS 限制觸發 406 Not Acceptable
  if (canViewReports) {
    renderReports();
  }
  renderCompanyData();
  fillCompanyInfoForm();
  renderBusinessData();
  updateSettings();
  if (canViewBankAccounts) {
    renderBankAccounts();
  }
  if (userHasPermission('canViewVouchers') || canManageProjects || canViewFinancials) {
    populateVoucherCenterProjectFilter();
    renderVoucherCenter();
  }
  if (canManageProjects) {
    renderBudget();
    renderProjectList();
    renderDepartmentBudgetList();
    renderDepartmentBudgetRequestList();
  }
  if (canViewReports) {
    renderEquityTab();
  }
  renderTabs();
  if (canManageProjects) {
    populateProjectDepartmentSelect();
    populateProjectDefaultBankSelect();
    populateDepartmentBudgetFormOptions();
  }
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
  setVal('companyPaidInCapital', Number(info.capitalCash || 0) + Number(info.capitalProperty || 0) + Number(info.capitalTechnology || 0) + Number(info.capitalMergeNew || 0));
  setVal('companyOpenDate', info.plannedOpenDate);
}

function canManageCompanyData() {
  return ['admin', 'super_admin', 'accounting'].includes(state.currentUser?.role);
}

function buildBusinessItemRow(item = {}) {
  return `
    <tr class="business-item-row">
      <td><input class="business-item-code" value="${escapeHtml(item.code || '')}" placeholder="代碼" /></td>
      <td><input class="business-item-name" value="${escapeHtml(item.item || '')}" placeholder="營業項目" /></td>
      <td><button type="button" class="danger remove-business-item-row" style="width:auto; padding:6px 10px;">刪除</button></td>
    </tr>
  `;
}

function buildDirectorShareholderRow(person = {}) {
  return `
    <tr class="director-shareholder-row">
      <td><input class="director-name" value="${escapeHtml(person.name || '')}" placeholder="姓名" /></td>
      <td><input class="director-role" value="${escapeHtml(person.role || '')}" placeholder="職務" /></td>
      <td><input class="director-id-number" value="${escapeHtml(person.idNumber || '')}" placeholder="身分證/統編" /></td>
      <td><input class="director-amount" type="number" min="0" value="${Number(person.amount || 0)}" placeholder="出資" /></td>
      <td><input class="director-address" value="${escapeHtml(person.address || '')}" placeholder="地址" /></td>
      <td><button type="button" class="danger remove-director-shareholder-row" style="width:auto; padding:6px 10px;">刪除</button></td>
    </tr>
  `;
}

function renderBusinessData() {
  const container = document.getElementById('businessInfoContent');
  if (!container) return;
  const canEdit = canManageCompanyData();
  const businessItems = state.businessItems || [];
  const directors = state.directorShareholders || [];
  const businessRows = businessItems.map(item => canEdit
    ? buildBusinessItemRow(item)
    : `<li>${escapeHtml(item.code)} - ${escapeHtml(item.item)}</li>`
  ).join('');
  const directorRows = directors.map(person => canEdit
    ? buildDirectorShareholderRow(person)
    : `<li>姓名：${escapeHtml(person.name ?? '-')} / 職務：${escapeHtml(person.role ?? '-')} / 身分證：${escapeHtml(maskIdentifierString(person.idNumber) || '-')} / 出資：${Number(person.amount || 0).toLocaleString()} / 地址：${escapeHtml(person.address ?? '-')}</li>`
  ).join('');

  if (canEdit) {
    container.innerHTML = `
      <div class="info-block">
        <h4>營業項目</h4>
        <div class="table-scroll">
          <table>
            <thead><tr><th style="width:160px;">代碼</th><th>項目</th><th style="width:90px;">操作</th></tr></thead>
            <tbody id="businessItemsEditorBody">${businessRows || buildBusinessItemRow()}</tbody>
          </table>
        </div>
        <button type="button" id="addBusinessItemRowBtn" class="secondary" style="width:auto; margin-top:8px;">新增營業項目</button>
      </div>
      <div class="info-block" style="margin-top:16px;">
        <h4>董監名單</h4>
        <div class="table-scroll">
          <table>
            <thead><tr><th>姓名</th><th>職務</th><th>身分證/統編</th><th style="width:140px;">出資</th><th>地址</th><th style="width:90px;">操作</th></tr></thead>
            <tbody id="directorShareholdersEditorBody">${directorRows || buildDirectorShareholderRow()}</tbody>
          </table>
        </div>
        <button type="button" id="addDirectorShareholderRowBtn" class="secondary" style="width:auto; margin-top:8px;">新增董監</button>
      </div>
      <button type="button" id="saveBusinessInfoBtn" class="primary-btn" style="width:auto; margin-top:14px;">儲存事業項目與董監名單</button>
    `;
    return;
  }

  container.innerHTML = `
    <div class="info-block">
      <h4>營業項目</h4>
      <ul>${businessRows || '<li>尚未設定</li>'}</ul>
    </div>
    <div class="info-block">
      <h4>董監名單</h4>
      <ul>${directorRows || '<li>尚未設定</li>'}</ul>
    </div>
  `;
}

function collectBusinessItemRows() {
  return Array.from(document.querySelectorAll('#businessItemsEditorBody .business-item-row'))
    .map(row => ({
      code: row.querySelector('.business-item-code')?.value.trim() || '',
      item: row.querySelector('.business-item-name')?.value.trim() || ''
    }))
    .filter(row => row.code || row.item);
}

function collectDirectorShareholderRows() {
  return Array.from(document.querySelectorAll('#directorShareholdersEditorBody .director-shareholder-row'))
    .map(row => ({
      name: row.querySelector('.director-name')?.value.trim() || '',
      role: row.querySelector('.director-role')?.value.trim() || '',
      idNumber: row.querySelector('.director-id-number')?.value.trim() || '',
      amount: Number(row.querySelector('.director-amount')?.value || 0),
      address: row.querySelector('.director-address')?.value.trim() || ''
    }))
    .filter(row => row.name || row.role || row.idNumber || row.amount || row.address);
}

async function renderTransactionTable() {
  const body = document.getElementById('transactionTableBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="8" class="muted">載入交易資料...</td></tr>';

  let txs = [];
  try {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('id, bank_account_id, tx_date, type, amount, description, transaction_no, counterparty, category, remark, attachment_id, voucher_id, bank:bank_accounts(bank_name, nickname, account_number), voucher:vouchers(voucher_no, status, category, project_id, summary)')
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    txs = (data || []).map(transaction => ({
      id: transaction.id,
      date: transaction.tx_date,
      tx_date: transaction.tx_date,
      bankAccountId: transaction.bank_account_id,
      bank: [transaction.bank?.nickname || transaction.bank?.bank_name, transaction.bank?.account_number]
        .filter(Boolean)
        .join(' / ') || '未指定銀行',
      detail: transaction.description || transaction.voucher?.summary || '-',
      customer: transaction.counterparty || '',
      type: transaction.type,
      category: transaction.category || transaction.voucher?.category || '營業',
      amount: transaction.amount,
      voucher_id: transaction.voucher_id,
      transaction_no: transaction.transaction_no || '',
      voucher: transaction.voucher?.voucher_no || transaction.transaction_no,
      remark: transaction.remark || '',
      attachmentId: transaction.attachment_id || '',
      voucher_status: transaction.voucher?.status,
      project_id: transaction.voucher?.project_id,
      source: 'supabase'
    }));
  } catch (error) {
    console.error('載入 Supabase 交易失敗:', error);
    body.innerHTML = `<tr><td colspan="8" class="message error">載入交易失敗：${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  
  if (state.currentProjectId && state.currentProjectId !== 'all') {
    txs = txs.filter(tx => tx.project_id === state.currentProjectId);
  }

  body.innerHTML = '';
  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="8" class="muted">目前尚無交易資料。</td></tr>';
    return;
  }
  
  const sortedTxs = [...txs].sort((a, b) => {
    const dateCompare = String(b.date || b.tx_date || '').localeCompare(String(a.date || a.tx_date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.voucher || a.voucher_no || a.voucher_id || '').localeCompare(String(b.voucher || b.voucher_no || b.voucher_id || ''));
  });

  window.__transactionRowsCache = sortedTxs;

  sortedTxs.forEach((tx, index) => {
    const row = document.createElement('tr');
    
    const txStatus = tx.status || tx.voucher_status || tx.payment_status || '';
    const requiresVoucher = ['approved', 'closed', 'paid'].includes(txStatus) || !!tx.voucher_id;
    const voucherDisplay = tx.voucher_id
      ? `<a href="javascript:void(0)" onclick="viewVoucherDetail('${tx.voucher_id}')" style="color:#007bff; font-weight:bold; text-decoration:underline;">${tx.voucher || tx.voucher_no || '檢視憑證'}</a>`
      : (tx.voucher || tx.voucher_no
          ? `<span class="badge">${tx.voucher || tx.voucher_no}</span>`
          : (requiresVoucher
              ? '<span class="badge danger">憑證異常</span>'
              : '<span class="badge wait">無憑證</span>'));

    // 嚴格對應 HTML Header: 憑證 | 日期 | 銀行 | 明細 | 類型 | 分類 | 金額 | 操作
    row.innerHTML = `
      <td>${voucherDisplay}</td>
      <td>${tx.date || tx.tx_date || '-'}</td>
      <td>${escapeHtml(tx.bank || getBankNickname(tx.bankAccountId) || '未指定銀行')}</td>
      <td>${tx.detail}<div class="muted">${tx.customer || ''}</div></td>
      <td>${tx.type}</td>
      <td>${tx.category || '營業'}</td>
      <td>$${Number(tx.amount).toLocaleString()}</td>
      <td>${tx.voucher_id
        ? '<span class="muted">由付款憑證管理</span>'
        : `<button class="secondary delete-transaction-btn" data-id="${tx.id || ''}" data-index="${state.transactions.indexOf(tx)}">刪除</button>`}
      </td>
    `;
    body.appendChild(row);
  });
}

async function deleteUnvouchedTransactions() {
  if (!isFinanceOperator()) {
    showMessage('僅會計部門與 Admin 可刪除交易。', true);
    return;
  }
  const rows = (window.__transactionRowsCache || []).filter(tx => !tx.voucher_id && !tx.transaction_no);
  if (!rows.length) {
    showMessage('目前沒有可刪除的無憑證交易。');
    return;
  }
  if (!confirm(`確定刪除 ${rows.length} 筆無憑證交易？此動作會直接移除畫面下方這類資料。`)) return;

  const ids = rows.map(tx => tx.id).filter(Boolean);
  if (ids.length) {
    const { error } = await supabase
      .from('bank_transactions')
      .delete()
      .in('id', ids);
    if (error) {
      showMessage('刪除無憑證交易失敗：' + error.message, true);
      return;
    }
  }

  state.transactions = (state.transactions || []).filter(tx => tx.voucher_id || tx.transaction_no || tx.voucher || tx.voucher_no);
  saveState(state);
  await renderTransactionTable();
  renderDashboard();
  showMessage(`已刪除 ${rows.length} 筆無憑證交易。`);
}

window.deleteUnvouchedTransactions = deleteUnvouchedTransactions;

let paymentRowsCache = [];

function isFinanceOperator() {
  return ['admin', 'super_admin', 'accounting'].includes(state.currentUser?.role);
}

async function fetchPaymentRecipients() {
  const { data, error } = await supabase
    .from('payment_recipients')
    .select('*')
    .order('active', { ascending: false })
    .order('display_name');
  if (error) throw error;
  return data || [];
}

async function fetchPayeeDetails() {
  const { data, error } = await supabase
    .from('payees')
    .select('id, identifier, name, type, phone, email, address, bank_account, bank_name, bank_branch, account_name, account_number, note, is_active, payment_recipients(*)')
    .order('is_active', { ascending: false })
    .order('name');
  if (error) throw error;
  return data || [];
}

function recipientSummary(recipient, line) {
  if (recipient) {
    return `
      <div class="payment-recipient-details">
        <strong>${escapeHtml(recipient.display_name)}</strong><br>
        ${escapeHtml(recipient.bank_name)} ${escapeHtml(recipient.bank_branch || '')}<br>
        戶名：${escapeHtml(recipient.account_name)}｜帳號：${escapeHtml(recipient.account_number)}
      </div>`;
  }
  return `<span class="muted">${escapeHtml(line?.payee_name || '尚未設定收款人')} ${escapeHtml(line?.payee_identifier || '')}</span>`;
}

function getVoucherPayment(voucher) {
  return Array.isArray(voucher?.payment) ? voucher.payment[0] : voucher?.payment;
}

function setPaymentManagementMode(mode = 'queue') {
  const safeMode = ['recipients', 'payroll'].includes(mode) ? mode : 'queue';
  document.querySelectorAll('.payment-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.paymentMode === safeMode);
  });
  document.querySelector('.payment-management-panel')?.toggleAttribute('hidden', safeMode !== 'queue');
  document.querySelector('.payment-recipient-panel')?.toggleAttribute('hidden', safeMode !== 'recipients');
  document.querySelector('.payroll-payment-panel')?.toggleAttribute('hidden', safeMode !== 'payroll');
}

async function renderPaymentManagement() {
  const list = document.getElementById('paymentList');
  const recipientList = document.getElementById('paymentRecipientList');
  if (!list || !recipientList || !isFinanceOperator()) return;
  list.innerHTML = '<p class="muted">載入付款清單...</p>';

  try {
    const filter = document.getElementById('paymentStatusFilter')?.value || 'approved';
    let query = supabase
      .from('vouchers')
      .select('id, voucher_no, request_voucher_no, accounting_voucher_no, accounting_sequence_no, summary, total_amount, status, payment_date, accounting_note, accounting_account_id, payment_bank_account_id, payment_recipient_id, applicant:profiles!applicant_id(full_name, email), project:projects(project_code, name, default_bank_account_id), voucher_lines(payee_name, payee_identifier), payment_recipient:payment_recipients(*), payment_bank:bank_accounts!payment_bank_account_id(bank_name, nickname, account_number), accounting_account:accounts!accounting_account_id(code, name), payment:voucher_payments(payment_no, payment_sequence_no, amount, paid_at, recipient_snapshot, bank:bank_accounts!bank_account_id(bank_name, nickname, account_number))')
      .in('status', filter === 'all' ? ['approved', 'closed'] : [filter])
      .order('accounting_approved_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    paymentRowsCache = data || [];

    list.innerHTML = paymentRowsCache.length ? `
      <table class="payment-list-table">
        <thead><tr><th>付款</th><th>單號／專案</th><th>申請人</th><th>付款對象</th><th>科目／付款銀行</th><th>金額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${paymentRowsCache.map(voucher => {
          const line = voucher.voucher_lines?.[0];
          const paid = voucher.status === 'closed';
          const payment = getVoucherPayment(voucher);
          return `<tr>
            <td><span class="badge ${paid ? 'success' : 'warning'}">${paid ? '已完成' : '待處理'}</span></td>
            <td>
              <strong>${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '-')}</strong>
              ${voucher.accounting_voucher_no ? `<br><span class="muted">${escapeHtml(voucher.accounting_voucher_no)}${voucher.accounting_sequence_no ? `｜#${voucher.accounting_sequence_no}` : ''}</span>` : ''}
              <br><span class="muted">${escapeHtml(voucher.project ? `${voucher.project.project_code} ${voucher.project.name}` : '部門預算')}</span>
            </td>
            <td>${escapeHtml(voucher.applicant?.full_name || '-')}<br><span class="muted">${escapeHtml(voucher.applicant?.email || '')}</span></td>
            <td>${recipientSummary(voucher.payment_recipient, line)}</td>
            <td>${escapeHtml(voucher.accounting_account ? `${voucher.accounting_account.code} ${voucher.accounting_account.name}` : '未指定科目')}<br><span class="muted">${escapeHtml(voucher.payment_bank?.nickname || voucher.payment_bank?.bank_name || '尚未指定付款銀行')}</span></td>
            <td><strong>NT$ ${Number(voucher.total_amount || 0).toLocaleString()}</strong></td>
            <td><span class="badge ${paid ? 'success' : 'warning'}">${paid ? `已付款 ${voucher.payment_date || ''}` : '待付款'}</span>${payment?.payment_no ? `<br><strong class="payment-voucher-number">${escapeHtml(payment.payment_no)}${payment.payment_sequence_no ? `｜#${payment.payment_sequence_no}` : ''}</strong>` : ''}</td>
            <td>${paid
              ? `<button type="button" class="secondary" data-payment-action="view-voucher" data-voucher-id="${voucher.id}">查看付款憑證</button>`
              : `<button type="button" class="primary-btn" style="width:auto; padding:8px 12px;" data-payment-action="open-editor" data-voucher-id="${voucher.id}">付款設定／確認付款</button>`}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="muted">目前沒有符合條件的付款資料。</p>';

    await renderPaymentRecipientList();
  } catch (error) {
    console.error('載入付款管理失敗:', error);
    list.innerHTML = `<p class="message error">載入付款清單失敗：${escapeHtml(error.message)}</p>`;
  }
}

async function renderPaymentRecipientList() {
  const container = document.getElementById('paymentRecipientList');
  if (!container || !isFinanceOperator()) return;
  const payees = await fetchPayeeDetails();
  window.__payeeDetailsCache = payees;
  container.innerHTML = payees.length ? `
    <table><thead><tr><th>付款人主檔</th><th>銀行資料</th><th>聯絡資料</th><th>狀態</th><th>操作</th></tr></thead>
    <tbody>${payees.map(payee => {
      const recipient = payee.payment_recipients?.[0] || {};
      return `<tr>
        <td><strong>${escapeHtml(payee.name)}</strong><br><span class="muted">${escapeHtml(payee.identifier || '')}${payee.type ? `｜${escapeHtml(payee.type)}` : ''}</span></td>
        <td>${escapeHtml(payee.bank_name || recipient.bank_name || '')} ${escapeHtml(payee.bank_branch || recipient.bank_branch || '')}<br>戶名：${escapeHtml(payee.account_name || recipient.account_name || payee.name || '')}<br>帳號：${escapeHtml(payee.account_number || payee.bank_account || recipient.account_number || '')}</td>
        <td>${escapeHtml(payee.phone || recipient.phone || '')}<br>${escapeHtml(payee.email || recipient.email || '')}<br><span class="muted">${escapeHtml(payee.address || '')}</span></td>
        <td><span class="badge ${payee.is_active !== false ? 'success' : 'wait'}">${payee.is_active !== false ? '使用中' : '停用'}</span></td>
        <td><button type="button" class="secondary" onclick="viewPayeePaymentHistory('${payee.id}')">明細</button> <button type="button" class="secondary" onclick="editPayeeDetail('${payee.id}')">編輯</button></td>
      </tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">尚未建立付款人主檔。</p>';
}

async function fetchPayeePaymentHistory(payeeId) {
  const payees = window.__payeeDetailsCache || await fetchPayeeDetails();
  const payee = payees.find(item => item.id === payeeId);
  if (!payee) throw new Error('找不到付款人資料');
  const recipientIds = (payee.payment_recipients || []).map(item => item.id).filter(Boolean);
  let query = supabase
    .from('vouchers')
    .select('id, tx_date, request_voucher_no, accounting_voucher_no, accounting_sequence_no, summary, total_amount, status, payment_date, payment_recipient_id, payment_bank:bank_accounts!payment_bank_account_id(bank_name, nickname, account_number), payment:voucher_payments(payment_no, payment_sequence_no, payment_type, amount, paid_at, bank:bank_accounts!bank_account_id(bank_name, nickname, account_number))')
    .order('payment_date', { ascending: false, nullsFirst: false })
    .order('tx_date', { ascending: false });

  if (recipientIds.length) {
    query = query.or(`primary_payee_id.eq.${payeeId},payment_recipient_id.in.(${recipientIds.join(',')})`);
  } else {
    query = query.eq('primary_payee_id', payeeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return { payee, rows: data || [] };
}

window.viewPayeePaymentHistory = async (payeeId) => {
  try {
    const { payee, rows } = await fetchPayeePaymentHistory(payeeId);
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-card" style="max-width:980px;">
      <h3>${escapeHtml(payee.name)} 付款明細</h3>
      <p class="muted">${escapeHtml(payee.identifier || '')}</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>付款日期</th><th>摘要</th><th>申請/會計單號</th><th>付款單號</th><th>出款銀行</th><th>金額</th><th>狀態</th></tr></thead>
          <tbody>${rows.map(voucher => {
            const payment = getVoucherPayment(voucher);
            const bank = payment?.bank || voucher.payment_bank || {};
            return `<tr>
              <td>${escapeHtml(payment?.paid_at || voucher.payment_date || voucher.tx_date || '')}</td>
              <td>${escapeHtml(voucher.summary || '')}</td>
              <td>${escapeHtml(voucher.request_voucher_no || '-')}<br><span class="muted">${escapeHtml(voucher.accounting_voucher_no || '-')}${voucher.accounting_sequence_no ? `｜#${voucher.accounting_sequence_no}` : ''}</span></td>
              <td>${escapeHtml(payment?.payment_no || '尚未付款')}${payment?.payment_sequence_no ? `<br><span class="muted">#${payment.payment_sequence_no}</span>` : ''}</td>
              <td>${escapeHtml(bank.nickname || bank.bank_name || '-')}<br><span class="muted">${escapeHtml(bank.account_number || '')}</span></td>
              <td>NT$ ${Number(payment?.amount || voucher.total_amount || 0).toLocaleString()}</td>
              <td><span class="badge ${voucher.status === 'closed' ? 'success' : 'wait'}">${voucher.status === 'closed' ? '已付款' : escapeHtml(voucher.status || '-')}</span></td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" class="muted">尚無付款紀錄。</td></tr>'}</tbody>
        </table>
      </div>
      <div class="button-row"><button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">關閉</button></div>
    </div>`;
    document.body.appendChild(modal);
  } catch (error) {
    alert('載入付款明細失敗：' + error.message);
  }
};

function calculatePayrollRow(row) {
  const gross = Number(row.querySelector('.payroll-gross')?.value || 0);
  const labor = Number(row.querySelector('.payroll-labor')?.value || 0);
  const health = Number(row.querySelector('.payroll-health')?.value || 0);
  const pension = Number(row.querySelector('.payroll-pension')?.value || 0);
  const net = Math.max(0, gross - labor - health);
  const netCell = row.querySelector('.payroll-net');
  if (netCell) netCell.textContent = `NT$ ${net.toLocaleString()}`;
  return { gross, labor, health, pension, net };
}

async function renderPayrollPaymentPanel() {
  const list = document.getElementById('payrollEmployeeList');
  const bankSelect = document.getElementById('payrollBankAccount');
  if (!list || !bankSelect || !isFinanceOperator()) return;

  try {
    const [payees, banks] = await Promise.all([fetchPayeeDetails(), fetchBankAccounts()]);
    populateBankSelect(bankSelect, banks || []);
    const dateInput = document.getElementById('payrollPaymentDate');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    const summaryInput = document.getElementById('payrollSummary');
    if (summaryInput && !summaryInput.value) {
      const now = new Date();
      summaryInput.value = `${now.getFullYear() - 1911}${String(now.getMonth() + 1).padStart(2, '0')} 薪資`;
    }
    const employeePayees = payees
      .filter(payee => payee.is_active !== false && !['24616337-1', '24616337-2', '24616337-3'].includes(payee.identifier))
      .filter(payee => (payee.type || 'individual') === 'individual');

    list.innerHTML = employeePayees.length ? `
      <table>
        <thead><tr><th>選取</th><th>員工</th><th>薪資</th><th>勞保</th><th>健保</th><th>勞退</th><th>實領</th></tr></thead>
        <tbody>${employeePayees.map(payee => {
          const account = payee.account_number || payee.bank_account || '';
          return `<tr class="payroll-row" data-payee-id="${payee.id}">
            <td><input type="checkbox" class="payroll-selected" aria-label="選取 ${escapeHtml(payee.name)}"></td>
            <td><strong>${escapeHtml(payee.name)}</strong><br><span class="muted">${escapeHtml(payee.identifier || '')}｜${escapeHtml(payee.bank_name || '')} ${escapeHtml(account)}</span></td>
            <td><input type="number" min="0" class="payroll-gross" placeholder="0"></td>
            <td><input type="number" min="0" class="payroll-labor" placeholder="0"></td>
            <td><input type="number" min="0" class="payroll-health" placeholder="0"></td>
            <td><input type="number" min="0" class="payroll-pension" placeholder="0"></td>
            <td class="payroll-net">NT$ 0</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="muted">尚未建立員工付款人主檔。</p>';

    list.querySelectorAll('.payroll-row input').forEach(input => {
      input.addEventListener('input', () => calculatePayrollRow(input.closest('.payroll-row')));
      input.addEventListener('change', () => calculatePayrollRow(input.closest('.payroll-row')));
    });
    await renderPayrollBatchList();
  } catch (error) {
    console.error('載入薪資付款失敗:', error);
    list.innerHTML = `<p class="message error">載入薪資付款失敗：${escapeHtml(error.message)}</p>`;
  }
}

function collectPayrollItems() {
  return Array.from(document.querySelectorAll('.payroll-row'))
    .filter(row => row.querySelector('.payroll-selected')?.checked)
    .map(row => {
      const totals = calculatePayrollRow(row);
      return {
        payee_id: row.dataset.payeeId,
        gross_salary: totals.gross,
        labor_insurance: totals.labor,
        health_insurance: totals.health,
        pension: totals.pension,
        net_pay: totals.net
      };
    });
}

async function renderPayrollBatchList() {
  const container = document.getElementById('payrollBatchList');
  if (!container || !isFinanceOperator()) return;
  const { data, error } = await supabase
    .from('payroll_batches')
    .select('id, summary, payment_date, total_gross_salary, total_labor_insurance, total_health_insurance, total_pension, total_employee_net, total_cash_out, created_at, bank:bank_accounts(bank_name, nickname, account_number), items:payroll_batch_items(id)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    container.innerHTML = `<p class="message error">載入薪資批次失敗：${escapeHtml(error.message)}</p>`;
    return;
  }
  container.innerHTML = `
    <h4>最近薪資批次</h4>
    <table>
      <thead><tr><th>付款日</th><th>摘要</th><th>人數</th><th>員工實領</th><th>勞保/健保/勞退</th><th>總出款</th><th>銀行</th></tr></thead>
      <tbody>${(data || []).map(batch => `<tr>
        <td>${escapeHtml(batch.payment_date || '')}</td>
        <td>${escapeHtml(batch.summary || '')}</td>
        <td>${Number(batch.items?.length || 0)}</td>
        <td>NT$ ${Number(batch.total_employee_net || 0).toLocaleString()}</td>
        <td>NT$ ${Number(batch.total_labor_insurance || 0).toLocaleString()} / NT$ ${Number(batch.total_health_insurance || 0).toLocaleString()} / NT$ ${Number(batch.total_pension || 0).toLocaleString()}</td>
        <td><strong>NT$ ${Number(batch.total_cash_out || 0).toLocaleString()}</strong></td>
        <td>${escapeHtml(batch.bank?.nickname || batch.bank?.bank_name || '-')}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">尚無薪資批次。</td></tr>'}</tbody>
    </table>`;
}

function resetPaymentRecipientForm() {
  document.getElementById('paymentRecipientForm')?.reset();
  const id = document.getElementById('paymentRecipientId');
  if (id) id.value = '';
  const payeeId = document.getElementById('paymentPayeeId');
  if (payeeId) payeeId.value = '';
}

window.editPayeeDetail = async (payeeId) => {
  const payees = window.__payeeDetailsCache || await fetchPayeeDetails();
  const payee = payees.find(item => item.id === payeeId);
  if (!payee) return;
  const recipient = payee.payment_recipients?.[0] || {};
  const values = {
    paymentPayeeId: payee.id,
    paymentRecipientId: recipient.id || '',
    recipientDisplayName: payee.name,
    recipientIdentifier: payee.identifier,
    recipientBankName: payee.bank_name || recipient.bank_name,
    recipientBankBranch: payee.bank_branch || recipient.bank_branch,
    recipientAccountName: payee.account_name || recipient.account_name || payee.name,
    recipientAccountNumber: payee.account_number || payee.bank_account || recipient.account_number,
    recipientContactName: recipient.contact_name || '',
    recipientPhone: payee.phone || recipient.phone,
    recipientEmail: payee.email || recipient.email,
    recipientNote: payee.note || recipient.note
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  });
  document.getElementById('paymentRecipientForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.editPaymentRecipient = async (recipientId) => {
  const recipients = await fetchPaymentRecipients();
  const recipient = recipients.find(item => item.id === recipientId);
  if (!recipient) return;
  const values = {
    paymentRecipientId: recipient.id,
    recipientDisplayName: recipient.display_name,
    recipientIdentifier: recipient.identifier,
    recipientBankName: recipient.bank_name,
    recipientBankBranch: recipient.bank_branch,
    recipientAccountName: recipient.account_name,
    recipientAccountNumber: recipient.account_number,
    recipientContactName: recipient.contact_name,
    recipientPhone: recipient.phone,
    recipientEmail: recipient.email,
    recipientNote: recipient.note
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  });
  document.getElementById('paymentRecipientForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function withTimeout(promise, message, timeoutMs = 12000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

window.openPaymentEditor = async (voucherId) => {
  if (!isFinanceOperator()) {
    alert('只有會計、管理員或超級管理員可以執行付款。');
    return;
  }
  const voucher = paymentRowsCache.find(item => item.id === voucherId);
  if (!voucher) {
    alert('找不到付款資料，請重新整理付款清單。');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="payment-editor-modal">
      <h3>付款設定 - ${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '')}</h3>
      <p class="muted">載入付款設定...</p>
      <div class="button-row">
        <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">關閉</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  void (async () => {
    try {
      const [recipients, accounts, banks] = await withTimeout(
        Promise.all([fetchPaymentRecipients(), fetchAccounts(), fetchBankAccounts()]),
        '付款設定資料載入逾時，請確認付款人主檔、會計科目與銀行帳戶是否可正常讀取。'
      );
      window.__paymentEditorRecipients = recipients;
      const selectedRecipient = recipients.find(item => item.id === voucher.payment_recipient_id) || {};
      const selectedBankId = voucher.payment_bank_account_id || voucher.project?.default_bank_account_id || '';
      const activeRecipients = recipients.filter(item => item.active !== false);
      const card = modal.querySelector('.payment-editor-modal');
      if (!card) return;
      card.innerHTML = `
        <h3>付款設定 - ${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '')}</h3>
        ${voucher.accounting_voucher_no ? `<p class="muted">會計憑證：${escapeHtml(voucher.accounting_voucher_no)}${voucher.accounting_sequence_no ? `｜流水 #${voucher.accounting_sequence_no}` : ''}</p>` : ''}
        <p>${escapeHtml(voucher.summary || '')}</p>
        <p><strong>金額：NT$ ${Number(voucher.total_amount || 0).toLocaleString()}</strong></p>
        ${activeRecipients.length ? '' : '<p class="warning-text">目前沒有可用的付款人，請先到所有付款人名單新增或啟用付款人。</p>'}
        ${banks.length ? '' : '<p class="warning-text">目前沒有可用的公司付款銀行，請先建立銀行帳戶。</p>'}
        <label>收款人<select id="paymentEditorRecipient" onchange="populatePaymentRecipientFields()"><option value="">請選擇收款人</option>${activeRecipients.map(item => `<option value="${item.id}" ${item.id === voucher.payment_recipient_id ? 'selected' : ''}>${escapeHtml(item.display_name)}｜${escapeHtml(item.identifier || '')}</option>`).join('')}</select></label>
        <fieldset class="payment-recipient-confirmation">
          <legend>收款銀行資料（付款前再次確認）</legend>
          <div class="payment-recipient-bank-grid">
            <label>銀行名稱<input id="paymentEditorRecipientBank" value="${escapeHtml(selectedRecipient.bank_name || '')}" placeholder="例如：兆豐銀行"></label>
            <label>分行／代碼<input id="paymentEditorRecipientBranch" value="${escapeHtml(selectedRecipient.bank_branch || '')}"></label>
            <label>戶名<input id="paymentEditorRecipientAccountName" value="${escapeHtml(selectedRecipient.account_name || selectedRecipient.display_name || '')}"></label>
            <label>收款帳號<input id="paymentEditorRecipientAccountNumber" value="${escapeHtml(selectedRecipient.account_number || '')}"></label>
          </div>
        </fieldset>
        <label>會計科目<select id="paymentEditorAccount"><option value="">請選擇會計科目</option>${accounts.map(item => `<option value="${item.id}" ${item.id === voucher.accounting_account_id ? 'selected' : ''}>${escapeHtml(item.code)} ${escapeHtml(item.name)}</option>`).join('')}</select></label>
        <label>公司付款銀行<select id="paymentEditorBank"><option value="">請選擇公司實際出款帳戶</option>${banks.map(item => `<option value="${item.id}" ${item.id === selectedBankId ? 'selected' : ''}>${escapeHtml(item.nickname || item.bank_name)} (${escapeHtml(item.account_number)})</option>`).join('')}</select></label>
        <label>付款日期<input id="paymentEditorDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>會計備註<textarea id="paymentEditorNote" rows="3">${escapeHtml(voucher.accounting_note || '')}</textarea></label>
        <div class="button-row">
          <button type="button" class="secondary" onclick="savePaymentDraft('${voucher.id}')">儲存修改</button>
          <button type="button" class="primary-btn" onclick="confirmPaymentFromList('${voucher.id}')">確認已付款</button>
          <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">取消</button>
        </div>`;
    } catch (error) {
      console.error('開啟付款設定失敗:', error);
      const card = modal.querySelector('.payment-editor-modal');
      if (card) {
        card.innerHTML = `
          <h3>付款設定 - ${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '')}</h3>
          <p class="message error">開啟付款設定失敗：${escapeHtml(error.message)}</p>
          <p class="muted">請先確認「所有付款人」、會計科目與公司銀行帳戶資料都可以正常載入。</p>
          <div class="button-row">
            <button type="button" class="primary-btn" onclick="this.closest('.modal-backdrop').remove(); openPaymentEditor('${voucher.id}')">重新載入</button>
            <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">關閉</button>
          </div>`;
      } else {
        alert('開啟付款設定失敗：' + error.message);
      }
    }
  })();
};

window.populatePaymentRecipientFields = () => {
  const recipientId = document.getElementById('paymentEditorRecipient')?.value;
  const recipient = (window.__paymentEditorRecipients || []).find(item => item.id === recipientId) || {};
  const values = {
    paymentEditorRecipientBank: recipient.bank_name,
    paymentEditorRecipientBranch: recipient.bank_branch,
    paymentEditorRecipientAccountName: recipient.account_name || recipient.display_name,
    paymentEditorRecipientAccountNumber: recipient.account_number
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value || '';
  });
};

window.viewPaymentVoucher = (voucherId) => {
  const voucher = paymentRowsCache.find(item => item.id === voucherId);
  const payment = getVoucherPayment(voucher);
  if (!voucher || !payment) return alert('找不到付款憑證資料。');
  const recipient = payment.recipient_snapshot || voucher.payment_recipient || {};
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="payment-voucher-document">
    <header><div>${escapeHtml(payment.payment_no || '付款憑證')}</div><h2>付款憑證</h2><div>${escapeHtml(payment.paid_at || '')}</div></header>
    <div class="payment-voucher-company">${escapeHtml(state.companyInfo?.companyNameZh || '公司')}</div>
    <dl>
      <dt>申請憑證</dt><dd>${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '')}</dd>
      <dt>會計憑證</dt><dd>${escapeHtml(voucher.accounting_voucher_no || '-')}${voucher.accounting_sequence_no ? `｜流水 #${voucher.accounting_sequence_no}` : ''}</dd>
      <dt>付款摘要</dt><dd>${escapeHtml(voucher.summary || '')}</dd>
      <dt>收款人</dt><dd>${escapeHtml(recipient.display_name || '')}</dd>
      <dt>收款帳戶</dt><dd>${escapeHtml(`${recipient.bank_name || ''} ${recipient.bank_branch || ''}｜${recipient.account_name || ''}｜${recipient.account_number || ''}`)}</dd>
      <dt>公司出款銀行</dt><dd>${escapeHtml(payment.bank?.nickname || payment.bank?.bank_name || '')}</dd>
      <dt>付款金額</dt><dd class="payment-voucher-amount">NT$ ${Number(payment.amount || voucher.total_amount || 0).toLocaleString()}</dd>
    </dl>
    <div class="button-row"><button type="button" class="secondary" onclick="window.print()">列印</button><button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">關閉</button></div>
  </div>`;
  document.body.appendChild(modal);
};

window.openPaymentQueue = async (voucherId) => {
  state.activeTab = 'paymentManagement';
  renderTabs();
  await renderPaymentManagement();
  await window.openPaymentEditor(voucherId);
};

async function savePaymentAssignment(voucherId) {
  const recipientId = document.getElementById('paymentEditorRecipient')?.value || null;
  const accountId = document.getElementById('paymentEditorAccount')?.value || null;
  const bankId = document.getElementById('paymentEditorBank')?.value || null;
  const note = document.getElementById('paymentEditorNote')?.value.trim() || null;
  const recipientBank = document.getElementById('paymentEditorRecipientBank')?.value.trim() || null;
  const recipientBranch = document.getElementById('paymentEditorRecipientBranch')?.value.trim() || null;
  const recipientAccountName = document.getElementById('paymentEditorRecipientAccountName')?.value.trim() || null;
  const recipientAccountNumber = document.getElementById('paymentEditorRecipientAccountNumber')?.value.trim() || null;
  if (recipientId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: recipientError } = await supabase.from('payment_recipients').update({
      bank_name: recipientBank,
      bank_branch: recipientBranch,
      account_name: recipientAccountName,
      account_number: recipientAccountNumber,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString()
    }).eq('id', recipientId);
    if (recipientError) throw recipientError;
  }
  const { data: updatedVoucher, error } = await supabase.from('vouchers').update({
    payment_recipient_id: recipientId,
    accounting_account_id: accountId,
    payment_bank_account_id: bankId,
    accounting_note: note
  }).eq('id', voucherId).eq('status', 'approved').select('id, status').maybeSingle();
  if (error) throw error;
  if (!updatedVoucher) {
    throw new Error('此付款資料已不是待付款狀態，請重新整理付款清單後再操作。');
  }
  if (accountId) {
    const account = (await fetchAccounts()).find(item => item.id === accountId);
    if (account) await supabase.from('voucher_lines').update({ account_code: account.code }).eq('voucher_id', voucherId);
  }
  return { recipientId, accountId, bankId, note, recipientBank, recipientAccountName, recipientAccountNumber };
}

window.savePaymentDraft = async (voucherId) => {
  try {
    await savePaymentAssignment(voucherId);
    document.querySelector('.modal-backdrop')?.remove();
    showMessage('付款設定已儲存，付款前仍可繼續修改。');
    await renderPaymentManagement();
  } catch (error) {
    alert('儲存付款設定失敗：' + error.message);
  }
};

window.confirmPaymentFromList = async (voucherId) => {
  const triggerBtn = document.querySelector(`button[onclick="confirmPaymentFromList('${voucherId}')"]`);
  try {
    await withActionLock(`payment-confirm:${voucherId}`, triggerBtn, async () => {
      const paymentDate = document.getElementById('paymentEditorDate')?.value;
      const recipientId = document.getElementById('paymentEditorRecipient')?.value || null;
      const recipientBank = document.getElementById('paymentEditorRecipientBank')?.value.trim() || null;
      const recipientAccountName = document.getElementById('paymentEditorRecipientAccountName')?.value.trim() || null;
      const recipientAccountNumber = document.getElementById('paymentEditorRecipientAccountNumber')?.value.trim() || null;
      const accountId = document.getElementById('paymentEditorAccount')?.value || null;
      const bankId = document.getElementById('paymentEditorBank')?.value || null;

      if (!recipientId) throw new Error('請先選擇收款人');
      if (!recipientBank) throw new Error('請確認收款銀行名稱');
      if (!recipientAccountName) throw new Error('請確認收款戶名');
      if (!recipientAccountNumber) throw new Error('請確認收款帳號');
      if (!accountId) throw new Error('請先選擇會計科目');
      if (!bankId) throw new Error('請先選擇付款銀行');
      if (!paymentDate) throw new Error('請選擇付款日期');
      if (!confirm('確認款項已經從公司銀行帳戶實際付出？確認後會轉為「已付款」，並產生日記帳、銀行流水與付款憑證。')) return;

      const assignment = await savePaymentAssignment(voucherId);
      const result = await closeVoucherByAccounting(voucherId, assignment.accountId, assignment.bankId, paymentDate);
      if (!result.success) throw new Error(result.error);
      document.querySelector('.modal-backdrop')?.remove();
      showMessage('付款完成，狀態已轉為已付款，並已產生付款憑證、銀行流水與日記帳。');
      await Promise.all([renderPaymentManagement(), renderTransactionTable(), renderVoucherWorkflowList()]);
      renderDashboard();
    }, { loadingText: '付款處理中...' });
  } catch (error) {
    alert('付款失敗：' + error.message);
  }
};

async function exportPaymentListToExcel() {
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');
  const rows = paymentRowsCache.map(voucher => ({
    單號: voucher.voucher_no,
    申請憑證號: voucher.request_voucher_no || '',
    會計憑證號: voucher.accounting_voucher_no || '',
    付款憑證號: getVoucherPayment(voucher)?.payment_no || '',
    專案: voucher.project ? `${voucher.project.project_code} ${voucher.project.name}` : '',
    申請人: voucher.applicant?.full_name || '',
    收款人: voucher.payment_recipient?.display_name || voucher.voucher_lines?.[0]?.payee_name || '',
    收款銀行: voucher.payment_recipient?.bank_name || '',
    分行: voucher.payment_recipient?.bank_branch || '',
    戶名: voucher.payment_recipient?.account_name || '',
    收款帳號: voucher.payment_recipient?.account_number || '',
    付款銀行: voucher.payment_bank?.nickname || voucher.payment_bank?.bank_name || '',
    會計科目: voucher.accounting_account ? `${voucher.accounting_account.code} ${voucher.accounting_account.name}` : '',
    金額: Number(voucher.total_amount || 0),
    狀態: voucher.status === 'closed' ? '已付款' : '待付款',
    付款日期: voucher.payment_date || ''
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '付款清單');
  XLSX.writeFile(workbook, `付款清單_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function getReportPeriodTransactions() {
  const startDateInput = document.getElementById('reportPeriodStart');
  const endDateInput = document.getElementById('reportPeriodEnd');
  
  const startDate = startDateInput ? startDateInput.value : '';
  const endDate = endDateInput ? endDateInput.value : '';
  
  // 取得系統內所有的歷史交易
  let txs = state.transactions || [];
  
  // 嚴格檢查：只有當使用者「確實有輸入日期」時，才進行過濾
  // 如果沒有填寫，直接回傳全部歷史資料加總
  if (startDate && startDate.trim() !== '') {
    txs = txs.filter(tx => tx.date >= startDate);
  }
  if (endDate && endDate.trim() !== '') {
    txs = txs.filter(tx => tx.date <= endDate);
  }
  
  return txs;
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
    <div class="report-title">${reportTitle}</div>
    <div class="report-period">期間：${periodText}</div>
    <div class="report-meta-row">
      <span>統一編號：${company.taxId || '-'}</span>
      <span>單位：新臺幣元</span>
      <span>列印日期：${today}</span>
    </div>
  `;
}

function renderReportSignature(elementId) {
  const container = document.getElementById(elementId);
  if (!container) return;

  // 抓取報表期間的結束日期，若沒填則用今天日期
  const customDate = document.getElementById('reportPeriodEnd')?.value || new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="report-signature-row">
      <div class="sign-box">
        製表人：經辦
      </div>
      <div class="sign-box">
        會計主管：黃超明
      </div>
      <div class="sign-box">
        單位主管：黃超明
      </div>
      <div class="sign-box">
        日期：${customDate}
      </div>
    </div>
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

let fundraisingSnapshot = { paidInCapital: 0, retainedEarnings: 0, totalEquity: 0, cashBalance: 0, monthlyRevenue: 0, monthlyExpense: 0 };


function renderFundraisingSimulation() {
  const resultsEl = document.getElementById('fsResults');
  if (!resultsEl) return;

  setText('fsPaidInCapital', formatTwd(fundraisingSnapshot.paidInCapital));
  setText('fsRetainedEarnings', formatTwd(fundraisingSnapshot.retainedEarnings));
  setText('fsTotalEquity', formatTwd(fundraisingSnapshot.totalEquity));
  setText('fsCashBalance', formatTwd(fundraisingSnapshot.cashBalance));

  const expansionCost = Number(document.getElementById('fsExpansionCost')?.value || 0);
  const revenueGrowth = Number(document.getElementById('fsRevenueGrowth')?.value || 0);
  const bufferMonths = Number(document.getElementById('fsBufferMonths')?.value || 0);
  const preMoney = Number(document.getElementById('fsPreMoney')?.value || 0);

  const currentBurn = Math.max(0, fundraisingSnapshot.monthlyExpense - fundraisingSnapshot.monthlyRevenue);
  const newExpense = fundraisingSnapshot.monthlyExpense + expansionCost;
  const newRevenue = fundraisingSnapshot.monthlyRevenue + revenueGrowth;
  const newBurn = Math.max(0, newExpense - newRevenue);

  const currentRunway = currentBurn > 0 ? fundraisingSnapshot.cashBalance / currentBurn : null;
  const projectedRunway = newBurn > 0 ? fundraisingSnapshot.cashBalance / newBurn : null;

  const totalNeededCash = bufferMonths * newBurn;
  const neededFundraising = Math.max(0, Math.ceil(totalNeededCash - fundraisingSnapshot.cashBalance));

  const postMoney = preMoney + neededFundraising;
  const dilutionPct = postMoney > 0 && neededFundraising > 0 ? (neededFundraising / postMoney) * 100 : 0;

  resultsEl.innerHTML = `
    <div class="fundraise-result-grid">
      <div class="fundraise-result"><span>目前月淨燒錢率</span><strong>${formatTwd(currentBurn)} / 月</strong></div>
      <div class="fundraise-result"><span>目前可撐月數</span><strong>${currentRunway === null ? '現金流為正' : currentRunway.toFixed(1) + ' 個月'}</strong></div>
      <div class="fundraise-result"><span>擴張後月淨燒錢率</span><strong>${formatTwd(newBurn)} / 月</strong></div>
      <div class="fundraise-result"><span>擴張後可撐月數</span><strong>${projectedRunway === null ? '現金流為正' : projectedRunway.toFixed(1) + ' 個月'}</strong></div>
      <div class="fundraise-result highlight"><span>建議募資金額</span><strong>${formatTwd(neededFundraising)}</strong></div>
      <div class="fundraise-result"><span>投後估值 (Post-money)</span><strong>${formatTwd(postMoney)}</strong></div>
      <div class="fundraise-result"><span>預估股權稀釋比例</span><strong>${dilutionPct.toFixed(1)}%</strong></div>
    </div>
  `;
}

function adjStatusChip(status) {
  const map = {
    draft: ['adj-status-draft', '草稿'],
    approved: ['adj-status-approved', '已核准'],
    reversed: ['adj-status-reversed', '已沖銷']
  };
  const [cls, label] = map[status] || ['adj-status-draft', status];
  return `<span class="adj-status-chip ${cls}">${label}</span>`;
}

async function renderIfrsAdjustments() {
  const wrap = document.getElementById('ifrsAdjustmentsTableWrap');
  if (!wrap) return;
  try {
    const adjustments = await fetchIfrsAdjustments();
    const badge = document.getElementById('adjustmentsCountBadge');
    if (badge) badge.textContent = `共 ${adjustments.length} 筆`;

    if (adjustments.length === 0) {
      wrap.innerHTML = `<p class="muted">目前尚無 IFRS 調整分錄。</p>`;
      return;
    }

    wrap.innerHTML = `
      <table class="adj-table">
        <thead>
          <tr>
            <th>單號</th><th>準則規範</th><th>調整原因</th><th>日期</th>
            <th>借方分錄</th><th>貸方分錄</th><th>狀態</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${adjustments.map(adj => {
            const debitLines = (adj.ifrs_adjustment_lines || []).filter(l => Number(l.debit_amount) > 0);
            const creditLines = (adj.ifrs_adjustment_lines || []).filter(l => Number(l.credit_amount) > 0);
            const fmtLines = (lines, key) => lines.map(l =>
              `${l.account?.code || ''} ${l.account?.name || ''}<br/><span class="mono">${formatTwd(l[key])}</span>`
            ).join('<br/>');

            let actions = '';
            if (adj.status === 'draft') {
              actions = `
                <button type="button" class="secondary approve-adj-btn" data-id="${adj.id}" style="padding:4px 8px; font-size:11px;">核准</button>
                <button type="button" class="secondary delete-adj-btn" data-id="${adj.id}" style="padding:4px 8px; font-size:11px; color:#b91c1c;">刪除草稿</button>
              `;
            } else if (adj.status === 'approved') {
              actions = `<button type="button" class="secondary reverse-adj-btn" data-id="${adj.id}" style="padding:4px 8px; font-size:11px;">沖銷</button>`;
            } else {
              actions = `<span class="muted" style="font-size:11px;">${adj.reversal_reason || ''}</span>`;
            }

            return `
              <tr>
                <td class="mono">${adj.adjustment_no || '-'}</td>
                <td>${adj.standard}</td>
                <td>${adj.reason}</td>
                <td class="mono">${adj.entry_date}</td>
                <td>${fmtLines(debitLines, 'debit_amount')}</td>
                <td>${fmtLines(creditLines, 'credit_amount')}</td>
                <td>${adjStatusChip(adj.status)}</td>
                <td>${actions}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    wrap.innerHTML = `<p style="color:#b91c1c;">讀取失敗：${err.message}</p>`;
  }
}

let adjLineCounter = 0;

function adjLineRowHtml(accounts) {
  adjLineCounter++;
  const rid = `adjline_${adjLineCounter}`;
  return `
    <div class="adj-line-row" id="${rid}">
      <select class="adj-line-account">
        <option value="">選擇科目...</option>
        ${accounts.map(a => `<option value="${a.id}">${a.code} ${a.name}</option>`).join('')}
      </select>
      <input type="number" class="adj-line-debit" placeholder="借方金額" min="0" step="0.01" />
      <input type="number" class="adj-line-credit" placeholder="貸方金額" min="0" step="0.01" />
      <input type="text" class="adj-line-memo" placeholder="備註（選填）" />
      <button type="button" class="adj-remove-line-btn" onclick="document.getElementById('${rid}').remove(); updateAdjBalanceIndicator();">✕</button>
    </div>
  `;
}

window.updateAdjBalanceIndicator = function updateAdjBalanceIndicator() {
  const indicator = document.getElementById('adjBalanceIndicator');
  if (!indicator) return;
  let totalDebit = 0, totalCredit = 0;
  document.querySelectorAll('.adj-line-row').forEach(row => {
    totalDebit += Number(row.querySelector('.adj-line-debit')?.value || 0);
    totalCredit += Number(row.querySelector('.adj-line-credit')?.value || 0);
  });
  const balanced = totalDebit === totalCredit && totalDebit > 0;
  indicator.className = `adj-balance-indicator ${balanced ? 'adj-balance-ok' : 'adj-balance-bad'}`;
  indicator.textContent = `借方合計 ${formatTwd(totalDebit)} ／ 貸方合計 ${formatTwd(totalCredit)}${balanced ? '　✔ 借貸平衡' : '　✕ 尚未平衡'}`;
};

async function openIfrsAdjustmentModal() {
  const { data: accounts } = await supabase.from('accounts').select('*').order('code');
  adjLineCounter = 0;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center;';
  modal.innerHTML = `
    <div style="background:white; padding:24px; border-radius:14px; width:92%; max-width:760px; max-height:90vh; overflow:auto;">
      <h3 style="margin-top:0;">新增 IFRS 調整分錄</h3>
      <div class="form-grid">
        <div>
          <label>準則依據</label>
          <input type="text" id="adjStandard" placeholder="例：IFRS 16 租賃準則" />
        </div>
        <div>
          <label>調整分錄日期</label>
          <input type="date" id="adjEntryDate" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
      </div>
      <label style="margin-top:10px; display:block;">調整原因說明</label>
      <textarea id="adjReason" style="width:100%; height:60px; padding:8px;" placeholder="說明本次調整依據與原因..."></textarea>

      <h4 style="margin-top:18px; margin-bottom:8px;">分錄明細</h4>
      <div id="adjLinesContainer">
        ${adjLineRowHtml(accounts)}
        ${adjLineRowHtml(accounts)}
      </div>
      <button type="button" class="secondary" id="addAdjLineBtn" style="width:auto; margin-top:4px;">＋ 新增一行</button>
      <div id="adjBalanceIndicator" class="adj-balance-indicator adj-balance-bad">借方合計 NT$ 0 ／ 貸方合計 NT$ 0　✕ 尚未平衡</div>

      <div style="margin-top:20px; text-align:right;">
        <button type="button" id="submitAdjBtn" class="primary-btn">建立草稿</button>
        <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()" style="margin-left:10px;">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#addAdjLineBtn').addEventListener('click', () => {
    document.getElementById('adjLinesContainer').insertAdjacentHTML('beforeend', adjLineRowHtml(accounts));
  });
  modal.addEventListener('input', (e) => {
    if (e.target.classList.contains('adj-line-debit') || e.target.classList.contains('adj-line-credit')) {
      window.updateAdjBalanceIndicator();
    }
  });

  modal.querySelector('#submitAdjBtn').addEventListener('click', async () => {
    const standard = document.getElementById('adjStandard').value.trim();
    const reason = document.getElementById('adjReason').value.trim();
    const entryDate = document.getElementById('adjEntryDate').value;
    if (!standard) { alert('請填寫準則依據'); return; }
    if (!reason) { alert('請填寫調整原因'); return; }

    const lines = [];
    document.querySelectorAll('.adj-line-row').forEach(row => {
      const account_id = row.querySelector('.adj-line-account').value;
      const debit_amount = Number(row.querySelector('.adj-line-debit').value || 0);
      const credit_amount = Number(row.querySelector('.adj-line-credit').value || 0);
      const memo = row.querySelector('.adj-line-memo').value.trim();
      if (account_id && (debit_amount > 0 || credit_amount > 0)) {
        lines.push({ account_id, debit_amount, credit_amount, memo });
      }
    });

    const btn = document.getElementById('submitAdjBtn');
    btn.disabled = true;
    btn.textContent = '處理中...';
    try {
      await createIfrsAdjustment({ standard, reason, entryDate, lines });
      modal.remove();
      showMessage('已建立調整分錄草稿，請於列表中核准後才會生效。');
      renderIfrsAdjustments();
    } catch (err) {
      alert('建立失敗：' + err.message);
      btn.disabled = false;
      btn.textContent = '建立草稿';
    }
  });
}

let latestReportSnapshot = null; // 供「匯出 CPA 完整審計數據包」使用，於 renderReports() 內更新

async function renderFinancialNotes() {
  const wrap = document.getElementById('financialNotesWrap');
  if (!wrap) return;
  try {
    const notes = await fetchFinancialReportNotes();
    const balances = await fetchAccountBalancesByCode(['1101', '1102', '1141', '1601', '1602']);
    const dataDrivenValue = {
      note4: `NT$ ${(balances['1101'] + balances['1102']).toLocaleString()}`,
      note5: `NT$ ${balances['1141'].toLocaleString()}（尚未建立單獨的 IFRS 9 預期信用損失備抵科目）`,
      note6: `NT$ ${(balances['1601'] + balances['1602']).toLocaleString()}（固定資產原始成本扣除累計折舊後淨額）`
    };

    wrap.innerHTML = notes.map(note => `
      <div class="note-card" data-note-key="${note.note_key}">
        <div class="note-card-head">
          <span class="note-tag">${note.note_label}</span>
          <h5>${note.title}</h5>
          <button type="button" class="note-edit-btn no-print" data-key="${note.note_key}">編輯</button>
        </div>
        ${note.is_data_driven ? `<div class="note-card-value">${dataDrivenValue[note.note_key] || ''}</div>` : ''}
        <div class="note-view">
          <p>${(note.content || '（尚未填寫，請點選「編輯」補上說明）').replace(/</g, '&lt;')}</p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    wrap.innerHTML = `<p style="color:#b91c1c;">讀取失敗：${err.message}</p>`;
  }
}

function bindFinancialNoteEditButtons() {
  document.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.note-edit-btn');
    if (!editBtn) return;
    const card = editBtn.closest('.note-card');
    const key = editBtn.dataset.key;
    const viewEl = card.querySelector('.note-view');

    if (editBtn.textContent === '編輯') {
      const currentText = viewEl.querySelector('p').textContent.replace('（尚未填寫，請點選「編輯」補上說明）', '');
      viewEl.innerHTML = `<textarea>${currentText}</textarea>`;
      editBtn.textContent = '儲存';
    } else {
      const textarea = viewEl.querySelector('textarea');
      const newContent = textarea.value.trim();
      editBtn.disabled = true;
      try {
        await updateFinancialReportNote(key, newContent);
        viewEl.innerHTML = `<p>${(newContent || '（尚未填寫，請點選「編輯」補上說明）').replace(/</g, '&lt;')}</p>`;
        editBtn.textContent = '編輯';
      } catch (err) {
        alert('儲存失敗：' + err.message);
      }
      editBtn.disabled = false;
    }
  });
}


async function exportAuditPackage() {
  const btn = document.getElementById('exportAuditPackageBtn');
  if (btn) { btn.disabled = true; btn.textContent = '匯出中...'; }
  try {
    const notes = await fetchFinancialReportNotes();
    const adjustments = await fetchIfrsAdjustments();
    const pkg = {
      generatedAt: new Date().toISOString(),
      reportPeriod: {
        start: document.getElementById('reportPeriodStart')?.value || null,
        end: document.getElementById('reportPeriodEnd')?.value || null
      },
      financialStatements: latestReportSnapshot,
      ifrsAdjustmentsLayer: adjustments,
      notesToFinancialStatements: notes
    };
    downloadJsonFile(`CPA_審計數據包_${new Date().toISOString().slice(0, 10)}.json`, pkg);
    showMessage('已匯出審計數據包。');
  } catch (err) {
    alert('匯出失敗：' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📦 匯出 CPA 完整審計數據包（JSON）'; }
  }
}

function switchReportTab(tab) {
  if (!tab) return;
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.classList.toggle('active-tab', btn.dataset.reportTab === tab);
  });
  document.querySelectorAll('.report-cards-stack .report-card[data-report-tab]').forEach(card => {
    card.classList.toggle('active-tab', card.dataset.reportTab === tab);
  });
  // 切換單一報表頁籤時自動退出「全部檢視」模式
  const grid = document.getElementById('reportCardsGrid');
  const label = document.getElementById('showAllReportsBtnLabel');
  const showAllBtn = document.getElementById('showAllReportsBtn');
  if (grid && grid.classList.contains('show-all-mode')) {
    grid.classList.remove('show-all-mode');
    if (label) label.textContent = '全部檢視';
    if (showAllBtn) showAllBtn.classList.remove('is-active');
  }
}

async function renderReports() {
  let periodTx = getReportPeriodTransactions();
  const startDate = document.getElementById('reportPeriodStart')?.value || null;
  const endDate = document.getElementById('reportPeriodEnd')?.value || null;

  // 專案過濾
  if (state.currentProjectId && state.currentProjectId !== 'all') {
    periodTx = periodTx.filter(tx => tx.project_id === state.currentProjectId);
  }

  renderReportLetterhead('incomeLetterhead', '損益表');
  const incomeStatement = await buildIncomeStatement(periodTx, startDate, endDate);
  renderTable('incomeTable', incomeStatement);
  renderReportSignature('incomeSignature');

  renderReportLetterhead('balanceLetterhead', '資產負債表');
  const balanceSheet = await buildBalanceSheet(periodTx, startDate, endDate);
  renderTable('balanceTable', balanceSheet);
  renderReportSignature('balanceSignature');

  renderReportLetterhead('cashflowLetterhead', '現金流量表');
  const cashflowStatement = await buildCashflowStatement(periodTx, startDate, endDate);
  renderTable('cashflowTable', cashflowStatement);
  renderReportSignature('cashflowSignature');

  renderReportLetterhead('equityLetterhead', '權益變動表');
  const equityStatement = await buildEquityStatement(periodTx, startDate, endDate);
  renderTable('equityTable', equityStatement);
  renderReportSignature('equitySignature');

  renderReportLetterhead('trialLetterhead', '試算表');
  const includeAdjustments = document.getElementById('includeIfrsAdjustmentsToggle')?.checked || false;
  const trialBalance = await buildTrialBalance(periodTx, startDate, endDate, includeAdjustments);
  renderTable('trialTable', trialBalance);
  renderReportSignature('trialSignature');

  latestReportSnapshot = { incomeStatement, balanceSheet, cashflowStatement, equityStatement, trialBalance };

  fundraisingSnapshot = await buildFundraisingSnapshot(periodTx, startDate, endDate);
  renderFundraisingSimulation();
  renderIfrsAdjustments();
  renderFinancialNotes();

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

  addStatementSheet('損益表', '損益表', await buildIncomeStatement(periodTx));
  addStatementSheet('資產負債表', '資產負債表', await buildBalanceSheet(periodTx));
  addStatementSheet('現金流量表', '現金流量表', await buildCashflowStatement(periodTx));
  addStatementSheet('權益變動表', '權益變動表', await buildEquityStatement(periodTx));

  const journal = await buildJournal(periodTx);
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
  if (!table) return;

  table.innerHTML =
    '<thead><tr><th>會計科目 / 項目</th><th>金額</th><th>代碼</th></tr></thead><tbody></tbody>';

  const body = table.querySelector('tbody');

  // ===== 支援結構化財報物件 (Structured Financial Statements) =====
  if (rows && !Array.isArray(rows) && rows.type === 'structured') {
    let htmlContent = '';

    rows.sections.forEach(section => {
      // 渲染大項標題 (例如：一、營業收入 / 資產 / 負債及權益)
      htmlContent += `
        <tr class="section-header">
          <td colspan="3" style="font-weight: bold; background-color: #f8fafc; padding-top: 10px;">${section.title}</td>
        </tr>
      `;

      // 檢查是否有子分類 (針對資產負債表有 subsections 的情況)
      if (section.subsections) {
        section.subsections.forEach(sub => {
          htmlContent += `
            <tr class="sub-header">
              <td colspan="3" style="font-weight: 600; padding-left: 15px; color: #475569;">↳ ${sub.title}</td>
            </tr>
          `;
          sub.items.forEach(([label, amount, code = '-']) => {
            htmlContent += `
              <tr>
                <td style="padding-left: 30px;">${label}</td>
                <td style="text-align: right;">${Number(amount || 0).toLocaleString()}</td>
                <td style="color: #64748b; font-size: 12px;">${code}</td>
              </tr>
            `;
          });
          // 子分類小計
          htmlContent += `
            <tr style="border-bottom: 1px dashed #cbd5e1;">
              <td style="padding-left: 15px; font-weight: 600;">${sub.title}小計</td>
              <td style="text-align: right; font-weight: 600;">${Number(sub.subtotal || 0).toLocaleString()}</td>
              <td>-</td>
            </tr>
          `;
        });
        // 總計列
        htmlContent += `
          <tr style="border-top: 2px solid #0f172a; font-weight: bold;">
            <td>${section.title}總計</td>
            <td style="text-align: right;">${Number(section.total || 0).toLocaleString()}</td>
            <td>-</td>
          </tr>
        `;
      } 
      // 針對一般損益表直接帶 items 的情況
      else if (section.items) {
        section.items.forEach(([label, amount, code = '-']) => {
          htmlContent += `
            <tr>
              <td style="padding-left: 20px;">${label}</td>
              <td style="text-align: right;">${Number(amount || 0).toLocaleString()}</td>
              <td style="color: #64748b; font-size: 12px;">${code}</td>
            </tr>
          `;
        });
        htmlContent += `
          <tr style="border-top: 1px solid #cbd5e1; font-weight: bold;">
            <td style="padding-left: 10px;">${section.title}小計</td>
            <td style="text-align: right;">${Number(section.subtotal || 0).toLocaleString()}</td>
            <td>-</td>
          </tr>
        `;
      }
    });

    // 如果有本期淨利（損益表專用結算）
    if (rows.netProfit !== undefined) {
      htmlContent += `
        <tr style="border-top: 2px double #0f172a; font-weight: bold; background-color: #f1f5f9;">
          <td>本期淨利 (Net Profit)</td>
          <td style="text-align: right; color: ${rows.netProfit >= 0 ? '#16a34a' : '#dc2626'};">${Number(rows.netProfit || 0).toLocaleString()}</td>
          <td>-</td>
        </tr>
      `;
    }

    if (rows.reconciliation) {
      const r = rows.reconciliation;
      htmlContent += `
        <tr class="reconciliation-row">
          <td colspan="3">
            <div class="reconciliation-box">
              <strong>銀行餘額勾稽</strong>
              <span>實際銀行餘額：${Number(r.actualBalance || 0).toLocaleString()}</span>
              ${(r.balanceRows || []).map(b => `<span class="reconcile-detail">${b.nickname || b.bank_name || '銀行帳戶'}：${Number(b.current_balance ?? b.balance ?? b.ending_balance ?? 0).toLocaleString()}</span>`).join('')}
              <span>總帳銀行科目餘額：${Number(r.ledgerBalance || 0).toLocaleString()}</span>
              <span class="${Number(r.difference || 0) === 0 ? 'reconcile-ok' : 'reconcile-diff'}">未調節差異：${Number(r.difference || 0).toLocaleString()}</span>
              ${r.balanceError ? `<span class="reconcile-diff">實際餘額讀取失敗：${r.balanceError.code ? r.balanceError.code + ' - ' : ''}${r.balanceError.message}</span>` : ''}
            </div>
          </td>
        </tr>
      `;
    }

    body.innerHTML = htmlContent;
    return;
  }

  // ===== 原有的純陣列防呆與舊表格相容邏輯 =====
  if (!Array.isArray(rows)) {
    console.error("renderTable() 接收到的不是陣列：", rows);
    body.innerHTML = `
      <tr>
        <td colspan="3" style="color:red">資料格式錯誤</td>
      </tr>
    `;
    return;
  }

  rows.forEach(item => {
    if (!Array.isArray(item)) return;
    const [label, amount] = item;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td style="text-align: right;">${Number(amount || 0).toLocaleString()}</td>
      <td>-</td>
    `;
    body.appendChild(tr);
  });
}

function updateSettings() {
  const settingsPanel = document.getElementById('settings');
  const passwordCard = document.getElementById('passwordCard');
  const companyCard = document.getElementById('companyInfoCard');
  const accountCard = document.getElementById('accountManagementCard');
  const canEditCompany = canManageCompanyData();

  if (settingsPanel && passwordCard && settingsPanel.firstElementChild !== passwordCard) {
    settingsPanel.insertBefore(passwordCard, settingsPanel.firstElementChild);
  }
  if (passwordCard) {
    passwordCard.style.display = 'block';
    passwordCard.style.marginTop = '0';
    const emailInput = document.getElementById('passwordUserEmail');
    if (emailInput) emailInput.value = state.currentUser?.username || '';
  }
  if (companyCard) {
    companyCard.querySelectorAll('input').forEach(input => {
      input.disabled = !canEditCompany || input.id === 'companyPaidInCapital';
    });
    const submitButton = companyCard.querySelector('button[type="submit"]');
    if (submitButton) submitButton.style.display = canEditCompany ? '' : 'none';
  }
  if (accountCard) {
    accountCard.style.display = canEditCompany ? '' : 'none';
    if (canEditCompany) renderAccountManagement();
  }

  ['systemSettingsCard'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.style.display = canEditCompany ? '' : 'none';
  });
}

async function renderAccountManagement() {
  const list = document.getElementById('accountManagementList');
  if (!list || !isFinanceOperator()) return;
  try {
    const accounts = await fetchAccounts();
    window.__cachedAccounts = accounts;
    list.innerHTML = `
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th>代碼</th><th>名稱</th><th>類型</th><th>操作</th></tr></thead>
        <tbody>
          ${accounts.map(account => `
            <tr>
              <td>${escapeHtml(account.code)}</td>
              <td>${escapeHtml(account.name)}</td>
              <td>${escapeHtml(account.type)}</td>
              <td>
                <button type="button" class="secondary edit-account-btn" data-id="${account.id}" data-code="${escapeHtml(account.code)}" data-name="${escapeHtml(account.name)}" data-type="${escapeHtml(account.type)}">編輯</button>
                <button type="button" class="danger delete-account-btn" data-id="${account.id}" data-label="${escapeHtml(`${account.code} ${account.name}`)}">刪除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    list.innerHTML = `<div class="message error">會計科目載入失敗：${escapeHtml(error.message)}</div>`;
  }
}

function resetAccountManagementForm() {
  ['accountManagementId', 'accountManagementCode', 'accountManagementName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const type = document.getElementById('accountManagementType');
  if (type) type.value = 'expense';
}

async function saveAccountManagementForm(event) {
  event.preventDefault();
  if (!isFinanceOperator()) return showMessage('僅會計與管理員可維護會計科目。', true);
  const id = document.getElementById('accountManagementId')?.value || '';
  const payload = {
    code: document.getElementById('accountManagementCode')?.value.trim(),
    name: document.getElementById('accountManagementName')?.value.trim(),
    type: document.getElementById('accountManagementType')?.value
  };
  if (!payload.code || !payload.name || !payload.type) {
    showMessage('請填寫科目代碼、名稱與類型。', true);
    return;
  }
  const query = id
    ? supabase.from('accounts').update(payload).eq('id', id)
    : supabase.from('accounts').insert(payload);
  const { error } = await query;
  if (error) {
    showMessage(`會計科目儲存失敗：${error.message}`, true);
    return;
  }
  resetAccountManagementForm();
  await renderAccountManagement();
  showMessage('會計科目已儲存。');
}

async function renderBankAccounts() {
  // 🔥 修正：正確宣告 body 變數來對應表格容器
  const body = document.getElementById('bankAccountTableBody');
  if (!body) return;

  try {
    const [bankAccounts, ledgerAccounts] = await Promise.all([loadBankAccounts(), fetchAccounts()]);
    const accounts = Array.isArray(bankAccounts) ? bankAccounts : [];
    const ledgerById = new Map((ledgerAccounts || []).map(account => [account.id, account]));
    const ledgerSelect = document.getElementById('bankLedgerAccountId');
    if (ledgerSelect) {
      const selectedValue = ledgerSelect.value;
      const assetAccounts = (ledgerAccounts || []).filter(account => String(account.code || '').startsWith('1'));
      ledgerSelect.innerHTML = '<option value="">未綁定</option>' + assetAccounts.map(account =>
        `<option value="${account.id}">${escapeHtml(account.code)} ${escapeHtml(account.name)}</option>`
      ).join('');
      const defaultAccount = assetAccounts.find(account => account.code === '1102');
      ledgerSelect.value = selectedValue || defaultAccount?.id || '';
    }

    body.innerHTML = accounts.map(a => {
      const linkedAccountId = a.ledger_account_id || a.accounting_account_id || null;
      const linkedAccount = linkedAccountId ? ledgerById.get(linkedAccountId) : null;
      const totalBalance = a.current_balance ?? a.balance ?? a.opening_balance ?? null;
      const balanceDisplay = totalBalance === null ? '尚無餘額資料' : Number(totalBalance).toLocaleString();

      return `
        <tr>
          <td>${a.bank_name || a.bankName || '未命名'}</td>
          <td>${a.account_number || a.accountNumber || '-'}</td>
          <td>${a.nickname || '-'}</td>
          <td>${linkedAccount ? `${escapeHtml(linkedAccount.code)} ${escapeHtml(linkedAccount.name)}` : '<span class="badge wait">未綁定</span>'}</td>
          <td>${balanceDisplay}</td>
          <td>
            <button class="secondary edit-bank-btn" data-id="${a.id}">編輯</button>
            <button class="danger delete-bank-btn" data-id="${a.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" class="muted">尚未設定銀行帳戶。</td></tr>';

    populateBankSelect(document.getElementById('txBankAccount'), accounts);
    populateBankSelect(document.getElementById('vBankAccount'), accounts);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<tr><td colspan="5" class="muted">載入失敗</td></tr>';
  }
}

async function renderVoucherCenter() {
  const body = document.getElementById('voucherCenterTableBody');
  if (!body) return;
  const keyword = (document.getElementById('voucherSearchInput')?.value || '').trim().toLowerCase();
  const projectFilter = document.getElementById('voucherProjectFilter')?.value || 'all';
  const categoryFilter = document.getElementById('voucherCategoryFilter')?.value || 'all';
  const startDate = document.getElementById('voucherStartDate')?.value || '';
  const endDate = document.getElementById('voucherEndDate')?.value || '';
  body.innerHTML = '<tr><td colspan="7" class="muted">載入憑證資料...</td></tr>';

  try {
    let query = supabase
      .from('vouchers')
      .select('id, tx_date, voucher_no, request_voucher_no, accounting_voucher_no, accounting_sequence_no, summary, category, status, total_amount, applicant_id, project_id, project:projects(project_code, name), payment:voucher_payments(payment_no, payment_sequence_no, amount, paid_at)')
      .order('created_at', { ascending: false });

    if (projectFilter !== 'all') query = query.eq('project_id', projectFilter);
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
    if (startDate) query = query.gte('tx_date', startDate);
    if (endDate) query = query.lte('tx_date', endDate);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = (data || []).filter(voucher => {
      const payment = getVoucherPayment(voucher);
      if (!keyword) return true;
      return [
        voucher.request_voucher_no,
        voucher.voucher_no,
        voucher.accounting_voucher_no,
        payment?.payment_no,
        voucher.summary,
        voucher.category,
        voucher.status,
        voucher.project?.project_code,
        voucher.project?.name
      ].some(field => (field || '').toLowerCase().includes(keyword));
    });

    body.innerHTML = filtered.map(voucher => {
      const payment = getVoucherPayment(voucher);
      const paid = voucher.status === 'closed';
      return `
        <tr>
          <td>${escapeHtml(voucher.tx_date || '')}</td>
          <td>${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '-')}</td>
          <td>${escapeHtml(voucher.accounting_voucher_no || '-')}${voucher.accounting_sequence_no ? `<br><span class="muted">#${voucher.accounting_sequence_no}</span>` : ''}</td>
          <td>${escapeHtml(payment?.payment_no || (paid ? '-' : '尚未付款'))}${payment?.payment_sequence_no ? `<br><span class="muted">#${payment.payment_sequence_no}</span>` : ''}</td>
          <td>${escapeHtml(voucher.summary || voucher.project?.name || '')}<br><span class="muted">${escapeHtml(voucher.category || '-')}</span></td>
          <td><span class="badge ${paid ? 'success' : 'wait'}">${paid ? '已付款' : escapeHtml(voucher.status || '-')}</span></td>
          <td>NT$ ${Number(voucher.total_amount || 0).toLocaleString()}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">沒有符合條件的憑證資料。</td></tr>';
  } catch (error) {
    console.error('載入憑證中心失敗:', error);
    body.innerHTML = `<tr><td colspan="7" class="message error">載入失敗：${escapeHtml(error.message)}</td></tr>`;
  }
}

async function populateVoucherCenterProjectFilter() {
  const select = document.getElementById('voucherProjectFilter');
  if (!select) return;
  try {
    const projects = await fetchProjects();
    select.innerHTML = '<option value="all">全部專案</option>' + projects
      .map(project => `<option value="${project.id}">${escapeHtml(project.project_code || '無編號')} - ${escapeHtml(project.name || '')}</option>`)
      .join('');
  } catch (error) {
    console.error('載入憑證中心專案篩選失敗:', error);
    select.innerHTML = '<option value="all">全部專案</option>';
  }
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

async function renderEquityTab() {

    const table = document.getElementById("equityDetailTable");
    const note = document.getElementById("fundraisingNoteDetail");

    if (!table) return;

    try {

        const rows = await buildEquityStatement(
            state.transactions
        );

        renderTable(
            "equityDetailTable",
            rows
        );

        if (note) {

            const analysis = getEquityAnalysis(
                state.transactions || []
            );

            note.textContent =
                `現金水位：${analysis.cashBalance.toLocaleString()}｜` +
                `可撐月數：${
                    analysis.cashRunwayMonths
                    ? analysis.cashRunwayMonths.toFixed(1) + " 個月"
                    : "尚無支出紀錄"
                }｜建議：${analysis.fundraisingSuggestion}`;
        }

    } catch(err){

        console.error(err);

    }

}

async function renderJournalFiltered() {
  const keyword = (document.getElementById('journalSearchInput')?.value || '').trim().toLowerCase();
  const journalBody = document.getElementById('journalTableBody');
  if (!journalBody) return;

  try {
    const journal = await buildJournal(state.transactions || []);
    
    const filtered = journal.filter(row => {
      if (!keyword) return true;
      return [row.summary, row.bank, row.debitAccount, row.creditAccount, row.voucher]
        .some(field => (field || '').toLowerCase().includes(keyword));
    });

    journalBody.innerHTML = '';
    if (!filtered.length) {
      journalBody.innerHTML = '<tr><td colspan="9" class="muted">沒有符合條件的分錄。</td></tr>';
      return;
    }

    filtered.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="white-space:nowrap;">${row.date}</td>
        <td>${row.summary}</td>
        <td>${row.bank}</td>
        <td><span style="color:#1d4ed8; font-weight:600;">借</span> ${row.debitAccount}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${Number(row.debitAmount).toLocaleString()}</td>
        <td><span style="color:#b45309; font-weight:600;">貸</span> ${row.creditAccount}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${Number(row.creditAmount).toLocaleString()}</td>
        <td>${row.voucher || '-'}</td>
        <td><span class="badge success">${row.status}</span></td>
      `;
      journalBody.appendChild(tr);
    });
  } catch (err) {
    console.error('渲染日記帳失敗:', err);
    journalBody.innerHTML = '<tr><td colspan="9" class="muted">載入失敗</td></tr>';
  }
}

async function showApp() {
  if (!state.currentUser) {
    document.getElementById('loginView').style.display = 'grid';
    document.getElementById('appView').classList.remove('active');
    return;
  }
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').classList.add('active');
  try {
    const companyData = await getCompanyDataBundle();
    state.companyInfo = companyData.companyInfo;
    state.businessItems = companyData.businessItems;
    state.directorShareholders = companyData.directorShareholders;
  } catch (error) {
    console.error('載入公司資料失敗:', error);
    showMessage('公司資料暫時無法從資料庫載入。', true);
  }
  render();
  state.activeTab = 'dashboard';
  renderTabs();
  updateAdminNavVisibility();
  applyRoleBasedTabVisibility();
  render();
  initNotificationBell();
}

function showForcePasswordView() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').classList.remove('active');
  document.getElementById('forcePasswordView').style.display = 'grid';
}

let excelRowCounter = 0;
const voucherLineAttachments = {}; // { rowId: File }

window.toggleInvoiceRequired = (selectEl) => {
  const input = selectEl.closest('tr').querySelector('.grid-inv-num');
  if (selectEl.value === '發票') {
    input.disabled = false;
    input.required = true;
    input.placeholder = '必填發票號碼';
  } else {
    input.disabled = true;
    input.required = false;
    input.value = '';
    input.placeholder = '可留空';
  }
};

window.calculateVoucherTotal = () => {
  const amounts = Array.from(document.querySelectorAll('.grid-amount')).map(el => Number(el.value) || 0);
  const total = amounts.reduce((a, b) => a + b, 0);
  const display = document.getElementById('voucherTotalDisplay');
  if (display) display.innerText = `$${total.toLocaleString()}`;
};

window.clearPayeeName = (inputEl) => {
  const container = inputEl.closest('td, div');
  const nameSpan = inputEl.classList.contains('grid-proxy-id')
    ? container?.querySelector('.grid-proxy-name')
    : container?.querySelector('.grid-payee-name');
  if (!nameSpan) return;
  nameSpan.innerHTML = '';
  delete nameSpan.dataset.maskedName;
};

window.queuePayeeLookup = (inputEl) => {
  window.clearPayeeName(inputEl);
  clearTimeout(inputEl.__payeeLookupTimer);
  if ((inputEl.value || '').trim().length < 8) return;
  inputEl.__payeeLookupTimer = setTimeout(() => {
    if (inputEl.classList.contains('grid-proxy-id')) {
      window.fetchProxyPayerName(inputEl);
    } else {
      window.fetchPayeeName(inputEl);
    }
  }, 450);
};

window.fetchPayeeName = async (inputEl) => {
  const identifier = inputEl.value.trim();
  const container = inputEl.closest('td, div');
  const nameSpan = container.querySelector('.grid-payee-name');
  if (!nameSpan) return;
  if (!identifier) {
    nameSpan.innerHTML = '';
    delete nameSpan.dataset.maskedName;
    return;
  }

  nameSpan.innerText = '查詢中...';
  const { data, error } = await supabase
    .rpc('lookup_masked_payee_by_identifier', { p_identifier: identifier });
  const payee = Array.isArray(data) ? data[0] : null;

  if (error || !payee?.masked_name) {
    nameSpan.innerHTML = isFinanceOperator()
      ? `查無資料 <button type="button" class="secondary" style="padding:2px 6px; font-size:11px;" onclick="openAddPayeeModal('${identifier}', this)">＋ 新增付款人</button>`
      : '查無付款人，請確認身分證/統編或請會計建立主檔';
    delete nameSpan.dataset.maskedName;
    return;
  }
  nameSpan.innerText = payee.masked_name;
  nameSpan.dataset.maskedName = payee.masked_name;
};

window.openAddPayeeModal = (prefillIdentifier, triggerBtn) => {
  if (!isFinanceOperator()) {
    showMessage('請直接填寫付款人姓名與身分證/統編；付款人主檔由會計人員維護。', true);
    return;
  }
  const container = document.getElementById('addPayeeModalContainer');
  container.innerHTML = `
    <div class="modal-backdrop" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;">
      <div style="background:#fff; padding:24px; border-radius:8px; max-width:420px; width:90%;">
        <h3 style="margin-top:0;">新增付款人</h3>
        
        <label>身分證／統一編號</label>
        <input type="text" id="newPayeeIdentifier" value="${prefillIdentifier || ''}" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <label>姓名／公司名稱</label>
        <input type="text" id="newPayeeName" style="width:100%; padding:6px; margin-bottom:10px;" required>
        
        <label>類型</label>
        <select id="newPayeeType" style="width:100%; padding:6px; margin-bottom:10px;">
          <option value="individual">個人</option>
          <option value="company">公司／廠商</option>
        </select>
        
        <label>Email</label>
        <input type="email" id="newPayeeEmail" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <label>電話</label>
        <input type="text" id="newPayeePhone" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <label>地址</label>
        <input type="text" id="newPayeeAddress" style="width:100%; padding:6px; margin-bottom:10px;">
        
        <!-- 匯款資訊區塊 -->
        <div style="background:#f9fafb; padding:12px; border-radius:6px; margin-bottom:14px; border:1px solid #e5e7eb;">
          <label style="font-weight:600; color:#374151;">金融機構代號（選填，共7碼）</label>
          <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">前3碼總行代號 + 後4碼分支代號（例如中國信託營業部：8220016）</div>
          <input type="text" id="newPayeeBankCode" placeholder="請輸入7碼數字" maxlength="7" oninput="this.value=this.value.replace(/[^0-9]/g,'')" style="width:100%; padding:6px; margin-bottom:10px;">
          
          <label style="font-weight:600; color:#374151;">銀行帳號（選填）</label>
          <input type="text" id="newPayeeBankAccount" placeholder="請輸入銀行帳號" oninput="this.value=this.value.replace(/[^0-9-]/g,'')" style="width:100%; padding:6px;">
        </div>
        
        <div style="text-align:right;">
          <button type="button" class="secondary" onclick="document.querySelector('.modal-backdrop').remove()">取消</button>
          <button type="button" class="primary-btn" onclick="submitNewPayee('${triggerBtn ? triggerBtn.closest('td, div').querySelector('.grid-payee-id')?.id || '' : ''}')">儲存</button>
        </div>
      </div>
    </div>`;
  window.__payeeTriggerContext = triggerBtn;
};

window.submitNewPayee = async () => {
  const identifier = document.getElementById('newPayeeIdentifier').value.trim();
  const name = document.getElementById('newPayeeName').value.trim();
  
  if (!identifier || !name) { 
    alert('身分證/統編與姓名為必填'); 
    return; 
  }

  // 取得匯款資訊
  const bankCode = document.getElementById('newPayeeBankCode').value.trim();
  const bankAcc = document.getElementById('newPayeeBankAccount').value.trim();
  
  // 檢核金融機構代碼是否確實填滿7碼
  if (bankCode && bankCode.length !== 7) {
    alert('金融機構代號必須為完整的7碼數字（3碼總行+4碼分支）。');
    return;
  }

  // 將代碼與帳號組合成單一字串 (格式: 8220016-1234567890)
  let finalBankAccount = null;
  if (bankCode || bankAcc) {
    finalBankAccount = `${bankCode ? bankCode : ''}${bankCode && bankAcc ? '-' : ''}${bankAcc ? bankAcc : ''}`;
  }

  const payload = {
    identifier,
    name,
    type: document.getElementById('newPayeeType').value,
    email: document.getElementById('newPayeeEmail').value.trim() || null,
    phone: document.getElementById('newPayeePhone').value.trim() || null,
    address: document.getElementById('newPayeeAddress').value.trim() || null,
    bank_account: finalBankAccount
  };

  try {
    const { error } = await supabase.from('payees').insert({ ...payload,  });
    if (error) throw error;
    
    showMessage('付款人已新增。');
    document.querySelector('.modal-backdrop')?.remove();
    window.__cachedPayees = [...(window.__cachedPayees || []), { identifier, name }];
    
    // 回填到原本觸發的那個欄位
    const trigger = window.__payeeTriggerContext;
    if (trigger) {
      const container = trigger.closest('td, div');
      const idInput = container.querySelector('.grid-payee-id, .grid-proxy-id');
      const nameSpan = container.querySelector('.grid-payee-name, .grid-proxy-name');
      
      if (idInput) idInput.value = identifier;
      if (nameSpan) { 
        nameSpan.innerText = maskPayeeName(name); 
        nameSpan.dataset.maskedName = maskPayeeName(name); 
      }
    }
  } catch (error) {
    alert('新增失敗：' + error.message);
  }
};

window.addExcelRow = (prefillFile = null) => {
  const tbody = document.getElementById('excelLinesBody');
  if (!tbody) return;
  const isAccounting = isFinanceOperator();

  const rowId = `row-${excelRowCounter++}`;
  const tr = document.createElement('tr');
  tr.dataset.rowId = rowId;
  tr.innerHTML = `
    <td style="padding:8px; border:1px solid #ddd;"><input type="month" class="grid-month" style="width:96%; padding:4px;"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-inv-type" onchange="toggleInvoiceRequired(this)" style="width:100%; padding:4px;">
        <option value="無">無</option>
        <option value="發票">發票</option>
        <option value="收據">收據</option>
        <option value="領據">領據</option>
      </select>
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" placeholder="可留空" style="width:90%; padding:4px;" disabled></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-item-category" onchange="toggleCategoryNote(this)" style="width:100%; padding:4px;">
        <option value="車馬費">車馬費</option>
        <option value="住宿費">住宿費</option>
        <option value="文具用品">文具用品</option>
        <option value="餐飲交際">餐飲交際</option>
        <option value="郵電通訊">郵電通訊</option>
        <option value="設備與軟體授權">設備與軟體授權</option>
        <option value="專業服務費">專業服務費</option>
        <option value="其他">其他（請說明）</option>
      </select>
      <input type="text" class="grid-category-note" placeholder="請說明項目內容" style="display:none; width:96%; padding:4px; margin-top:4px;">
      ${isAccounting ? `
        <select class="line-account-code" style="width:100%; padding:4px; margin-top:4px;">
          <option value="">（會計歸類科目）</option>
        </select>
      ` : ''}
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="number" class="grid-amount" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateVoucherTotal()"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <input type="text" class="grid-payee-id" placeholder="身分證／統編" style="width:96%; padding:4px;" oninput="queuePayeeLookup(this)" onblur="fetchPayeeName(this)">
      <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;"></span>
      <label style="font-size:11px; display:block; margin-top:4px;">
        <input type="checkbox" class="grid-proxy-check" onchange="toggleProxyPayer(this)"> 已由他人代付
      </label>
      <input type="text" class="grid-proxy-id" placeholder="代付人身分證/統編" style="display:none; width:96%; padding:4px; margin-top:4px;" oninput="queuePayeeLookup(this)" onblur="fetchProxyPayerName(this)">
      <span class="grid-proxy-name" style="font-size:12px; color:#666; display:block;"></span>
    </td>
    <td style="padding:8px; border:1px solid #ddd; text-align:center;">
      <input type="file" class="grid-attachment" accept="image/*,.pdf" style="display:none;" onchange="assignLineAttachment('${rowId}', this.files[0])">
      <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="this.previousElementSibling.click()">📎 附件</button>
      <div class="attachment-label" style="font-size:10px; color:#666; margin-top:2px;">未選擇</div>
      <button type="button" class="danger" style="padding:4px 8px; font-size:12px; margin-top:4px;" onclick="this.closest('tr').remove(); calculateVoucherTotal();">刪除</button>
    </td>
  `;
  tbody.appendChild(tr);

  const accountSelect = tr.querySelector('.line-account-code');
  if (accountSelect && window.__cachedAccounts) {
    accountSelect.innerHTML = '<option value="">（會計歸類科目）</option>' +
      window.__cachedAccounts.map(a => `<option value="${a.code}">${a.code} ${a.name}</option>`).join('');
  }

  if (prefillFile) window.assignLineAttachment(rowId, prefillFile);
  return tr;
};

window.toggleCategoryNote = (selectEl) => {
  const note = selectEl.closest('td').querySelector('.grid-category-note');
  note.style.display = selectEl.value === '其他' ? 'block' : 'none';
};

window.toggleProxyPayer = (checkboxEl) => {
  const cell = checkboxEl.closest('td');
  const proxyInput = cell.querySelector('.grid-proxy-id');
  const proxyName = cell.querySelector('.grid-proxy-name');
  [proxyInput].forEach(input => {
    if (input) input.style.display = checkboxEl.checked ? 'block' : 'none';
  });
  if (!checkboxEl.checked) {
    if (proxyInput) proxyInput.value = '';
    if (proxyName) {
      proxyName.innerText = '';
      delete proxyName.dataset.maskedName;
    }
  }
};

window.fetchProxyPayerName = async (inputEl) => {
  const identifier = inputEl.value.trim();
  const nameSpan = inputEl.closest('td').querySelector('.grid-proxy-name');
  if (!identifier) { nameSpan.innerHTML = ''; return; }
  nameSpan.innerText = '查詢中...';
  const { data, error } = await supabase
    .rpc('lookup_masked_payee_by_identifier', { p_identifier: identifier });
  const payee = Array.isArray(data) ? data[0] : null;
  if (!error && payee?.masked_name) {
    nameSpan.innerText = `代付人：${payee.masked_name}`;
    nameSpan.dataset.maskedName = payee.masked_name;
  } else {
    nameSpan.innerHTML = isFinanceOperator()
      ? `查無代付人資料 <button type="button" class="secondary" style="padding:2px 6px; font-size:11px;" onclick="openAddPayeeModal('${identifier}', this)">＋ 新增</button>`
      : '查無代付人，請確認身分證/統編或請會計建立主檔';
    delete nameSpan.dataset.maskedName;
  }
};

window.assignLineAttachment = (rowId, file) => {
  if (!file) return;
  voucherLineAttachments[rowId] = file;
  const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
  const label = row?.querySelector('.attachment-label');
  if (label) label.textContent = `已選擇：${file.name}`;
};

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
  if (eventsInitialized) return;
  eventsInitialized = true;

  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  const appLayout = document.querySelector('.app-layout');

  const setDesktopSidebarCollapsed = collapsed => {
    appLayout?.classList.toggle('sidebar-collapsed', collapsed);
    if (sidebarCollapseBtn) {
      sidebarCollapseBtn.innerHTML = collapsed ? '&rsaquo;' : '&lsaquo;';
      sidebarCollapseBtn.title = collapsed ? '展開側欄' : '收合側欄';
      sidebarCollapseBtn.setAttribute('aria-label', sidebarCollapseBtn.title);
      sidebarCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
    }
    localStorage.setItem('finance_sidebar_collapsed', collapsed ? '1' : '0');
  };

  setDesktopSidebarCollapsed(localStorage.getItem('finance_sidebar_collapsed') === '1');
  sidebarCollapseBtn?.addEventListener('click', () => {
    setDesktopSidebarCollapsed(!appLayout?.classList.contains('sidebar-collapsed'));
  });

  menuToggleBtn?.addEventListener('click', () => {
    sidebarEl?.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  sidebarOverlay?.addEventListener('click', closeSidebar);

  document.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.approve-voucher-btn');
    const rejectBtn = e.target.closest('.reject-voucher-btn');
    const historyBtn = e.target.closest('.view-history-btn');

    if (approveBtn || rejectBtn) {
      e.preventDefault();
      const btn = approveBtn || rejectBtn;

      // 防止連點：按鈕一旦處理中就立即鎖住，避免同一張單據被重複核准／扣款。
      if (btn.disabled || btn.dataset.processing === '1') return;
      btn.dataset.processing = '1';
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = '處理中...';

      const id = btn.dataset.id;
      const stage = btn.dataset.stage;

      try {
        const vouchers = await fetchMyVouchers();
        const voucher = vouchers.find(v => v.id === id);
        if (!voucher) return;

        if (approveBtn) {
          if (stage === 'accounting') {
            btn.disabled = false;
            btn.dataset.processing = '0';
            btn.textContent = originalLabel;
            await openAccountingReviewModal(id);
            return;
          }
          await managerApprove(voucher);
          showMessage('已核准。');
        } else {
          const reason = await promptRejectReason();
          if (!reason) { 
            showMessage('已取消，退件必須填寫原因。', true);
            return;
          }
          stage === 'manager' ? await managerReject(voucher, reason.trim()) : await accountingReject(voucher, reason.trim());
          showMessage('已退件。');
        }
        renderVoucherWorkflowList();
      } catch (error) {
        showMessage(`操作失敗：${error.message}`, true);
        // 失敗時（例如狀態已變更）恢復按鈕，讓使用者能重新整理後再試一次
        btn.disabled = false;
        btn.dataset.processing = '0';
        btn.textContent = originalLabel;
      }
      return;
    }

    if (historyBtn) {
      const id = historyBtn.dataset.id;
      try {
        const logs = await fetchWorkflowLogs(id);
        const rows = logs.length ? logs.map(l => `
          <div style="font-size:13px; padding:8px 0; border-top:1px solid #eee;">
            ${new Date(l.created_at).toLocaleString('zh-TW')}｜${l.action}
            ${l.to_status ? ` → ${STATUS_LABELS[l.to_status] || l.to_status}` : ''}
            ${l.reject_reason ? `｜原因：${escapeHtml(l.reject_reason)}` : ''}
          </div>`).join('') : '<p class="muted">尚無審批紀錄。</p>';

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;';
        modal.innerHTML = `
          <div style="background:#fff; padding:24px; border-radius:8px; max-width:500px; width:90%; max-height:70vh; overflow-y:auto;">
            <h3 style="margin-top:0;">審批歷程</h3>
            ${rows}
            <button type="button" class="secondary" style="margin-top:16px;" onclick="this.closest('.modal-backdrop').remove()">關閉</button>
          </div>`;
        document.body.appendChild(modal);
      } catch (error) {
        showMessage(`載入審批歷程失敗：${error.message}`, true);
      }
    }
  });

  safeListener('parseStatementBtn', 'click', handleParseStatement);

  safeListener('changePasswordForm', 'submit', async (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
      showMessage('兩次輸入的新密碼不一致！', true);
      return;
    }

    if (newPassword.length < 6) {
      showMessage('新密碼長度至少需要 6 個字元！', true);
      return;
    }

    await withActionLock('password:change', submitButton, async () => {
      const result = await changeMyPassword(newPassword);
      if (!result.ok) {
        showMessage(`密碼修改失敗：${result.message}`, true);
        return;
      }

      if (state.currentUser) {
        state.currentUser.mustChangePassword = false;
        localStorage.setItem(USER_KEY, JSON.stringify(state.currentUser));
      }
      showMessage('密碼修改成功，請使用新密碼登入。');
      e.target.reset();
      const emailInput = document.getElementById('passwordUserEmail');
      if (emailInput) emailInput.value = state.currentUser?.username || '';
    }, { loadingText: '儲存中...' });
  });

  safeListener('bulkVoucherUpload', 'change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const existingRows = Array.from(document.querySelectorAll('#excelLinesBody tr'));

    files.forEach((file, i) => {
      if (existingRows[i]) {
        window.assignLineAttachment(existingRows[i].dataset.rowId, file);
      } else {
        window.addExcelRow(file);
      }
    });

    showMessage(`已將 ${files.length} 張照片依順序分配到各列，請檢查是否正確。`);
    e.target.value = '';
  });

  // 🤖 AI 掃描憑證：讀取圖片後呼叫 Gemini 辨識，自動新增一列並帶入憑證類型／號碼／金額／類別／月份
  safeListener('aiScanReceiptUpload', 'change', async (e) => {
    const file = e.target.files?.[0];
    const statusEl = document.getElementById('aiScanStatus');
    if (!file) return;

    try {
      if (statusEl) statusEl.textContent = '🤖 AI 辨識中，請稍候...';

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
      });
      const result = await res.json();

      const row = window.addExcelRow(file);
      if (!row) return;

      if (result.ok && result.extracted) {
        const ex = result.extracted;
        const invTypeSelect = row.querySelector('.grid-inv-type');
        const invNumInput = row.querySelector('.grid-inv-num');
        const catSelect = row.querySelector('.grid-item-category');
        const amountInput = row.querySelector('.grid-amount');
        const monthInput = row.querySelector('.grid-month');

        if (ex.docType && invTypeSelect) {
          invTypeSelect.value = ex.docType;
          window.toggleInvoiceRequired?.(invTypeSelect);
        }
        if (ex.invoiceNumber && invNumInput) invNumInput.value = ex.invoiceNumber;
        if (ex.expenseCategory && catSelect) {
          catSelect.value = ex.expenseCategory;
          window.toggleCategoryNote?.(catSelect);
        }
        if (ex.amount && amountInput) amountInput.value = ex.amount;
        if (ex.txDate && monthInput) monthInput.value = ex.txDate.slice(0, 7);

        window.calculateVoucherTotal?.();

        if (statusEl) {
          const confidenceLabel = { high: '信心程度高', medium: '信心程度中等，請覆核', low: '信心程度低，請務必覆核' }[ex.confidence] || '';
          statusEl.textContent = `✅ 已自動帶入一列（${confidenceLabel || '請覆核內容是否正確'}）`;
        }
      } else {
        if (statusEl) statusEl.textContent = `⚠️ ${result.message || 'AI 辨識失敗，已新增空白列請手動填寫。'}`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `⚠️ AI 掃描發生錯誤：${err.message}`;
    } finally {
      e.target.value = '';
    }
  });


  // 在 initializeEventsInternal() 裡面尋找這段：
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

      document.querySelectorAll('.app-modal-shell').forEach(modal => {
        modal.style.display = 'none';
      });
      document.querySelectorAll('.modal-backdrop').forEach(modal => modal.remove());

      if ((tab === 'transactions' || tab === 'bankAccounts' || tab === 'paymentManagement') && !isFinanceOperator()) {
        showMessage('僅會計部門與 Admin 可使用', true);
        return;
      }

      state.activeTab = tab;
      renderTabs();
      closeSidebar();

      // ======== 把呼叫補在這裡 ========
      if (tab === 'bankReconcile') {
        populateStatementBankAccountSelect();
      }

      if (tab === 'voucherWorkflow') {
        populateVoucherFormOptions();
        renderVoucherWorkflowList();
      }
      if (tab === 'voucherCenter') {
        populateVoucherCenterProjectFilter();
        renderVoucherCenter();
      }
      if (tab === 'paymentManagement') {
        setPaymentManagementMode('queue');
        renderPaymentManagement();
      }
      if (tab === 'settings') {
        fillCompanyInfoForm();
        renderCompanyData();
        renderBusinessData();
        updateSettings();
      }
      if (tab === 'adminUsers') {
        populateInviteDepartmentSelect();
        renderPermissionCheckboxes();
        renderAdminUserTable();
        renderAdminDepartmentList();
      }
      if (tab === 'budget') {
        renderBudget();
        populateProjectDepartmentSelect();
        populateProjectDefaultBankSelect();
        populateDepartmentBudgetFormOptions();
        renderDepartmentBudgetList();
        renderDepartmentBudgetRequestList();
      }
      if (btn.dataset.tab === 'reports') {
        setDefaultReportPeriod();
        renderReports();
      }
      if (tab === 'auditTrail') {
        renderAuditTrail();
      }
    });
  });

  safeListener('auditTrailSearchInput', 'input', () => renderAuditTrail());
  safeListener('auditTrailActionFilter', 'change', () => renderAuditTrail());

  safeListener('voucherSearchInput', 'input', renderVoucherCenter);
  safeListener('voucherProjectFilter', 'change', renderVoucherCenter);
  safeListener('voucherCategoryFilter', 'change', renderVoucherCenter);
  safeListener('voucherStartDate', 'change', renderVoucherCenter);
  safeListener('voucherEndDate', 'change', renderVoucherCenter);
  safeListener('deleteUnvouchedTransactionsBtn', 'click', () => {
    deleteUnvouchedTransactions().catch(error => showMessage('刪除無憑證交易失敗：' + error.message, true));
  });
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

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('確定要登出嗎？')) {
        try {
          await signOutSupabase();
          window.location.reload();
        } catch (err) {
          console.error(err);
          showMessage('登出失敗', true);
        }
      }
    });
  }

  const addTransactionForm = document.getElementById('addTransactionForm');
  if (addTransactionForm) {
    addTransactionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.submitter || addTransactionForm.querySelector('button[type="submit"]');
      await withActionLock('bank-transaction:add', submitBtn, async () => {

      const bankAccountId = document.getElementById('trans_bank_account_id').value;
      const transType = document.getElementById('trans_type').value;
      const amount = parseFloat(document.getElementById('trans_amount').value);
      const transDate = document.getElementById('trans_date').value;
      const description = document.getElementById('trans_description').value;

      if (!bankAccountId || !transType || !amount || !transDate) {
        return alert('請填寫所有必填欄位！');
      }

      try {
        const { error } = await supabase
          .from('bank_transactions')
          .insert([{
            bank_account_id: bankAccountId,
            type: transType,
            amount: amount,
            tx_date: transDate,
            description: description,          }]);

        if (error) throw error;

        alert('交易新增成功！');
        document.getElementById('addTransactionModal').style.display = 'none';
        e.target.reset();
        await reloadAppData();
        render();
      } catch (err) {
        alert(`新增交易失敗: ${err.message}`);
        console.error('新增銀行交易失敗:', err);
      }
      });
    });
  }

  const transactionTableBody = document.getElementById('transactionTableBody');
  if (transactionTableBody) {
    transactionTableBody.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.delete-transaction-btn');
      if (deleteBtn) {
        const transactionId = deleteBtn.dataset.id;
        const index = parseInt(deleteBtn.dataset.index, 10);
        if (confirm('確定要刪除這筆交易紀錄嗎？')) {
          if (transactionId) {
            const { error } = await supabase.from('bank_transactions').delete().eq('id', transactionId);
            if (error) return showMessage('刪除交易失敗：' + error.message, true);
          } else if (!isNaN(index)) {
            state.transactions.splice(index, 1);
            saveState(state);
          }
          await renderTransactionTable();
          showMessage('交易已成功刪除。');
        }
      }
    });
  }

  safeListener('forcePasswordForm', 'submit', async (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
    const newPassword = document.getElementById('forceNewPassword').value;
    const confirmPassword = document.getElementById('forceConfirmPassword').value;
    const messageEl = document.getElementById('forcePasswordMessage');

    if (newPassword !== confirmPassword) {
      messageEl.className = 'message error';
      messageEl.textContent = '兩次輸入的密碼不一致。';
      return;
    }
    await withActionLock('password:force-change', submitButton, async () => {
      const result = await changeMyPassword(newPassword);
      if (!result.ok) {
        messageEl.className = 'message error';
        messageEl.textContent = result.message;
        return;
      }
      state.currentUser.mustChangePassword = false;
      localStorage.setItem(USER_KEY, JSON.stringify(state.currentUser));
      e.target.reset();
      document.getElementById('forcePasswordView').style.display = 'none';
      showApp();
    }, { loadingText: '更新中...' });
  });

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
    showApp();
  });

  safeListener('companyInfoForm', 'submit', async (e) => {
    e.preventDefault();
    if (!canManageCompanyData()) {
      showMessage('只有管理員與會計部門可以修改公司資料。', true);
      return;
    }
    try {
      state.companyInfo = await saveCompanyInfo({
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
      });
      saveState(state);
      renderCompanyData();
      fillCompanyInfoForm();
      await renderReports();
      showMessage('公司資料已儲存至資料庫並同步至財報。');
    } catch (error) {
      console.error('儲存公司資料失敗:', error);
      showMessage('公司資料儲存失敗：' + error.message, true);
    }
  });

  safeListener('accountManagementForm', 'submit', saveAccountManagementForm);
  safeListener('resetAccountManagementForm', 'click', resetAccountManagementForm);
  safeListener('accountManagementList', 'click', async (event) => {
    const editBtn = event.target.closest('.edit-account-btn');
    const deleteBtn = event.target.closest('.delete-account-btn');

    if (editBtn) {
      document.getElementById('accountManagementId').value = editBtn.dataset.id || '';
      document.getElementById('accountManagementCode').value = editBtn.dataset.code || '';
      document.getElementById('accountManagementName').value = editBtn.dataset.name || '';
      document.getElementById('accountManagementType').value = editBtn.dataset.type || 'expense';
      return;
    }

    if (deleteBtn) {
      const label = deleteBtn.dataset.label || '此科目';
      if (!confirm(`確定要刪除 ${label}？若已被憑證或分錄使用，系統會阻擋刪除。`)) return;
      const { error } = await supabase.from('accounts').delete().eq('id', deleteBtn.dataset.id);
      if (error) {
        showMessage(`刪除科目失敗：${error.message}。若已被使用，請改用修改名稱或保留。`, true);
        return;
      }
      await renderAccountManagement();
      showMessage('會計科目已刪除。');
    }
  });

  safeListener('businessInfoContent', 'click', async (event) => {
    const target = event.target;
    if (!target) return;

    if (target.closest('#addBusinessItemRowBtn')) {
      document.getElementById('businessItemsEditorBody')?.insertAdjacentHTML('beforeend', buildBusinessItemRow());
      return;
    }

    if (target.closest('#addDirectorShareholderRowBtn')) {
      document.getElementById('directorShareholdersEditorBody')?.insertAdjacentHTML('beforeend', buildDirectorShareholderRow());
      return;
    }

    if (target.closest('.remove-business-item-row')) {
      target.closest('.business-item-row')?.remove();
      return;
    }

    if (target.closest('.remove-director-shareholder-row')) {
      target.closest('.director-shareholder-row')?.remove();
      return;
    }

    const saveButton = target.closest('#saveBusinessInfoBtn');
    if (!saveButton) return;
    if (!canManageCompanyData()) {
      showMessage('只有管理員與會計部門可以修改事業項目與董監名單。', true);
      return;
    }

    try {
      await withActionLock('company-business-info:save', saveButton, async () => {
        const businessItems = collectBusinessItemRows();
        const shareholders = collectDirectorShareholderRows();
        if (!businessItems.length) throw new Error('至少需要一筆營業項目');
        if (!shareholders.length) throw new Error('至少需要一筆董監名單');

        state.businessItems = await saveCompanyBusinessItems(businessItems);
        const result = await saveCompanyShareholders(shareholders);
        state.directorShareholders = result.shareholders;
        state.companyInfo = result.companyInfo;
        saveState(state);
        renderBusinessData();
        renderCompanyData();
        fillCompanyInfoForm();
        await renderReports();
        showMessage('事業項目與董監名單已儲存。');
      });
    } catch (error) {
      showMessage('事業項目與董監名單儲存失敗：' + error.message, true);
    }
  });

  const bankForm = document.getElementById('bankAccountForm');
  if (bankForm) {
    bankForm.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.submitter || bankForm.querySelector('button[type="submit"]');
      await withActionLock(`bank-account:${state.editingBankId || 'new'}`, submitBtn, async () => {

      const bankData = {
        bank_name: document.getElementById('bankName').value.trim(),
        account_number: document.getElementById('bankAccountNumber').value.trim(),
        nickname: document.getElementById('bankNickname').value.trim(),
        opening_balance: parseFloat(document.getElementById('bankOpeningBalance').value) || 0,
        ledger_account_id: document.getElementById('bankLedgerAccountId').value || null,
        accounting_account_id: document.getElementById('bankLedgerAccountId').value || null
      };

      if (state.editingBankId) {
        const { error } = await supabase
          .from('bank_accounts')
          .update(bankData)
          .eq('id', state.editingBankId)
          ;

        if (error) {
          alert('更新失敗：' + error.message);
        } else {
          alert('銀行帳戶已成功更新！');
          window.resetBankForm();
          renderBankAccounts();
        }
      } else {
        const { error } = await supabase
          .from('bank_accounts')
          .insert([{ ...bankData,  }]);

        if (error) {
          alert('新增失敗：' + error.message);
        } else {
          alert('銀行帳戶已成功新增！');
          bankForm.reset();
          renderBankAccounts();
        }
      }
      });
    };
  }

  document.getElementById('bankAccountTableBody')?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-bank-btn');
    if (deleteBtn) {
      if (confirm('確定刪除此銀行帳戶？')) {
        await withActionLock(`bank-account:delete:${deleteBtn.dataset.id}`, deleteBtn, async () => {
          await deleteBankAccount(deleteBtn.dataset.id);
          renderBankAccounts();
          showMessage('銀行帳戶已刪除。');
        });
      }
      return;
    }

    const editBtn = e.target.closest('.edit-bank-btn');
    if (editBtn) {
      const accountId = editBtn.dataset.id;
      if (typeof window.editBankAccount === 'function') {
        window.editBankAccount(accountId);
      }
      return;
    }
  });

  safeListener('transactionForm', 'submit', async (e) => { 
    e.preventDefault();
    const submitBtn = e.submitter || e.target.querySelector('button[type="submit"]');
    await withActionLock('transaction:create', submitBtn, async () => {
    try {
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
    const bankAccountId = document.getElementById('txBankAccount').value;

    if (!bankAccountId) {
      throw new Error('請選擇銀行帳戶');
    }

    const transactionNo = resolveVoucherNumber(voucherType, rawVoucher, date);
    const { error: transactionError } = await supabase.from('bank_transactions').insert({
      tx_date: date,
      bank_account_id: bankAccountId,
      counterparty: document.getElementById('txCustomer').value.trim() || null,
      description: document.getElementById('txDetail').value.trim() || null,
      type: document.getElementById('txType').value,
      category: document.getElementById('txCategory').value,
      amount: Number(document.getElementById('txAmount').value),
      remark: document.getElementById('txRemark').value.trim(),
      transaction_no: transactionNo,
      attachment_id: attachmentId || null
    });
    if (transactionError) throw transactionError;
    await renderTransactionTable();
    e.target.reset();
    showMessage(`交易已新增至 Supabase：${transactionNo}`);
    } catch (err) {
      console.error('新增交易失敗:', err);
      showMessage('新增交易失敗：' + err.message, true);
    }
    });
  });

  function printReports(mode = 'current') {
    state.activeTab = 'reports';
    renderTabs();
    const financialReportTabs = ['income', 'balance', 'cashflow', 'equity'];
    const selectedTab = document.querySelector('.report-tab-btn.active-tab')?.dataset.reportTab || 'income';
    const activeTab = financialReportTabs.includes(selectedTab) ? selectedTab : 'income';
    document.body.classList.add(mode === 'all' ? 'report-print-all' : 'report-print-single');
    const cleanup = () => {
      document.body.classList.remove('report-print-all', 'report-print-single');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
    }, 100);
  }

  safeListener('printReportBtn', 'click', () => {
    printReports('current');
  });

  safeListener('printAllReportsBtn', 'click', () => {
    printReports('all');
  });

  document.querySelectorAll('.period-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyReportPeriodPreset(btn.dataset.preset));
  });

  // 財報頁籤切換（損益表／資產負債表／現金流量表／權益變動表／試算表／募資精算）
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchReportTab(btn.dataset.reportTab));
  });

  // 募資精算模擬器：任一輸入變動時即時重新計算（不需重新整理或重新查詢資料庫）
  ['fsExpansionCost', 'fsRevenueGrowth', 'fsBufferMonths', 'fsPreMoney'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderFundraisingSimulation);
  });

  // 平行帳簿：新增 IFRS 調整分錄
  safeListener('addIfrsAdjustmentBtn', 'click', () => openIfrsAdjustmentModal());

  // 財報附註：編輯儲存（事件委派，只需綁定一次）
  bindFinancialNoteEditButtons();
  safeListener('exportAuditPackageBtn', 'click', () => exportAuditPackage());

  // 試算表：切換是否納入已核准的 IFRS 調整分錄
  safeListener('includeIfrsAdjustmentsToggle', 'change', () => renderReports());

  // 平行帳簿：核准／沖銷／刪除草稿（事件委派，因為列表是動態產生的）
  document.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.approve-adj-btn');
    const reverseBtn = e.target.closest('.reverse-adj-btn');
    const deleteBtn = e.target.closest('.delete-adj-btn');
    if (!approveBtn && !reverseBtn && !deleteBtn) return;

    const btn = approveBtn || reverseBtn || deleteBtn;
    if (btn.disabled) return;
    const id = btn.dataset.id;

    try {
      if (approveBtn) {
        if (!confirm('確定要核准此筆 IFRS 調整分錄嗎？核准後將無法修改，只能開立沖銷分錄。')) return;
        btn.disabled = true;
        await approveIfrsAdjustment(id);
        showMessage('已核准，IFRS 調整後試算表將自動納入此筆分錄。');
      } else if (reverseBtn) {
        const reason = prompt('請輸入沖銷原因：');
        if (!reason || !reason.trim()) return;
        btn.disabled = true;
        await reverseIfrsAdjustment(id, reason);
        showMessage('已沖銷此筆調整分錄。');
      } else if (deleteBtn) {
        if (!confirm('確定要刪除此草稿嗎？（已核准的分錄無法刪除）')) return;
        btn.disabled = true;
        await deleteIfrsAdjustmentDraft(id);
        showMessage('已刪除草稿。');
      }
      renderIfrsAdjustments();
    } catch (err) {
      alert('操作失敗：' + err.message);
      btn.disabled = false;
    }
  });

  // 「全部檢視」切換：畫面上一次顯示全部四大報表（列印時無論如何都會顯示全部）
  safeListener('showAllReportsBtn', 'click', () => {
    const grid = document.getElementById('reportCardsGrid');
    const label = document.getElementById('showAllReportsBtnLabel');
    const btn = document.getElementById('showAllReportsBtn');
    if (!grid) return;
    const showingAll = grid.classList.toggle('show-all-mode');
    if (label) label.textContent = showingAll ? '單一檢視' : '全部檢視';
    if (btn) btn.classList.toggle('is-active', showingAll);
  });

  safeListener('exportExcelBtn', 'click', () => {
    exportReportsToExcel().catch(err => showMessage(`匯出失敗：${err.message}`, true));
  });

  safeListener('inviteUserForm', 'submit', async (e) => { 
    e.preventDefault();
    const resultBox = document.getElementById('inviteResultBox');
    const submitBtn = e.submitter || e.target.querySelector('button[type="submit"]');
    await withActionLock('invite-user', submitBtn, async () => {
      try {
        const result = await inviteNewUser({
          email: document.getElementById('inviteEmail').value.trim(),
          fullName: document.getElementById('inviteFullName').value.trim(),
          role: document.getElementById('inviteRole').value,
          departmentId: document.getElementById('inviteDepartment').value,
          password: document.getElementById('invitePassword').value.trim(),
          permissions: getInvitePermissions()
        });
        resultBox.style.display = 'block';
        resultBox.className = result.emailSent ? 'message success' : 'message warning';
        if (result.emailSent && result.emailProvider === 'supabase') {
          resultBox.textContent = `帳號已建立，Supabase 邀請信已寄至 ${result.credentials.email}，使用者點擊信件連結後設定密碼。`;
        } else if (result.emailSent) {
          resultBox.textContent = `帳號已建立，邀請信已寄至 ${result.credentials.email}（使用者登入後系統會強制要求設定新密碼）。`;
        } else {
          resultBox.textContent = `帳號已建立但通知信失敗：${result.credentials.email}｜初始密碼：${result.credentials.tempPassword}（${result.emailError || '未知原因'}）`;
        }
        e.target.reset();
        await renderAdminUserTable();
      } catch (error) {
        console.error('邀請使用者失敗:', error);
        resultBox.style.display = 'block';
        resultBox.className = 'message error';
        resultBox.textContent = `開通失敗：${error.message}`;
      }
    });
  });

  safeListener('inviteRole', 'change', () => {
    renderPermissionCheckboxes();
  });

  safeListener('paymentStatusFilter', 'change', () => renderPaymentManagement());
  safeListener('exportPaymentListBtn', 'click', () => {
    exportPaymentListToExcel().catch(error => showMessage('匯出付款清單失敗：' + error.message, true));
  });
  safeListener('paymentList', 'click', async (event) => {
    const button = event.target.closest('button[data-payment-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const voucherId = button.dataset.voucherId;
    if (!voucherId) {
      alert('找不到付款單據 ID，請重新整理付款清單。');
      return;
    }
    if (button.dataset.paymentAction === 'open-editor') {
      try {
        await withActionLock(`payment-editor:${voucherId}`, button, async () => {
          await window.openPaymentEditor(voucherId);
        }, { loadingText: '開啟中...' });
      } catch (error) {
        console.error('付款設定按鈕執行失敗:', error);
        alert('付款設定按鈕執行失敗：' + error.message);
      }
      return;
    }
    if (button.dataset.paymentAction === 'view-voucher') {
      window.viewPaymentVoucher(voucherId);
    }
  });
  document.querySelectorAll('.payment-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setPaymentManagementMode(btn.dataset.paymentMode);
      if (btn.dataset.paymentMode === 'recipients') await renderPaymentRecipientList();
      if (btn.dataset.paymentMode === 'payroll') await renderPayrollPaymentPanel();
    });
  });
  safeListener('cancelRecipientEditBtn', 'click', resetPaymentRecipientForm);
  safeListener('paymentRecipientForm', 'submit', async (event) => {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    await withActionLock('payment-recipient:save', submitButton, async () => {
      const id = document.getElementById('paymentRecipientId').value || null;
      const payeeId = document.getElementById('paymentPayeeId')?.value || null;
      const payeePayload = {
        name: document.getElementById('recipientDisplayName').value.trim(),
        identifier: document.getElementById('recipientIdentifier').value.trim(),
        phone: document.getElementById('recipientPhone').value.trim() || null,
        email: document.getElementById('recipientEmail').value.trim() || null,
        bank_account: document.getElementById('recipientAccountNumber').value.trim(),
        bank_name: document.getElementById('recipientBankName').value.trim(),
        bank_branch: document.getElementById('recipientBankBranch').value.trim() || null,
        account_name: document.getElementById('recipientAccountName').value.trim(),
        account_number: document.getElementById('recipientAccountNumber').value.trim(),
        note: document.getElementById('recipientNote').value.trim() || null,
        is_active: true,
        updated_by: state.currentUser?.id || null,
        updated_at: new Date().toISOString()
      };
      const recipientPayload = {
        display_name: document.getElementById('recipientDisplayName').value.trim(),
        identifier: document.getElementById('recipientIdentifier').value.trim() || null,
        bank_name: document.getElementById('recipientBankName').value.trim(),
        bank_branch: document.getElementById('recipientBankBranch').value.trim() || null,
        account_name: document.getElementById('recipientAccountName').value.trim(),
        account_number: document.getElementById('recipientAccountNumber').value.trim(),
        contact_name: document.getElementById('recipientContactName').value.trim() || null,
        phone: document.getElementById('recipientPhone').value.trim() || null,
        email: document.getElementById('recipientEmail').value.trim() || null,
        note: document.getElementById('recipientNote').value.trim() || null,
        updated_by: state.currentUser?.id,
        updated_at: new Date().toISOString()
      };
      if (!payeePayload.name || !payeePayload.identifier) {
        throw new Error('請填寫付款人名稱與身分證／統編');
      }
      let savedPayeeId = payeeId;
      if (savedPayeeId) {
        const { error } = await supabase.from('payees').update(payeePayload).eq('id', savedPayeeId);
        if (error) throw error;
      } else {
        const { data: payee, error } = await supabase
          .from('payees')
          .upsert(payeePayload, { onConflict: 'identifier' })
          .select('id')
          .single();
        if (error) throw error;
        savedPayeeId = payee.id;
      }
      recipientPayload.payee_id = savedPayeeId;
      const existingRecipientId = id || (window.__payeeDetailsCache || [])
        .find(payee => payee.id === savedPayeeId)
        ?.payment_recipients
        ?.find(recipient => recipient.active !== false)
        ?.id;
      const query = existingRecipientId
        ? supabase.from('payment_recipients').update(recipientPayload).eq('id', existingRecipientId)
        : supabase.from('payment_recipients').insert(recipientPayload);
      const { error: recipientError } = await query;
      if (recipientError) throw recipientError;
      resetPaymentRecipientForm();
      showMessage('付款人主檔已儲存。');
      await renderPaymentManagement();
    });
  });

  safeListener('payrollPaymentForm', 'submit', async (event) => {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    await withActionLock('payroll-payment:create', submitButton, async () => {
      const summary = document.getElementById('payrollSummary')?.value.trim();
      const paymentDate = document.getElementById('payrollPaymentDate')?.value;
      const bankAccountId = document.getElementById('payrollBankAccount')?.value;
      const items = collectPayrollItems();
      if (!summary) throw new Error('請輸入薪資摘要');
      if (!paymentDate) throw new Error('請選擇付款日期');
      if (!bankAccountId) throw new Error('請選擇出款銀行');
      if (!items.length) throw new Error('請至少勾選一位員工');
      const invalid = items.find(item => item.gross_salary <= 0 || item.net_pay < 0);
      if (invalid) throw new Error('請確認每位員工薪資金額，實領不可為負數');
      const totalNet = items.reduce((sum, item) => sum + item.net_pay, 0);
      const totalLabor = items.reduce((sum, item) => sum + item.labor_insurance, 0);
      const totalHealth = items.reduce((sum, item) => sum + item.health_insurance, 0);
      const totalPension = items.reduce((sum, item) => sum + item.pension, 0);
      const totalCashOut = totalNet + totalLabor + totalHealth + totalPension;
      if (!confirm(`確認建立薪資付款？\n員工實領 NT$ ${totalNet.toLocaleString()}\n勞保 NT$ ${totalLabor.toLocaleString()}，健保 NT$ ${totalHealth.toLocaleString()}，勞退 NT$ ${totalPension.toLocaleString()}\n總出款 NT$ ${totalCashOut.toLocaleString()}`)) return;

      const { data, error } = await supabase.rpc('create_payroll_payment_batch', {
        p_summary: summary,
        p_payment_date: paymentDate,
        p_bank_account_id: bankAccountId,
        p_items: items
      });
      if (error) throw error;
      showMessage(`薪資付款已建立：${Number(data?.employee_count || items.length)} 人，總出款 NT$ ${Number(data?.total_cash_out || totalCashOut).toLocaleString()}。`);
      await Promise.all([renderPayrollPaymentPanel(), renderPaymentManagement(), renderTransactionTable(), renderVoucherCenter()]);
      renderDashboard();
    });
  });

  safeListener('departmentBudgetForm', 'submit', async (event) => {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    await withActionLock('department-budget-request:submit', submitButton, async () => {
      const departmentId = document.getElementById('departmentBudgetDepartment')?.value || null;
      const fiscalYear = Number(document.getElementById('departmentBudgetYear')?.value || new Date().getFullYear());
      const amount = Number(document.getElementById('departmentBudgetAmount')?.value || 0);
      const note = document.getElementById('departmentBudgetNote')?.value.trim() || null;
      const itemDetails = collectDepartmentBudgetItems();
      const itemTotal = itemDetails.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (!departmentId || !fiscalYear || amount <= 0 || !note) throw new Error('請確認部門、年度、申請金額與申請原因');
      if (!itemDetails.length) throw new Error('請至少填寫一個預算項目明細');
      if (itemTotal !== amount) throw new Error(`預算項目合計 NT$ ${itemTotal.toLocaleString()} 必須等於申請金額 NT$ ${amount.toLocaleString()}`);

      const { error } = await supabase.from('department_budget_requests').insert({
        department_id: departmentId,
        fiscal_year: fiscalYear,
        requested_amount: amount,
        reason: note,
        item_details: itemDetails,
        status: 'pending',
        requested_by: state.currentUser?.id || null
      });
      if (error) throw error;

      event.target.reset();
      await populateDepartmentBudgetFormOptions();
      await renderDepartmentBudgetRequestList();
      await renderDepartmentBudgetList();
      showMessage('預算申請已送出，待會計審核。');
    });
  });

  const excelVoucherForm = document.getElementById('voucherCreateForm');
  if (excelVoucherForm) {
    excelVoucherForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.submitter || excelVoucherForm.querySelector('button[type="submit"]');
      await withActionLock('voucher:create', submitBtn, async () => {

      try {
        const txDate = document.getElementById('vDate')?.value || new Date().toISOString().split('T')[0];
        const projectId = document.getElementById('vProject')?.value || null;
        const generalSummary = document.getElementById('vTitle')?.value.trim() || "批量多行核銷單據";
        const departmentId = document.getElementById('vDepartment')?.value || null;
        const departmentBudgetId = document.getElementById('vDepartmentBudget')?.value || null;
        const managerId = document.getElementById('vManagerPicker')?.value || null;
        const tripStart = document.getElementById('vTripStart')?.value || null;
        const tripEnd = document.getElementById('vTripEnd')?.value || null;
        if (!departmentId) {
          throw new Error('請選擇所屬部門');
        }
        if (!projectId && !departmentBudgetId) {
          throw new Error('非專案報支請選擇部門年度預算');
        }
        
        const rows = document.querySelectorAll('#excelLinesBody tr');
        let detailLines = [];
        let invoiceLines = [];
        let missingCredentialRows = [];
        let missingPayeeRows = [];
        const selectedPayeeIdentifiers = new Set();
        let calculatedTotal = 0;

        rows.forEach((row, index) => {
          const descInput = row.querySelector('.grid-category-note');
          const categorySelect = row.querySelector('.grid-item-category');
          const amtInput = row.querySelector('.grid-amount');
          const invTypeInput = row.querySelector('.grid-inv-type');
          const invNumInput = row.querySelector('.grid-inv-num');
          const accountSelect = row.querySelector('.line-account-code');
          const payeeIdInput = row.querySelector('.grid-payee-id');
          const payeeNameSpan = row.querySelector('.grid-payee-name');
          const proxyCheck = row.querySelector('.grid-proxy-check');
          const proxyIdInput = row.querySelector('.grid-proxy-id');
          const proxyNameSpan = row.querySelector('.grid-proxy-name');

          const amt = Number(amtInput?.value || 0);
          const category = categorySelect ? categorySelect.value : '';
          const categoryNote = category === '其他' ? (descInput?.value.trim() || '') : '';
          const description = category === '其他' ? categoryNote : category;

          if (!description || amt <= 0) return;

          const payeeIdentifier = payeeIdInput?.value.trim() || '';
          const payeeName = (
            payeeNameSpan?.dataset.maskedName
            || payeeNameSpan?.innerText.trim()
            || ''
          ).replace(/^付款人：/, '').trim();
          const proxyPayerName = (
            proxyNameSpan?.dataset.maskedName
            || proxyNameSpan?.innerText.replace('代付人：', '').trim()
            || ''
          ).trim();
          if (!payeeIdentifier || !payeeName || payeeName.includes('查無') || payeeName.includes('查詢中')) {
            missingPayeeRows.push(index + 1);
          } else {
            selectedPayeeIdentifiers.add(payeeIdentifier);
          }

          const rowId = row.dataset.rowId;
          const invType = invTypeInput ? invTypeInput.value : '無';
          const invNumber = invNumInput?.value.trim() || '';
          const hasInvoiceRecord = invType !== '無';
          const hasAttachment = !!(rowId && voucherLineAttachments[rowId]);
          if (!hasInvoiceRecord && !hasAttachment) {
            missingCredentialRows.push(index + 1);
          }
          if (invType === '發票' && !invNumber) {
            missingCredentialRows.push(`${index + 1}（發票號碼未填）`);
          }

          calculatedTotal += amt;

          detailLines.push({
            description,
            item_category: category,
            item_category_note: categoryNote,
            account_code: accountSelect ? (accountSelect.value || null) : null,
            amount: amt,
            payee_identifier: payeeIdentifier || null,
            payee_name: payeeName || null,
            is_proxy_payment: proxyCheck?.checked || false,
            proxy_payer_identifier: proxyCheck?.checked ? (proxyIdInput?.value.trim() || null) : null,
            proxy_payer_name: proxyCheck?.checked ? (proxyPayerName || null) : null
          });

          if (invType !== '無') {
            const taxInfo = calcInvoiceTax(invType, amt);
            invoiceLines.push({
              invoice_type: invType,
              invoice_number: invNumber || null,
              amount: amt,
              tax_amount: taxInfo.taxAmount
            });
          }
        });

        if (detailLines.length === 0) {
          throw new Error('請至少填寫一筆有效的摘要與金額！');
        }
        if (missingCredentialRows.length > 0) {
          throw new Error(`第 ${missingCredentialRows.join('、')} 列缺少憑證。每筆有效明細都必須選擇憑證類型或上傳附件。`);
        }
        if (missingPayeeRows.length > 0) {
          throw new Error(`第 ${missingPayeeRows.join('、')} 列尚未選擇有效付款人。請先查詢或新增付款人。`);
        }
        if (selectedPayeeIdentifiers.size > 1) {
          throw new Error('同一張報支單只能指定一位付款人；不同付款人請分開送出報支單。');
        }

        const attachmentsMap = typeof voucherLineAttachments !== 'undefined' ? voucherLineAttachments : {};

        const voucherPayload = {
          txDate: txDate,
          projectId: projectId && projectId !== 'all' ? projectId : null,
          departmentBudgetId: projectId && projectId !== 'all' ? null : departmentBudgetId,
          applicantId: state.currentUser?.id,
          departmentId: departmentId,
          currentManagerId: managerId,
          category: '營業',
          summary: generalSummary,
          totalAmount: calculatedTotal,
          status: 'pending_review',
          detailLines: detailLines,
          invoiceLines: invoiceLines,
          attachmentsMap: attachmentsMap,
          rows: rows,
          tripStartDate: tripStart,
          tripEndDate: tripEnd
        };

        const result = await createVoucher(voucherPayload);

        if (!result || !result.success) {
          throw new Error(result?.error || '建立報支單失敗');
        }

        alert(`✅ 送出成功！總計金額：$${calculatedTotal.toLocaleString()}`);

        excelVoucherForm.reset();

        if (typeof renderVoucherLines === 'function') {
          renderVoucherLines();
        } else {
          const tbody = document.getElementById('excelLinesBody');
          if (tbody) tbody.innerHTML = '';
          for(let i = 0; i < 3; i++) {
            if (typeof window.addExcelRow === 'function') window.addExcelRow();
          }
        }

        await reloadAppData();
        renderDashboard();
        if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();

      } catch (err) {
        console.error(err);
        alert('送出報支單失敗：' + err.message);
      }
      });
    });
  }

  safeListener('projectForm', 'submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.submitter || e.target.querySelector('button[type="submit"]');
    await withActionLock('project:create', submitBtn, async () => {
    if (!isFinanceOperator()) {
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

      const { data: newProject, error: projError } = await supabase
        .from('projects')
        .insert({
          name: name,
          start_date: document.getElementById('projectStart').value || null,
          end_date: document.getElementById('projectEnd').value || null,
          department_id: document.getElementById('projectDepartment').value || null,
          default_bank_account_id: isFinanceOperator() ? (document.getElementById('projectDefaultBankAccount')?.value || null) : null,
          total_budget: totalBudget,
          remaining_budget: totalBudget,        })
        .select()
        .single();

      if (projError) throw projError;

      if (totalBudget > 0) {
        const budgetItems = [
          { project_id: newProject.id, category: '人事費用', amount: Math.round(totalBudget * 0.4) },
          { project_id: newProject.id, category: '營運費用', amount: Math.round(totalBudget * 0.35) },
          { project_id: newProject.id, category: '資本門', amount: Math.round(totalBudget * 0.2) },
          { project_id: newProject.id, category: '其他', amount: Math.round(totalBudget * 0.05) }
        ];

        const itemsWithCompany = budgetItems.map(b => ({ ...b,  }));
        const { error: itemsError } = await supabase
          .from('project_budget_items')
          .insert(itemsWithCompany);

        if (itemsError) console.warn('預算分類建立失敗，但專案已成功:', itemsError);
      }

      showMessage('專案已建立，並已設定預算分類！');
      e.target.reset();

      if (selectedTeamMembers.length > 0 && newProject?.id) {
        await saveProjectMembersApi(
          newProject.id,
          selectedTeamMembers.map(member => ({ user_id: member.id, role: 'member' })),
          state.currentUser?.id || null
        );
      }
      selectedTeamMembers = [];
      renderTeamMemberList();
      
      renderProjectList();
      loadAndRenderProjects();
      renderDashboard();
      
    } catch (err) {
      showMessage('建立專案失敗：' + err.message, true);
    }
    });
  });

  safeListener('departmentForm', 'submit', async (e) => {
    e.preventDefault();
    if (state.currentUser?.role !== 'admin') {
      showMessage('僅 Admin 可新增部門', true);
      return;
    }
    try {
      const name = document.getElementById('newDepartmentName').value.trim();
      const parentDepartmentId = document.getElementById('newDepartmentParent')?.value || null;
      const { error } = await supabase.from('departments').insert({
        name,
        parent_department_id: parentDepartmentId
      });
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

  setupTransactionForm();
}

let voucherLines = [];

async function initialize() {
    loadState(state);
    if (!eventsInitialized) {
        initializeEvents();
    }

    const user = await getCurrentSessionUser();
    if(user){
        state.currentUser=user;
        if(user.mustChangePassword){
            showForcePasswordView();
        }else{
            await showApp();
        }
    }
}

async function populateVoucherFormOptions() {
  try {
    const [accounts, banks, departments] = await Promise.all([
      fetchAccounts(), fetchBankAccounts(), fetchDepartments()
    ]);

    window.__cachedAccounts = accounts;
    window.__cachedPayees = [];
    if (isFinanceOperator()) {
      const { data: payees, error: payeesError } = await supabase
        .from('payees')
        .select('id, identifier, name')
        .eq('is_active', true)
        .order('name');
      if (payeesError) throw payeesError;
      window.__cachedPayees = payees || [];
    }

    // 控制會計專用區塊顯示
    const role = state.currentUser?.role;
    const acctGroup = document.getElementById('accountingFieldsGroup');
    if (acctGroup) {
        acctGroup.style.display = ['accounting', 'admin', 'super_admin'].includes(role) ? 'flex' : 'none';
    }

    // 初始進入此頁面時，預設給 5 個空列
    const tbody = document.getElementById('excelLinesBody');
    if (tbody && tbody.children.length === 0) {
        for(let i=0; i<5; i++) window.addExcelRow();
    }

    // 會計科目
    const accountSelect = document.getElementById('vAccountCode');
    if (accountSelect) {
      accountSelect.innerHTML = accounts.length
        ? '<option value="">請選擇會計科目...</option>' + accounts.map(a =>
            `<option value="${escapeHtml(a.code)}">${escapeHtml(a.code)} ${escapeHtml(a.name)}</option>`
          ).join('')
        : '<option value="">沒有可用的會計科目</option>';
      accountSelect.disabled = accounts.length === 0;
    }

    // 銀行帳戶
    const bankSelect = document.getElementById('vBankAccount');
    if (bankSelect) {
      bankSelect.innerHTML = '<option value="">（現金支付免選）</option>' + 
        banks.map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('');
    }
    
    await populateManagerPickerGrouped();
    // 部門 - 避免重複宣告
    const deptSelect = document.getElementById('vDepartment');
    if (deptSelect) {
      if (state.currentUser?.role === 'employee') {
        // 員工只能看到自己的部門
        deptSelect.innerHTML = `<option value="${state.currentUser.department_id || ''}">${state.currentUser.department_name || '我的部門'}</option>`;
        deptSelect.disabled = true;
      } else {
        deptSelect.innerHTML = departments.length
          ? departments.map(d => `<option value="${d.id}">${d.display_name || d.name}</option>`).join('')
          : '<option value="">尚未建立部門</option>';
      }
      // 部門選好之後，主動載入該部門的人，不用等使用者手動觸發
      await loadDepartmentPeople(deptSelect.value);
      await loadDepartmentBudgetsForVoucher(deptSelect.value);
    }

    const projectSelect = document.getElementById('vProject');
    if (projectSelect) {
      const projects = await fetchProjects();
      projectSelect.innerHTML = '<option value="">無專案</option>' + 
        projects.map(p => `<option value="${p.id}">${p.project_code} - ${p.name}</option>`).join('');
      syncVoucherBudgetRequirement();
    }

    async function populateManagerPickerGrouped() {
      const managerSelect = document.getElementById('vManagerPicker');
      if (!managerSelect) return;

      const { data: managers, error } = await supabase
        .from('profiles')
        .select('id, full_name, department_id, departments(name)')
        .eq('role', 'manager');

      if (error || !managers) {
        managerSelect.innerHTML = '<option value="">不指定</option>';
        return;
      }

      const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
      const grouped = {};
      managers.forEach(m => {
        const deptName = m.departments?.name || '未分配部門';
        if (!grouped[deptName]) grouped[deptName] = [];
        grouped[deptName].push(m);
      });

      let html = '<option value="">不指定（整個部門主管都能審）</option>';
      Object.keys(grouped).sort(strokeSort.compare).forEach(deptName => {
        const people = grouped[deptName].sort((a, b) => strokeSort.compare(a.full_name, b.full_name));
        html += `<optgroup label="${deptName}">`;
        html += people.map(m => `<option value="${m.id}">${m.full_name}</option>`).join('');
        html += `</optgroup>`;
      });

      managerSelect.innerHTML = html;
    }

    // 部門下拉一改變，還是可以重新整理一次（保留原本互動）
    async function loadDepartmentPeople(deptId) {
      const managerSelect = document.getElementById('vManagerPicker');
      if (!managerSelect) return;

      if (!deptId) {
        managerSelect.innerHTML = '<option value="">請先選擇部門</option>';
        return;
      }

      const { data: people, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('department_id', deptId);

      if (error || !people || people.length === 0) {
        managerSelect.innerHTML = '<option value="">此部門尚無人員資料</option>';
        return;
      }

      const strokeSort = new Intl.Collator('zh-Hant-u-co-stroke');
      const sorted = [...people].sort((a, b) => strokeSort.compare(a.full_name || '', b.full_name || ''));

      const ROLE_LABEL = { manager: '主管', accounting: '會計', admin: '管理員', employee: '專員' };
      managerSelect.innerHTML = '<option value="">不指定（整個部門主管都能審）</option>' +
        sorted.map(p => `<option value="${p.id}">${p.full_name}${p.role === 'manager' ? '（主管）' : ` (${ROLE_LABEL[p.role] || p.role})`}</option>`).join('');
    }

    document.getElementById('vDepartment')?.addEventListener('change', (e) => {
      loadDepartmentPeople(e.target.value);
      loadDepartmentBudgetsForVoucher(e.target.value);
      syncVoucherBudgetRequirement();
    });
    document.getElementById('vProject')?.addEventListener('change', syncVoucherBudgetRequirement);

  } catch (error) {
    console.error(error);
    showMessage(`載入表單選項失敗：${error.message}`, true);
  }
}

async function loadDepartmentBudgetsForVoucher(departmentId) {
  const budgetSelect = document.getElementById('vDepartmentBudget');
  if (!budgetSelect) return;
  if (!departmentId) {
    budgetSelect.innerHTML = '<option value="">請先選擇部門</option>';
    return;
  }
  try {
    const { data, error } = await supabase
      .from('department_budgets')
      .select('id, fiscal_year, amount, remaining_amount')
      .eq('department_id', departmentId)
      .order('fiscal_year', { ascending: false });
    if (error) throw error;
    budgetSelect.innerHTML = '<option value="">請選擇部門年度預算</option>' + (data || [])
      .map(item => `<option value="${item.id}">${item.fiscal_year} 年｜剩餘 NT$ ${Number(item.remaining_amount || 0).toLocaleString()} / NT$ ${Number(item.amount || 0).toLocaleString()}</option>`)
      .join('');
  } catch (error) {
    console.error('載入部門預算失敗:', error);
    budgetSelect.innerHTML = '<option value="">部門預算載入失敗</option>';
  }
}

function syncVoucherBudgetRequirement() {
  const projectSelect = document.getElementById('vProject');
  const budgetSelect = document.getElementById('vDepartmentBudget');
  if (!projectSelect || !budgetSelect) return;
  const projectSelected = !!projectSelect.value;
  budgetSelect.disabled = projectSelected;
  if (projectSelected) budgetSelect.value = '';
}

function renderVoucherCard(v) {
  const role = state.currentUser?.role;
  const isMine = v.applicant_id === state.currentUser?.id;
  let actions = '';

  if (isMine && ['pending_review', 'manager_rejected', 'accounting_rejected'].includes(v.status)) {
    actions += `<span class="muted" style="font-size:12px;">可修改後重送（下一階段補上編輯介面）</span>`;
  }
  if (['manager', 'admin'].includes(role) && v.status === 'pending_review') {
    actions += `<button class="primary-btn" onclick="viewVoucherDetail('${v.id}')">查看並審核</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="manager">退件</button>`;
  }
  if (['accounting', 'admin', 'super_admin'].includes(role) && v.status === 'pending_accounting') {
    actions += `<button class="primary-btn approve-voucher-btn" data-id="${v.id}" data-stage="accounting">核准入帳</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="accounting">退件</button>`;
  }

  const statusBadge = getStatusBadge(v.status);
  const stepperDots = buildMiniStepperDots(v.status);

  return `
    <div class="voucher-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #f1f5f9;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:14px; color:#0f172a;">${v.request_voucher_no || v.voucher_no || '（產生中）'}</strong>
          ${statusBadge}
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          ${stepperDots}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; font-size:13px; color:#475569;">
        <div>
          <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">日期</span>
          <span style="font-weight:600; color:#1e293b;">${v.tx_date || '-'}</span>
        </div>
        <div>
          <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">會計憑證</span>
          <span style="font-weight:600; color:#1e293b;">${v.accounting_voucher_no || '尚未入帳'}</span>
        </div>
        <div>
          <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">付款憑證</span>
          <span style="font-weight:600; color:#1e293b;">${v.voucher_payments?.[0]?.payment_no || '尚未付款'}</span>
        </div>
        <div>
          <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">摘要</span>
          <span style="font-weight:600; color:#1e293b;">${v.summary || '-'}</span>
        </div>
        <div>
          <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">金額</span>
          <span style="font-weight:700; color:#0f172a; font-size:15px;">$${Number(v.total_amount || 0).toLocaleString()}</span>
        </div>
        <div>
          <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">筆數</span>
          <span style="font-weight:600; color:#1e293b;">${v.voucher_lines?.length || 0} 筆明細</span>
        </div>
      </div>
      <div class="button-row" style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        ${actions}
        ${actions.includes('view-history-btn') ? '' : `<button class="secondary view-history-btn" data-id="${v.id}" style="font-size:12px; padding:6px 12px;">查看審批歷程</button>`}
      </div>
      <div class="voucher-history" id="history-${v.id}" style="display:none; margin-top:10px;"></div>
    </div>`;
}

// 簽核中心列表用的迷你進度點（不佔太多欄寬）

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
          actionButtons = `<button class="btn-small secondary" onclick="openResubmitModal('${row.id}')">修改並重送</button>`;
        }
      }
      else if (currentUserRole === 'manager') {
        if (vStatus === 'pending_review') {
          actionButtons = `
            <button type="button" class="approve-voucher-btn" data-id="${row.id}" data-stage="manager">核准</button>
            <button type="button" class="reject-voucher-btn" data-id="${row.id}" data-stage="manager">退件</button>
          `;
        }
      }
      else if (['accounting', 'admin', 'super_admin'].includes(currentUserRole)) {
        if (vStatus === 'pending_accounting') {
          actionButtons = `
            <button class="btn-small success" onclick="openAccountingReviewModal('${row.id}')">
              詳細審核 & 歸帳
            </button>
            <button class="btn-small warning reject-voucher-btn" data-id="${row.id}" data-stage="accounting">退件</button>
          `;
        } else if (vStatus === 'approved') {
          actionButtons = `
            <button class="btn-small success close-voucher-btn" data-id="${row.id}" onclick="openPaymentQueue('${row.id}')">
              前往付款清單
            </button>
          `;
        } else if (vStatus === 'closed') {
          actionButtons = `
            <button type="button" class="btn-small danger" onclick="openVoidVoucherModal('${row.id}')">
              銷案
            </button>
          `;
        }
      }

      const statusBadge = getStatusBadge(vStatus);
      const stepperDots = buildMiniStepperDots(vStatus);

      return `
        <div class="voucher-workflow-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.06);">
          <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #f1f5f9;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <a href="javascript:void(0)" onclick="viewVoucherDetail('${row.id}')" style="color:#2563eb; font-weight:700; font-size:14px; text-decoration:none;">${row.voucher_no || '未編號'}</a>
              ${statusBadge}
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              ${stepperDots}
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:13px; color:#475569; margin-bottom:12px;">
            <div>
              <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">摘要</span>
              <span style="font-weight:600; color:#1e293b;">${row.summary || '-'}</span>
            </div>
            <div>
              <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">金額</span>
              <span style="font-weight:700; color:#0f172a; font-size:15px;">$${Number(row.total_amount || 0).toLocaleString()}</span>
            </div>
            <div>
              <span class="muted" style="font-size:11px; display:block; margin-bottom:2px;">明細筆數</span>
              <span style="font-weight:600; color:#1e293b;">${row.voucher_lines?.length || 0} 筆</span>
            </div>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            ${actionButtons}
            <button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = htmlContent;

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
    select.innerHTML = depts.map(d => `<option value="${d.id}">${d.display_name || d.name}</option>`).join('');
  } catch (e) {
    console.error(e);
  }
}

async function populateProjectDefaultBankSelect() {
  const row = document.getElementById('projectDefaultBankRow');
  const select = document.getElementById('projectDefaultBankAccount');
  if (!row || !select) return;
  const visible = isFinanceOperator();
  row.hidden = !visible;
  if (!visible) return;
  try {
    const banks = await fetchBankAccounts();
    select.innerHTML = '<option value="">不指定，付款時再選</option>' + (banks || [])
      .map(bank => `<option value="${bank.id}">${escapeHtml(bank.nickname || bank.bank_name)} (${escapeHtml(bank.account_number || '')})</option>`)
      .join('');
  } catch (error) {
    console.error('載入專案預設銀行失敗:', error);
    select.innerHTML = '<option value="">銀行帳戶載入失敗</option>';
  }
}

async function populateDepartmentBudgetFormOptions() {
  const panel = document.getElementById('departmentBudgetPanel');
  const canUseBudgetPanel = ['admin', 'accounting', 'manager'].includes(state.currentUser?.role);
  if (panel) panel.hidden = !canUseBudgetPanel;
  if (!canUseBudgetPanel) return;
  const select = document.getElementById('departmentBudgetDepartment');
  if (!select) return;
  try {
    const depts = await fetchDepartments();
    const visibleDepts = isFinanceOperator()
      ? depts
      : depts.filter(d => d.id === state.currentUser?.department_id);
    select.innerHTML = visibleDepts.map(d => `<option value="${d.id}">${escapeHtml(d.display_name || d.name)}</option>`).join('');
    const yearInput = document.getElementById('departmentBudgetYear');
    if (yearInput && !yearInput.value) yearInput.value = new Date().getFullYear();
  } catch (error) {
    console.error('載入部門預算表單失敗:', error);
  }
}

async function renderDepartmentBudgetList() {
  const container = document.getElementById('departmentBudgetList');
  if (!container) return;
  try {
    const [{ data, error }, { data: users, error: usersError }] = await Promise.all([
      supabase
        .from('department_budgets')
        .select('id, department_id, fiscal_year, amount, remaining_amount, note, department:departments(name)')
        .order('fiscal_year', { ascending: false }),
      supabase.from('profiles').select('id, department_id')
    ]);
    if (error) throw error;
    if (usersError) throw usersError;
    const memberCounts = (users || []).reduce((acc, user) => {
      if (user.department_id) acc[user.department_id] = (acc[user.department_id] || 0) + 1;
      return acc;
    }, {});
    const visibleRows = isFinanceOperator()
      ? (data || [])
      : (data || []).filter(row => row.department_id === state.currentUser?.department_id);
    container.innerHTML = visibleRows.length ? `
      <table>
        <thead><tr><th>年度</th><th>部門</th><th>成員</th><th>期初編列</th><th>實際使用</th><th>剩餘</th></tr></thead>
        <tbody>${visibleRows.map(row => `
          <tr>
            <td>${row.fiscal_year}</td>
            <td>${escapeHtml(row.department?.name || '-')}</td>
            <td>${memberCounts[row.department_id] || 0} 人</td>
            <td>NT$ ${Number(row.amount || 0).toLocaleString()}</td>
            <td>NT$ ${Math.max(0, Number(row.amount || 0) - Number(row.remaining_amount || 0)).toLocaleString()}</td>
            <td>NT$ ${Number(row.remaining_amount || 0).toLocaleString()}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="muted">尚未建立部門年度預算。</p>';
    window.__departmentBudgetsCache = visibleRows;
  } catch (error) {
    console.error('載入部門預算清單失敗:', error);
    container.innerHTML = `<p class="message error">載入部門預算失敗：${escapeHtml(error.message)}</p>`;
  }
}

async function renderDepartmentBudgetRequestList() {
  const container = document.getElementById('departmentBudgetRequestList');
  if (!container) return;
  try {
    const { data, error } = await supabase
      .from('department_budget_requests')
      .select('id, department_id, fiscal_year, requested_amount, reason, item_details, status, review_note, created_at, department:departments(name), requester:profiles!requested_by(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const visibleRows = isFinanceOperator()
      ? (data || [])
      : (data || []).filter(row => row.department_id === state.currentUser?.department_id);
    container.innerHTML = visibleRows.length ? `
      <table>
        <thead><tr><th>申請時間</th><th>部門</th><th>年度</th><th>申請金額</th><th>申請人</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${visibleRows.map(row => `
          <tr>
            <td>${escapeHtml((row.created_at || '').slice(0, 10))}</td>
            <td>${escapeHtml(row.department?.name || '-')}<br><span class="muted">${escapeHtml(row.reason || '')}</span><br><span class="muted">${(row.item_details || []).map(item => `${escapeHtml(item.name)}：NT$ ${Number(item.amount || 0).toLocaleString()}`).join('｜')}</span></td>
            <td>${row.fiscal_year}</td>
            <td>NT$ ${Number(row.requested_amount || 0).toLocaleString()}</td>
            <td>${escapeHtml(row.requester?.full_name || row.requester?.email || '-')}</td>
            <td><span class="badge ${row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'}">${row.status === 'approved' ? '已核准' : row.status === 'rejected' ? '已退件' : '待審核'}</span></td>
            <td>${row.status === 'pending' && isFinanceOperator()
              ? `<button type="button" class="primary-btn" onclick="approveDepartmentBudgetRequest('${row.id}')">核准</button>
                 <button type="button" class="danger" onclick="rejectDepartmentBudgetRequest('${row.id}')">退件</button>`
              : `<span class="muted">${escapeHtml(row.review_note || '')}</span>`}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="muted">目前沒有預算申請。</p>';
  } catch (error) {
    console.error('載入部門預算申請失敗:', error);
    container.innerHTML = `<p class="message error">載入預算申請失敗：${escapeHtml(error.message)}</p>`;
  }
}

window.approveDepartmentBudgetRequest = async (id) => {
  const note = prompt('核准備註（可留空）：') || null;
  const { error } = await supabase.rpc('approve_department_budget_request', {
    p_request_id: id,
    p_review_note: note
  });
  if (error) return showMessage('核准預算申請失敗：' + error.message, true);
  await Promise.all([renderDepartmentBudgetRequestList(), renderDepartmentBudgetList()]);
  showMessage('預算申請已核准，期初編列已更新。');
};

window.rejectDepartmentBudgetRequest = async (id) => {
  const note = prompt('請輸入退件原因：');
  if (!note || !note.trim()) return;
  const { error } = await supabase
    .from('department_budget_requests')
    .update({
      status: 'rejected',
      review_note: note.trim(),
      reviewed_by: state.currentUser?.id || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return showMessage('退件失敗：' + error.message, true);
  await renderDepartmentBudgetRequestList();
  showMessage('預算申請已退件。');
};

window.addDepartmentBudgetItemRow = () => {
  const container = document.getElementById('departmentBudgetItems');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'department-budget-item-row';
  row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
  row.innerHTML = `
    <input class="department-budget-item-name" placeholder="項目" style="flex:1;">
    <input class="department-budget-item-amount" type="number" min="0" placeholder="金額" style="width:120px;">
    <button type="button" class="danger" style="width:auto; padding:6px 10px;" onclick="this.closest('.department-budget-item-row').remove()">刪除</button>
  `;
  container.appendChild(row);
};

function collectDepartmentBudgetItems() {
  return Array.from(document.querySelectorAll('.department-budget-item-row'))
    .map(row => ({
      name: row.querySelector('.department-budget-item-name')?.value.trim() || '',
      amount: Number(row.querySelector('.department-budget-item-amount')?.value || 0)
    }))
    .filter(item => item.name && item.amount > 0);
}

async function fetchProjectMemberRows() {
  const { data, error } = await supabase.from('project_members').select('project_id');
  if (error) {
    console.warn('載入專案成員數失敗:', error.message);
    return [];
  }
  return data || [];
}

// 1. 渲染專案列表（包含可修改名稱、預算即時連動剩餘金額）
async function renderProjectList() {
  const container = document.getElementById('projectList');
  if (!container) return;

  try {
    const [projects, depts, banks, memberRowsResult] = await Promise.all([
      fetchProjects(),
      fetchDepartments(),
      fetchBankAccounts().catch(() => []),
      fetchProjectMemberRows()
    ]);
    const deptOptions = depts.map(d => `<option value="${d.id}">${d.display_name || d.name}</option>`).join('');
    const bankOptions = (banks || []).map(bank => `<option value="${bank.id}">${escapeHtml(bank.nickname || bank.bank_name)} (${escapeHtml(bank.account_number || '')})</option>`).join('');
    const showBankControls = isFinanceOperator();
    const memberCounts = (memberRowsResult || []).reduce((acc, row) => {
      if (row.project_id) acc[row.project_id] = (acc[row.project_id] || 0) + 1;
      return acc;
    }, {});

    container.innerHTML = projects.map(p => {
      const totalBudget = Number(p.total_budget || 0);
      const remainingBudget = Number(p.remaining_budget || 0);
      
      // 計算該專案已使用的金額 (已用 = 總預算 - 剩餘)
      const usedBudget = totalBudget - remainingBudget;
      const usedPercent = totalBudget > 0 ? Math.round((usedBudget / totalBudget) * 100) : 0;
      const barClass = usedPercent >= 100 ? 'over' : (usedPercent >= 70 ? 'warn' : '');
      const percentColor = usedPercent >= 100 ? '#b91c1c' : (usedPercent >= 70 ? '#b45309' : '#15803d');

      return `
        <div class="report-card" style="margin:8px 0; padding:14px 16px;" id="project-card-${p.id}">
          <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:6px;">
            <div>
              <strong style="color:#64748b; font-size:12px;">${p.project_code || '無編號'}</strong>
              <input type="text" id="edit-name-${p.id}" value="${p.name || ''}" placeholder="專案名稱" style="width: 180px; padding: 2px 6px; margin-left:6px; font-weight:600;">
            </div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              <span class="badge wait">成員 ${memberCounts[p.id] || 0} 人</span>
              <span class="badge ${usedPercent >= 100 ? 'danger' : (usedPercent >= 70 ? 'warning' : 'success')}">已用 ${usedPercent}%</span>
            </div>
          </div>

          <div class="progress-track"><div class="progress-fill ${barClass}" style="width:${Math.min(usedPercent, 100)}%;"></div></div>
          <div class="progress-label">
            <span>已用 <strong style="color:${percentColor};">$${usedBudget.toLocaleString()}</strong></span>
            <span>剩餘 <strong id="remaining-display-${p.id}">$${remainingBudget.toLocaleString()}</strong> / 總預算 $${totalBudget.toLocaleString()}</span>
          </div>

          <div style="margin: 10px 0 6px; display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:13px;">
            <label style="display:flex; align-items:center; gap:6px; margin:0;">預算
              <input type="number" id="edit-budget-${p.id}" value="${totalBudget}" style="width:110px;" oninput="calcRemainingPreview('${p.id}', ${usedBudget})">
            </label>
            <label style="display:flex; align-items:center; gap:6px; margin:0;">部門
              <select id="edit-dept-${p.id}">
                <option value="">無部門</option>
                ${deptOptions}
              </select>
            </label>
            ${showBankControls ? `<label style="display:flex; align-items:center; gap:6px; margin:0;">預設出款銀行
              <select id="edit-bank-${p.id}">
                <option value="">付款時再選</option>
                ${bankOptions}
              </select>
            </label>` : ''}
          </div>

          <div style="margin-top: 8px;">
              <button onclick="updateProject('${p.id}')" class="primary-btn" style="width:auto; padding:8px 16px;">儲存修改</button>
              <button onclick="openProjectMembersModal('${p.id}', '${(p.name || '').replace(/'/g, "\\'")}')" class="secondary" style="width:auto; padding:8px 16px;">👥 編輯成員</button>
              <button onclick="deleteProject('${p.id}')" class="danger" style="width:auto; padding:8px 16px;">刪除</button>
          </div>
        </div>
      `;
    }).join('');

    // 將各專案原本的部門選上
    projects.forEach(p => {
      const select = document.getElementById(`edit-dept-${p.id}`);
      if (select && p.department_id) select.value = p.department_id;
      const bankSelect = document.getElementById(`edit-bank-${p.id}`);
      if (bankSelect && p.default_bank_account_id) bankSelect.value = p.default_bank_account_id;
    });
  } catch (e) {
    console.error('載入專案失敗:', e);
    container.innerHTML = '<p class="muted">載入專案失敗</p>';
  }
}

// === 專案成員管理 ===
let pmPendingMembers = []; // [{ user_id, full_name, role }]

window.openProjectMembersModal = async (projectId, projectName) => {
  document.getElementById('pmProjectId').value = projectId;
  document.getElementById('pmProjectName').textContent = projectName || '';
  document.getElementById('projectMembersModal').style.display = 'flex';

  try {
    const [users, members] = await Promise.all([fetchAllUsers(), fetchProjectMembers(projectId)]);

    pmPendingMembers = (members || []).map(m => ({
      user_id: m.user_id,
      full_name: m.user?.full_name || '（使用者已刪除）',
      department: '',
      role: m.role
    }));

    // 補上部門資訊（從 users 清單對照）
    pmPendingMembers.forEach(pm => {
      const u = users.find(u => u.id === pm.user_id);
      if (u) pm.department = u.department?.name || '';
    });

    const addSelect = document.getElementById('pmAddUserSelect');
    addSelect.innerHTML = users
      .filter(u => u.active !== false)
      .map(u => `<option value="${u.id}" data-name="${u.full_name || u.email}" data-dept="${u.department?.name || ''}">${u.full_name || u.email}${u.department?.name ? '（' + u.department.name + '）' : ''}</option>`)
      .join('');

    window.__pmUsersCache = users;
    renderPmMemberTable();
    renderPmAuditLog(projectId);
  } catch (err) {
    alert('載入專案成員失敗：' + err.message);
  }
};

window.closeProjectMembersModal = () => {
  document.getElementById('projectMembersModal').style.display = 'none';
  pmPendingMembers = [];
};

function renderPmMemberTable() {
  const tbody = document.getElementById('pmMemberTableBody');
  if (!tbody) return;
  if (pmPendingMembers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted" style="padding:8px;">尚無成員，請從上方新增。</td></tr>';
    return;
  }
  tbody.innerHTML = pmPendingMembers.map(m => `
    <tr>
      <td style="padding:6px;">${m.full_name}</td>
      <td style="padding:6px;">
        <select onchange="updatePendingMemberRole('${m.user_id}', this.value)">
          <option value="member" ${m.role === 'member' ? 'selected' : ''}>一般成員</option>
          <option value="owner" ${m.role === 'owner' ? 'selected' : ''}>專案負責人</option>
        </select>
      </td>
      <td style="padding:6px;">${m.department || '-'}</td>
      <td style="padding:6px; text-align:right;">
        <button type="button" class="danger" style="width:auto; padding:4px 10px; font-size:12px;" onclick="removePendingProjectMember('${m.user_id}')">移除</button>
      </td>
    </tr>
  `).join('');
}

window.addPendingProjectMember = () => {
  const select = document.getElementById('pmAddUserSelect');
  const roleSelect = document.getElementById('pmAddUserRole');
  const userId = select.value;
  if (!userId) return;
  if (pmPendingMembers.some(m => m.user_id === userId)) {
    showMessage('此使用者已在成員名單中。', true);
    return;
  }
  const opt = select.selectedOptions[0];
  pmPendingMembers.push({
    user_id: userId,
    full_name: opt.dataset.name,
    department: opt.dataset.dept,
    role: roleSelect.value
  });
  renderPmMemberTable();
};

window.removePendingProjectMember = (userId) => {
  pmPendingMembers = pmPendingMembers.filter(m => m.user_id !== userId);
  renderPmMemberTable();
};

window.updatePendingMemberRole = (userId, role) => {
  const m = pmPendingMembers.find(m => m.user_id === userId);
  if (m) m.role = role;
};

window.saveProjectMembers = async () => {
  const projectId = document.getElementById('pmProjectId').value;
  const btn = document.querySelector('#projectMembersModal button[onclick="saveProjectMembers()"]');
  await withActionLock(`project-members:save:${projectId}`, btn, async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const result = await saveProjectMembersApi(projectId, pmPendingMembers, user?.id || null);
      const [users, members] = await Promise.all([fetchAllUsers(), fetchProjectMembers(projectId)]);
      pmPendingMembers = (members || []).map(m => {
        const u = users.find(u => u.id === m.user_id);
        return {
          user_id: m.user_id,
          full_name: m.user?.full_name || u?.full_name || u?.email || '（使用者已刪除）',
          department: u?.department?.name || '',
          role: m.role || 'member'
        };
      });
      renderPmMemberTable();
      showMessage(`成員名單已更新（新增 ${result.added} 位、移除 ${result.removed} 位）。`);
      renderPmAuditLog(projectId);
      await loadAndRenderProjects();
    } catch (err) {
      console.error('儲存專案成員失敗:', err);
      alert(`儲存失敗：${err.code ? err.code + ' - ' : ''}${err.message}`);
    }
  });
};

async function renderPmAuditLog(projectId) {
  const tbody = document.getElementById('pmAuditLogTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" class="muted" style="padding:6px;">載入中...</td></tr>';
  try {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', 'project_members')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const filtered = (logs || []).filter(l =>
      l.old_data?.project_id === projectId || l.new_data?.project_id === projectId
    );

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted" style="padding:6px;">尚無異動紀錄。</td></tr>';
      return;
    }

    // audit_logs.user_id 沒有正式 FK 到 profiles，這裡改為分開查詢後再手動對應姓名
    const operatorIds = [...new Set(filtered.map(l => l.user_id).filter(Boolean))];
    let operatorNameById = {};
    if (operatorIds.length > 0) {
      const { data: operators } = await supabase.from('profiles').select('id, full_name').in('id', operatorIds);
      (operators || []).forEach(o => { operatorNameById[o.id] = o.full_name; });
    }

    const actionLabels = {
      project_member_add: '➕ 新增成員',
      project_member_remove: '➖ 移除成員',
      project_member_role_change: '🔄 變更角色'
    };

    tbody.innerHTML = filtered.map(l => {
      const time = new Date(l.created_at).toLocaleString('zh-TW');
      const operator = operatorNameById[l.user_id] || '系統';
      const label = actionLabels[l.action] || l.action;
      let detail = '';
      if (l.action === 'project_member_role_change') {
        detail = `${label}：${l.old_data?.role || ''} → ${l.new_data?.role || ''}`;
      } else {
        detail = label;
      }
      return `<tr><td style="padding:6px;">${time}</td><td style="padding:6px;">${operator}</td><td style="padding:6px;">${detail}</td></tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding:6px; color:#b91c1c;">載入失敗：${err.message}</td></tr>`;
  }
}

// 將函式掛載到 window 上，確保 HTML 內的 oninput 呼叫得到
window.calcRemainingPreview = function(id, usedBudget) {
  const budgetInput = document.getElementById(`edit-budget-${id}`);
  const remainingDisplay = document.getElementById(`remaining-display-${id}`);
  if (!budgetInput || !remainingDisplay) return;

  const newBudget = Number(budgetInput.value) || 0;
  // 新剩餘金額 = 新預算 - 已使用金額
  const newRemaining = newBudget - usedBudget;
  remainingDisplay.textContent = `$${newRemaining.toLocaleString()}`;
  remainingDisplay.style.color = newRemaining < 0 ? '#b91c1c' : '';
};

// 3. 儲存專案修改（更新 Name、Total Budget 與 Department）
async function updateProject(id) {
  const nameInput = document.getElementById(`edit-name-${id}`);
  const budgetInput = document.getElementById(`edit-budget-${id}`);
  const deptSelect = document.getElementById(`edit-dept-${id}`);

  if (!nameInput || !budgetInput || !deptSelect) return;

  const newName = nameInput.value.trim();
  const newBudget = Number(budgetInput.value) || 0;
  const newDeptId = deptSelect.value || null;

  if (!newName) {
    alert('專案名稱不能為空！');
    return;
  }

  try {
    // 呼叫 Supabase 更新資料庫（請確認資料庫 Table 欄位名稱是否為 name, total_budget, department_id）
    const { error } = await supabase
      .from('projects')
      .update({
        name: newName,
        total_budget: newBudget,
        department_id: newDeptId
      })
      .eq('id', id)
      ;

    if (error) throw error;

    alert('專案更新成功！');
    renderProjectList(); // 重新載入，同步資料庫最新計算狀態
  } catch (e) {
    console.error('更新專案失敗:', e);
    alert('更新失敗：' + (e.message || '請稍後再試'));
  }
}

window.updateProject = async (id) => {
  const newBudgetInput = document.getElementById(`edit-budget-${id}`);
  const newDeptInput = document.getElementById(`edit-dept-${id}`);
  const newBankInput = document.getElementById(`edit-bank-${id}`);
  const newBudget = Number(newBudgetInput.value);

  try {
    const { data: current, error: fetchErr } = await supabase
      .from('projects').select('total_budget, remaining_budget').eq('id', id).single();
    if (fetchErr) throw fetchErr;

    const oldBudget = Number(current.total_budget || 0);

    if (newBudget !== oldBudget) {
      const reason = prompt(`預算將從 ${oldBudget.toLocaleString()} 改為 ${newBudget.toLocaleString()}，請輸入變更原因：`);
      if (!reason || !reason.trim()) {
        alert('未輸入原因，已取消變更。');
        return;
      }

      const delta = newBudget - oldBudget;
      let newRemaining = Number(current.remaining_budget || 0) + delta;

      // 🛡️ 防呆機制：確保剩餘預算絕對不會超過新的總預算
      newRemaining = Math.min(newRemaining, newBudget);
      const { data: { user } } = await supabase.auth.getUser();

      await updateProjectBudget(id, oldBudget, newBudget, reason.trim(), user.id);
      const projectUpdates = {
        remaining_budget: newRemaining,
        department_id: newDeptInput.value || null
      };
      if (newBankInput) projectUpdates.default_bank_account_id = newBankInput.value || null;
      await supabase.from('projects').update(projectUpdates).eq('id', id);
    } else {
      const projectUpdates = { department_id: newDeptInput.value || null };
      if (newBankInput) projectUpdates.default_bank_account_id = newBankInput.value || null;
      await supabase.from('projects').update(projectUpdates).eq('id', id);
    }

    showMessage('專案已更新。');
    renderProjectList();
  } catch (error) {
    alert('更新失敗：' + error.message);
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
    const depts = await fetchDepartments();

    const parentSelect = document.getElementById('newDepartmentParent');
    if (parentSelect) {
      const roots = depts.filter(department => !department.parent_department_id);
      parentSelect.innerHTML = '<option value="">最上層部門</option>' + roots
        .map(department => `<option value="${department.id}">${department.name}</option>`)
        .join('');
    }

    if (!depts || depts.length === 0) {
      container.innerHTML = '<p class="muted">暫無部門資料</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-scroll department-list-table">
        <table>
          <thead>
            <tr><th>部門／組別</th><th style="width:120px;">層級</th><th style="width:160px;">操作</th></tr>
          </thead>
          <tbody>
            ${depts.map(d => `
              <tr>
                <td><span id="dept-display-name-${d.id}" class="department-name">${d.display_name || d.name}</span></td>
                <td><span class="badge ${d.parent_department_id ? 'info' : ''}">${d.parent_department_id ? '組別' : '部門'}</span></td>
                <td>
                  <button onclick="editDepartmentName('${d.id}')" class="secondary" style="width:auto; padding:6px 12px;">修改名稱</button>
                  <button onclick="deleteDepartment('${d.id}')" class="danger" style="width:auto; padding:6px 12px; margin-left:6px;">刪除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
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
  if (!isAdminUser(state.currentUser?.role)) {
    alert('僅 admin 或 super_admin 可刪除部門。');
    return;
  }

  const currentName = document.getElementById(`dept-display-name-${id}`)?.innerText || '此部門';
  const blockingChecks = [
    { table: 'departments', column: 'parent_department_id', label: '子部門/組別' },
    { table: 'profiles', column: 'department_id', label: '使用者' },
    { table: 'projects', column: 'department_id', label: '專案' },
    { table: 'department_budgets', column: 'department_id', label: '部門預算' },
    { table: 'department_budget_requests', column: 'department_id', label: '預算申請' },
    { table: 'vouchers', column: 'department_id', label: '報支/憑證' }
  ];

  try {
    const results = await Promise.all(blockingChecks.map(async check => {
      const { count, error } = await supabase
        .from(check.table)
        .select('id', { count: 'exact', head: true })
        .eq(check.column, id);
      if (error) throw error;
      return { ...check, count: count || 0 };
    }));

    const blockers = results.filter(result => result.count > 0);
    if (blockers.length) {
      alert(`無法刪除「${currentName}」，請先移轉或刪除關聯資料：\n${blockers.map(item => `${item.label} ${item.count} 筆`).join('\n')}`);
      return;
    }

    if (!confirm(`確定刪除「${currentName}」？此操作無法復原。`)) return;

    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) throw error;

    showMessage('部門已刪除。');
    await renderAdminDepartmentList();
    await populateInviteDepartmentSelect();
    await populateProjectDepartmentSelect();
    await populateDepartmentBudgetFormOptions();
  } catch (err) {
    alert('刪除失敗：' + err.message);
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

    // 管理員和會計可以看到全公司總覽
    if (['accounting', 'admin', 'super_admin'].includes(userRole)) {
      html += '<option value="all">全公司總覽</option>';
    }
    // employee / manager 不要加 all，或加「本部門」且 value 仍走部門過濾

    // 加入所有專案
    if (projects && projects.length > 0) {
      projects.forEach(p => {
        html += `<option value="${p.id}">${p.project_code || '無編號'} - ${p.name}</option>`;
      });
    } else {
      html += '<option value="">尚無專案</option>';
    }

    select.innerHTML = html;

    // 保留使用者之前的選擇
    const savedProjectId = state.currentProjectId;
    if (savedProjectId && Array.from(select.options).some(opt => opt.value === savedProjectId)) {
      select.value = savedProjectId;
    } else if (['accounting', 'admin', 'super_admin'].includes(userRole)) {
      select.value = 'all';
      state.currentProjectId = 'all';
    } else if (projects.length > 0) {
      select.value = projects[0].id;
      state.currentProjectId = projects[0].id;
    }

    // 只綁定一次 change 事件
    if (!select.dataset.listenerBound) {
      select.addEventListener('change', () => {
        state.currentProjectId = select.value;
        renderDashboard();
        if (userHasPermission('canViewJournalLedger') || userHasPermission('canViewFinancials')) {
          renderTransactionTable();
        }
        if (userHasPermission('canViewReports') || userHasPermission('canViewFinancials')) {
          renderReports();
        }
        if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
      });
      select.dataset.listenerBound = 'true';
    }

  } catch (e) {
    console.error('載入專案失敗:', e);
    const select = document.getElementById('globalProjectSelect');
    if (select) {
      select.innerHTML = '<option value="all">全公司總覽</option>';
    }
  }
}

async function fetchProjects() {
  const userRole = state.currentUser?.role;
  let query = supabase.from('projects').select('*').order('project_code');

  if (!['admin', 'super_admin', 'accounting'].includes(userRole)) {
    const { data: memberships, error: membershipError } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', state.currentUser?.id);
    if (membershipError) throw membershipError;

    const projectIds = [...new Set((memberships || []).map(item => item.project_id))];
    if (projectIds.length === 0) return [];
    query = query.in('id', projectIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadDepartments() {
  const { data } = await supabase.from('departments').select('*');
  return data;
}

const permissions = [
  ['canViewVouchers', '報支 / 憑證'],
  ['canApproveBills', '簽核單據'],
  ['canViewFinancials', '財務資料'],
  ['canViewJournalLedger', '日記帳 / 總帳'],
  ['canViewReports', '四大財報'],
  ['canViewBankAccounts', '銀行帳戶'],
  ['canReconcileBank', '銀行對帳'],
  ['canManageProjects', '專案管理'],
  ['canManageUsers', '帳號管理'],
  ['canManageSettings', '系統設定']
];

function renderPermissionCheckboxes() {
  const container = document.getElementById('permissionCheckboxes');
  if (!container) return;
  const defaults = getDefaultPermissions(document.getElementById('inviteRole')?.value || 'employee');
  container.innerHTML = permissions.map(([key, label]) => `
    <label class="permission-option"><input type="checkbox" value="${key}" ${defaults[key] ? 'checked' : ''}> ${label}</label>
  `).join('');
}

function getInvitePermissions() {
  const result = {};
  document.querySelectorAll('#permissionCheckboxes input[type="checkbox"]').forEach(input => {
    result[input.value] = input.checked;
  });
  return result;
}

// 🔥 統一合併版：點擊單號跳出 Modal 詳細表單視窗（含完整審核歷程）
window.viewVoucherDetail = async (voucherId) => {
  try {    const { data: vch, error: vError } = await supabase
      .from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .eq('id', voucherId)
      
      .single();
    
    if (vError || !vch) throw new Error('無法讀取報支明細資料');

    const { data: lines } = await supabase.from('voucher_lines').select('*').eq('voucher_id', voucherId);
    const { data: invoices } = await supabase.from('invoices').select('*').eq('voucher_id', voucherId);
    const attachments = await getAttachmentsByVoucherId(voucherId);
    
    // 取得該單據的審核與異動歷程 (Audit Logs)
    const { data: logs } = await supabase
      .from('voucher_workflow_logs')
      .select('*, profiles!actor_id(full_name)')
      .eq('voucher_id', voucherId)
      .order('created_at', { ascending: true });

    // 建立或取得覆蓋式動態 Modal 視窗
    let modal = document.getElementById('voucherDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voucherDetailModal';
      modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:9999;";
      document.body.appendChild(modal);
    }

    const linesHtml = (lines || []).map(l => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:6px;">${l.description || l.item_category || '-'}</td>
        <td style="padding:6px;">${l.account_code || '-'}</td>
        <td style="padding:6px; text-align:right;">$${Number(l.amount || 0).toLocaleString()}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="muted" style="padding:6px;">無明細項目</td></tr>';

    const invoicesHtml = (invoices || []).map(inv => `
      <div style="font-size:13px; color:#374151; margin-bottom:4px;">
        📄 類型：${inv.invoice_type} ｜ 號碼：${inv.invoice_number || '未填'} ｜ 金額：$${Number(inv.amount || 0).toLocaleString()}
      </div>
    `).join('') || '<div class="muted" style="font-size:13px;">無發票/收據資訊</div>';

    const logsHtml = (logs || []).length
      ? `<ul class="timeline">${logs.map(l => `
          <li class="${l.action?.includes('reject') ? 'rejected' : (l.action === 'close' ? 'closed' : '')}">
            <div class="tl-title">${l.profiles?.full_name || '系統'} 執行：${l.action}${l.to_status ? ` → ${STATUS_LABELS[l.to_status] || l.to_status}` : ''}</div>
            <div class="tl-meta">${new Date(l.created_at).toLocaleString('zh-TW')}</div>
             ${l.reject_reason ? `<div class="tl-note">${escapeHtml(l.reject_reason)}</div>` : ''}
          </li>
        `).join('')}</ul>`
      : '<p class="muted" style="font-size:13px;">尚無審批紀錄。</p>';

    // 勾稽核對（顯示用，第一筆明細已選科目時一併檢查科目有效性）
    const firstAccountCode = (lines || []).find(l => l.account_code)?.account_code || null;
    const verification = await runVoucherCrossVerification(voucherId, firstAccountCode);
    const verifyHtml = `
      <div class="verify-panel">
        ${verification.notes.map(n => `
          <div class="verify-item ${n.level}">
            <span class="icon">${n.level === 'error' ? '❌' : (n.level === 'warn' ? '⚠️' : '✓')}</span>
            <span>${n.text.replace(/^[❌⚠️✓]+\s*/, '')}</span>
          </div>
        `).join('')}
      </div>`;

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff; padding:24px; border-radius:8px; width:90%; max-width:700px; max-height:85vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #eee; padding-bottom:10px; margin-bottom:15px;">
          <h3 style="margin:0;">單據詳細內容 [${vch.voucher_no || '未編號'}]</h3>
          <button onclick="document.getElementById('voucherDetailModal').style.display='none'" style="font-size:24px; cursor:pointer; background:none; border:none;">&times;</button>
        </div>
        
        ${buildApprovalStepperHtml(vch.status)}

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:15px; font-size:14px; color:#4b5563;">
          <p style="margin:4px 0;"><strong>申請日期：</strong>${vch.tx_date || vch.created_at?.split('T')[0]}</p>
          <p style="margin:4px 0;"><strong>申請人：</strong>${vch.profiles?.full_name || '未知'}</p>
          <p style="margin:4px 0;"><strong>部門：</strong>${vch.departments?.name || '未分配'}</p>
          <p style="margin:4px 0;"><strong>狀態：</strong>${typeof getStatusBadge === 'function' ? getStatusBadge(vch.status) : (vch.status || '-')}</p>
          <p style="margin:4px 0; grid-column: span 2;"><strong>總摘要：</strong>${vch.summary || '-'}</p>
          <p style="margin:4px 0; grid-column: span 2;"><strong>總金額：</strong><span style="font-size:16px; font-weight:700; color:#059669;">$${Number(vch.total_amount || 0).toLocaleString()}</span></p>
        </div>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">明細項目</h4>
        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:15px;">
          <thead>
            <tr style="background:#f8f9fa; text-align:left;">
              <th style="padding:6px;">說明 / 類別</th>
              <th style="padding:6px;">會計科目</th>
              <th style="padding:6px; text-align:right;">金額</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">憑證 / 發票資訊</h4>
        <div style="margin-bottom:15px;">
          ${invoicesHtml}
        </div>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">憑證與勾稽核對</h4>
        <div style="margin-bottom:15px;">
          ${verifyHtml}
        </div>

        <h4 style="margin:16px 0 8px; font-size:15px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">審批歷程</h4>
        <div style="margin-bottom:15px; max-height:220px; overflow-y:auto; padding:8px 4px;">
          ${logsHtml}
        </div>

        <div style="text-align:right; margin-top:20px;">
          <button type="button" class="secondary" onclick="document.getElementById('voucherDetailModal').style.display='none'">關閉</button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    alert('載入單據詳細內容失敗：' + err.message);
  }
};

window.openVoidVoucherModal = async (voucherId) => {
  if (!isFinanceOperator()) {
    showMessage('僅會計部門或管理員可以銷案。', true);
    return;
  }

  try {
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('id, voucher_no, status, summary, total_amount')
      .eq('id', voucherId)
      .single();
    if (error) throw error;
    if (voucher.status !== 'closed') {
      throw new Error('只有已銷帳的單據可以銷案。');
    }

    document.getElementById('voidVoucherModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'voidVoucherModal';
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:10000; padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff; width:min(100%, 520px); padding:24px; border-radius:8px; box-shadow:0 12px 32px rgba(15,23,42,.24);">
        <h3 style="margin:0 0 8px;">銷案 ${escapeHtml(voucher.voucher_no || '')}</h3>
        <p style="margin:0 0 16px; color:#475569;">${escapeHtml(voucher.summary || '-')}｜$${Number(voucher.total_amount || 0).toLocaleString()}</p>
        <label for="voidVoucherReason">銷案原因 <span style="color:#b91c1c;">*</span></label>
        <textarea id="voidVoucherReason" maxlength="500" rows="5" style="width:100%; margin-top:6px;" placeholder="請說明銷案原因（3–500 字）"></textarea>
        <div id="voidVoucherReasonError" class="message error" style="display:none; margin-top:8px;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
          <button type="button" class="secondary" onclick="document.getElementById('voidVoucherModal')?.remove()">取消</button>
          <button type="button" id="confirmVoidVoucherBtn" class="danger" onclick="confirmVoidVoucher('${voucherId}')">確認銷案</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('voidVoucherReason')?.focus();
  } catch (error) {
    showMessage(`無法開啟銷案：${error.message}`, true);
  }
};

window.confirmVoidVoucher = async (voucherId) => {
  const reasonInput = document.getElementById('voidVoucherReason');
  const errorBox = document.getElementById('voidVoucherReasonError');
  const button = document.getElementById('confirmVoidVoucherBtn');
  const reason = reasonInput?.value.trim() || '';

  if (reason.length < 3 || reason.length > 500) {
    if (errorBox) {
      errorBox.textContent = '銷案原因必須為 3–500 字。';
      errorBox.style.display = 'block';
    }
    reasonInput?.focus();
    return;
  }

  await withActionLock(`voucher:void:${voucherId}`, button, async () => {
    const { error } = await supabase.rpc('void_closed_voucher', {
      p_voucher_id: voucherId,
      p_reason: reason
    });
    if (error) throw error;

    document.getElementById('voidVoucherModal')?.remove();
    document.getElementById('voucherDetailModal')?.remove();
    showMessage('單據已銷案，原因已寫入審批歷程。');
    await renderVoucherWorkflowList();
    await renderDashboard();
  }, { loadingText: '銷案中...' }).catch(error => {
    if (errorBox) {
      errorBox.textContent = `銷案失敗：${error.message}`;
      errorBox.style.display = 'block';
    }
  });
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
    else if (field === 'department_id') payload.department_id = value || null;
    else if (field === 'full_name') payload.full_name = value.trim();
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
    document.getElementById('bankLedgerAccountId').value = account.ledger_account_id || account.accounting_account_id || '';
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
      .eq('id', id)
      ;

    if (error) throw error;
    alert('銀行帳號更新成功！');
    document.getElementById('editBankModal').style.display = 'none';
    renderBankAccounts(); // 重新載入列表
  } catch (err) {
    alert(`更新失敗: ${err.message}`);
  }
};

function buildAccountCodeOptions(accounts, selectedCode = '') {
  return `<option value="">請選擇科目...</option>${(accounts || []).map(acc => `
    <option value="${escapeHtml(acc.code)}" ${acc.code === selectedCode ? 'selected' : ''}>${escapeHtml(acc.code)} ${escapeHtml(acc.name)}</option>
  `).join('')}`;
}

window.applyBulkReviewAccountCode = () => {
  const code = document.getElementById('bulkReviewAccountCode')?.value || '';
  if (!code) return;
  document.querySelectorAll('.review-line-account-code').forEach(select => {
    select.value = code;
  });
};

function collectReviewLineAccountCodes() {
  return Array.from(document.querySelectorAll('.review-line-account-code')).map(select => ({
    lineId: select.dataset.lineId,
    accountCode: select.value
  }));
}

async function ensureAccountingCanCloseVoucher(voucherId) {
  if (!isFinanceOperator()) {
    throw new Error('僅會計部門可以核准入帳與付款銷案');
  }

  const { data: invoices, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_type, invoice_number')
    .eq('voucher_id', voucherId)
    .order('id', { ascending: true });
  if (invoiceError) throw invoiceError;

  const attachments = await getAttachmentsByVoucherId(voucherId);
  const hasInvoice = (invoices || []).some(inv => inv.invoice_type && inv.invoice_type !== '無');
  const hasAttachment = (attachments || []).length > 0;

  if (!hasInvoice && !hasAttachment) {
    throw new Error('此單據沒有任何憑證，請退件要求申請人補齊後再核准或銷帳。');
  }

  return { invoices: invoices || [], attachments: attachments || [] };
}

window.accountingApproveAndClose = async (voucherId) => {
  const triggerBtn = document.querySelector(`button[onclick="accountingApproveAndClose('${voucherId}')"]`);
  if (triggerBtn) {
    if (triggerBtn.disabled) return;
    triggerBtn.disabled = true;
    triggerBtn.dataset.originalLabel = triggerBtn.textContent;
    triggerBtn.textContent = '處理中...';
  }

  const lineAssignments = collectReviewLineAccountCodes();
  const missingLineNumbers = lineAssignments
    .map((item, index) => item.accountCode ? null : index + 1)
    .filter(Boolean);
  const firstAccountCode = lineAssignments.find(item => item.accountCode)?.accountCode || '';
  const recipientId = document.getElementById('reviewPaymentRecipient')?.value || null;
  const note = document.getElementById('reviewNote')?.value.trim();

  if (missingLineNumbers.length) { alert(`第 ${missingLineNumbers.join('、')} 筆明細尚未選擇歸帳科目`); if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset.originalLabel; } return; }

  try {
    await ensureAccountingCanCloseVoucher(voucherId);

    // 勾稽核對：明細金額、發票金額、科目有效性
    const passedVerification = await confirmCrossVerification(voucherId, firstAccountCode);
    if (!passedVerification) { if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset.originalLabel; } return; }

    const validCodes = new Set((window.__cachedAccounts || []).map(item => item.code));
    const invalid = lineAssignments.find(item => !validCodes.has(item.accountCode));
    if (invalid) throw new Error(`找不到所選會計科目：${invalid.accountCode}`);

    await Promise.all(lineAssignments.map(async item => {
      const { error } = await supabase
        .from('voucher_lines')
        .update({ account_code: item.accountCode })
        .eq('id', item.lineId)
        .eq('voucher_id', voucherId);
      if (error) throw error;
    }));

    const { data: voucher, error: vErr } = await supabase.from('vouchers').select('*').eq('id', voucherId).single();
    if (vErr) throw vErr;
    const account = window.__cachedAccounts?.find(item => item.code === firstAccountCode);
    if (!account) throw new Error('找不到所選會計科目');

    const { error: assignmentError } = await supabase.from('vouchers').update({
      accounting_account_id: account.id,
      payment_recipient_id: recipientId,
      accounting_note: note || null,
      accounting_approved_at: new Date().toISOString(),
      accounting_approved_by: state.currentUser?.id
    }).eq('id', voucherId).eq('status', 'pending_accounting');
    if (assignmentError) throw assignmentError;

    await accountingApprove(voucher);

    document.querySelector('.modal-backdrop')?.remove();
    showMessage('會計已核准，單據已加入付款清單；付款前仍可修改科目、銀行與收款人。');
    renderVoucherWorkflowList();
    renderDashboard();
  } catch (err) {
    alert('會計核准失敗：' + err.message);
    if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset.originalLabel; }
  }
};

// 會計詳細審核 Modal
window.openAccountingReviewModal = async (voucherId) => {
  try {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*, voucher_lines(*), invoices(*), profiles!applicant_id(full_name), projects(name, project_code), departments(name)')
      .eq('id', voucherId)
      .single();

    if (!voucher) return alert('找不到單據');

    const [accounts, recipients] = await Promise.all([
      fetchAccounts(),
      fetchPaymentRecipients()
    ]);
    window.__cachedAccounts = accounts;
    const accountOptionsDisabled = accounts.length === 0;

    let html = `
        <div style="background:white; padding:25px; border-radius:12px; width:90%; max-width:700px; max-height:90vh; overflow:auto;">
          <h3>會計審核 - ${voucher.voucher_no}</h3>
          <p style="color:#666; font-size:14px;">
            申請人：${voucher.profiles?.full_name || '未知'}｜
            部門：${voucher.departments?.name || '-'}｜
            專案：${voucher.projects ? `${voucher.projects.project_code} ${voucher.projects.name}` : '無專案'}
          </p>
          <p><strong>摘要：</strong>${voucher.summary}</p>
          <p><strong>總金額：</strong>$${Number(voucher.total_amount).toLocaleString()}</p>
          
          <h4>明細項目</h4>
          <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
            <select id="bulkReviewAccountCode" style="flex:1; padding:8px;" ${accountOptionsDisabled ? 'disabled' : ''}>
              ${buildAccountCodeOptions(accounts)}
            </select>
            <button type="button" class="secondary" onclick="applyBulkReviewAccountCode()" ${accountOptionsDisabled ? 'disabled' : ''}>套用到全部明細</button>
          </div>
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th>摘要</th><th>付款人</th><th>金額</th><th>指定會計科目</th><th>AI</th></tr></thead>
            <tbody>
              ${voucher.voucher_lines.map((line, index) => `
                <tr>
                  <td>${escapeHtml(line.description || line.item_category || '-')}</td>
                  <td>${escapeHtml(line.payee_name || '-')}<br><span class="muted">${escapeHtml(line.payee_identifier || '')}</span></td>
                  <td>$${Number(line.amount).toLocaleString()}</td>
                  <td>
                    <select id="reviewLineAccount_${index}" class="review-line-account-code" data-line-id="${escapeHtml(line.id)}" style="width:100%; padding:6px;" ${accountOptionsDisabled ? 'disabled' : ''}>
                      ${buildAccountCodeOptions(accounts, line.account_code || '')}
                    </select>
                    <div id="aiSuggestExplain_reviewLineAccount_${index}" class="ai-suggest-box"></div>
                  </td>
                  <td><button type="button" class="secondary" onclick="suggestLineAccountCodeAI('${voucherId}', '${escapeHtml(line.id)}', 'reviewLineAccount_${index}')" ${accountOptionsDisabled ? 'disabled' : ''}>AI</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h4 style="margin-top:20px;">歸帳設定</h4>
          ${accountOptionsDisabled ? '<div class="message error" style="margin:8px 0;">會計科目為空，請確認 accounts 資料與 RLS SELECT policy。</div>' : ''}

          <label>收款人（可於付款前補充或變更）：</label>
          <select id="reviewPaymentRecipient" style="width:100%; padding:8px; margin:8px 0;">
            <option value="">尚未指定收款人</option>
            ${recipients.filter(item => item.active).map(item => `<option value="${item.id}">${escapeHtml(item.display_name)}｜${escapeHtml(item.bank_name)} ${escapeHtml(item.account_number)}</option>`).join('')}
          </select>
          <p class="muted">會計核准不代表已付款，也不會產生日記帳；付款銀行會在付款清單中指定。</p>

          <label>備註：</label>
          <textarea id="reviewNote" style="width:100%; height:80px; padding:8px;"></textarea>

          <div style="margin-top:20px; text-align:right;">
            <button onclick="accountingApproveAndClose('${voucherId}')" class="primary-btn" ${accountOptionsDisabled ? 'disabled' : ''}>核准並加入付款清單</button>
            <button onclick="this.closest('.modal-backdrop').remove()" style="margin-left:10px;">取消</button>
          </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center;';
    modal.innerHTML = html;
    document.body.appendChild(modal);

  } catch (err) {
    alert('載入明細失敗：' + err.message);
  }
};

/**
 * 呼叫 /api/classify，依單據內容取得 AI（或關鍵字規則）建議的會計科目，並自動帶入指定的下拉選單
 */
async function requestAccountSuggestion({ description, vendor, amount }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const res = await fetch('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
    body: JSON.stringify({ description, vendor, amount })
  });
  const result = await res.json();
  if (!res.ok || !result.ok) throw new Error(result.message || 'AI 建議失敗');
  return result;
}

window.suggestAccountCodeAI = async (voucherId, selectElementId) => {
  const select = document.getElementById(selectElementId);
  const explainBox = document.getElementById(`aiSuggestExplain_${selectElementId}`);
  if (!select) return;

  try {
    if (explainBox) explainBox.textContent = '分析中…';

    const { data: voucher } = await supabase
      .from('vouchers')
      .select('summary, total_amount, voucher_lines(description, item_category_note, payee_name)')
      .eq('id', voucherId)
      .single();
    if (!voucher) throw new Error('找不到單據資料');

    const description = voucher.voucher_lines?.map(l => l.description || l.item_category_note).filter(Boolean).join('；') || voucher.summary;
    const vendor = voucher.voucher_lines?.find(l => l.payee_name)?.payee_name || '';

    const result = await requestAccountSuggestion({ description, vendor, amount: voucher.total_amount });

    const { accountCode, explanation } = result.suggestion;
    if (accountCode) select.value = accountCode;
    if (explainBox) {
      explainBox.classList.add('pending-review');
      explainBox.textContent = `${result.mode === 'ai' ? '🤖 AI' : '📐 規則'}建議：${explanation || ''}（僅供參考，請覆核後再送出）`;
    }
  } catch (err) {
    if (explainBox) {
      explainBox.classList.remove('pending-review');
      explainBox.textContent = `AI 建議失敗：${err.message}`;
    }
  }
};

window.suggestLineAccountCodeAI = async (voucherId, lineId, selectElementId) => {
  const select = document.getElementById(selectElementId);
  const explainBox = document.getElementById(`aiSuggestExplain_${selectElementId}`);
  if (!select) return;

  try {
    if (explainBox) explainBox.textContent = '分析中…';

    const { data: line, error } = await supabase
      .from('voucher_lines')
      .select('description, item_category, item_category_note, payee_name, amount')
      .eq('voucher_id', voucherId)
      .eq('id', lineId)
      .single();
    if (error || !line) throw error || new Error('找不到明細資料');

    const description = [line.item_category, line.description, line.item_category_note].filter(Boolean).join('；');
    const result = await requestAccountSuggestion({ description, vendor: line.payee_name || '', amount: line.amount || 0 });
    const { accountCode, explanation } = result.suggestion;
    if (accountCode) select.value = accountCode;
    if (explainBox) {
      explainBox.classList.add('pending-review');
      explainBox.textContent = `${result.mode === 'ai' ? 'AI' : '規則'}建議：${explanation || ''}`;
    }
  } catch (err) {
    if (explainBox) {
      explainBox.classList.remove('pending-review');
      explainBox.textContent = `建議失敗：${err.message}`;
    }
  }
};

// ===== 勾稽核對：樣式化確認 Modal（取代原生 alert/confirm） =====
function showVerificationModal(notes, canProceed) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999; display:flex; align-items:center; justify-content:center;';

    const iconOf = (level) => level === 'error' ? '❌' : (level === 'warn' ? '⚠️' : '✓');

    modal.innerHTML = `
      <div style="background:#fff; padding:22px; border-radius:14px; width:92%; max-width:480px; max-height:85vh; overflow:auto;">
        <h3 style="margin-top:0;">勾稽核對結果</h3>
        <div class="verify-panel">
          ${notes.map(n => `
            <div class="verify-item ${n.level}">
              <span class="icon">${iconOf(n.level)}</span>
              <span>${n.text.replace(/^[❌⚠️✓]+\s*/, '')}</span>
            </div>
          `).join('')}
        </div>
        <div style="text-align:right; margin-top:16px;">
          <button type="button" class="secondary" id="verifyModalCancelBtn">取消</button>
          ${canProceed ? `<button type="button" class="primary-btn" id="verifyModalContinueBtn" style="width:auto; margin-left:8px; padding:10px 18px;">繼續歸帳</button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#verifyModalCancelBtn').addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });
    const continueBtn = modal.querySelector('#verifyModalContinueBtn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        modal.remove();
        resolve(true);
      });
    }
  });
}

/**
 * 勾稽核對主流程：
 * - 有 ❌ error：Modal 只顯示「取消」，不能繼續
 * - 只有 ⚠️ warn：Modal 顯示「取消／繼續歸帳」讓使用者自行決定
 * - 全部 ✓：直接放行，不用彈窗打斷操作
 */
async function confirmCrossVerification(voucherId, accountCode) {
  const { canProceed, notes } = await runVoucherCrossVerification(voucherId, accountCode);
  if (canProceed && notes.every(n => n.level === 'ok')) return true;
  return showVerificationModal(notes, canProceed);
}

/**
 * 1. 主管核准單據 (Approve)
 * 狀態轉為 approved，並寫入歷程，讓財務中心可以接手處理
 */
window.approveVoucher = async (voucherId, stage = 'manager') => {
  if (!confirm('確定要核准此單據嗎？')) return;

  try {
    const voucher = {
      id: voucherId,
      status: stage === 'manager' ? 'pending_review' : 'pending_accounting'
    };

    if (stage === 'manager') {
      await managerApprove(voucher);
    } else {
      await accountingApprove(voucher);
    }

    alert('已核准');
    if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
    if (typeof renderDashboard === 'function') renderDashboard();

    const modal = document.getElementById('voucherDetailModal');
    if (modal) modal.style.display = 'none';
  } catch (err) {
    console.error(err);
    alert('核准失敗：' + err.message);
  }
};

/**
 * 2. 主管退件單據 (Reject)
 * 狀態轉為 rejected，強制填寫退件原因，並寫入歷程
 */
window.rejectVoucher = async (voucherId, stage = 'manager') => {
  const reason = await promptRejectReason();
  if (reason === null) return;
  if (!reason) { // 因為上面的函式已經做過 trim() 了，這裡直接判斷即可
    alert('退件必須填寫原因');
    return;
  }
  try {
    const voucher = {
      id: voucherId,
      status: stage === 'manager' ? 'pending_review' : 'pending_accounting'
    };
    if (stage === 'manager') {
      await managerReject(voucher, reason.trim());
    } else {
      await accountingReject(voucher, reason.trim());
    }
    alert('已退件');
    if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch (err) {
    alert('退件失敗：' + err.message);
  }
};

/**
 * 3a. 開啟「執行付款銷案」的銀行帳戶／會計科目選擇視窗
 * （原本的版本直接讀取只存在於「詳細審核」Modal 裡的 reviewBankAccount 欄位，
 *   從列表直接點擊時該元素根本不存在，所以一定會失敗；改成自帶選單。）
 */
window.openCloseVoucherModal = async (voucherId) => {
  // Legacy entry point: keep old bookmarks/buttons on the controlled payment workflow.
  return window.openPaymentQueue(voucherId);

  try {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*, voucher_lines(*)')
      .eq('id', voucherId)
      .single();
    if (!voucher) return alert('找不到單據');

    const [banks, accounts] = await Promise.all([
      fetchBankAccounts(),
      fetchAccounts()
    ]);
    window.__cachedAccounts = accounts;
    const bankOptionsDisabled = banks.length === 0;
    const accountOptionsDisabled = accounts.length === 0;

    // 若明細已經有歸帳科目，預設帶入第一筆的科目
    const existingCode = voucher.voucher_lines?.find(l => l.account_code)?.account_code || '';

    const html = `
      <div class="modal-backdrop" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; padding:25px; border-radius:12px; width:90%; max-width:500px; max-height:90vh; overflow:auto;">
          <h3>執行付款銷案 - ${voucher.voucher_no || ''}</h3>
          <p><strong>摘要：</strong>${voucher.summary || '-'}</p>
          <p><strong>總金額：</strong>$${Number(voucher.total_amount).toLocaleString()}</p>

          <label>歸帳會計科目：</label>
          <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
            <select id="closeAccountCode" style="flex:1; padding:8px;">
              <option value="">${accountOptionsDisabled ? '沒有可用的會計科目' : '請選擇歸帳科目...'}</option>
              ${accounts.map(acc => `
                <option value="${escapeHtml(acc.code)}" ${acc.code === existingCode ? 'selected' : ''}>${escapeHtml(acc.code)} ${escapeHtml(acc.name)}</option>
              `).join('')}
            </select>
            <button type="button" onclick="suggestAccountCodeAI('${voucherId}', 'closeAccountCode')" style="white-space:nowrap; padding:8px 12px;" ${accountOptionsDisabled ? 'disabled' : ''}>✨ AI建議科目</button>
          </div>
          ${accountOptionsDisabled ? '<div class="message error" style="margin:8px 0;">會計科目為空，請確認 accounts 資料與 RLS SELECT policy。</div>' : ''}
          <div id="aiSuggestExplain_closeAccountCode" class="ai-suggest-box"></div>

          <label>付款銀行帳戶：</label>
          <select id="closeBankAccountId" style="width:100%; padding:8px; margin:8px 0;">
            <option value="">${bankOptionsDisabled ? '尚未建立銀行帳戶，請先建立後才能銷案' : '請選擇付款銀行帳戶...'}</option>
            ${(banks || []).map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('')}
          </select>
          ${bankOptionsDisabled ? '<div class="message error" style="margin:8px 0;">沒有可用銀行帳戶，會計不得付款銷案；請先建立銀行帳戶。</div>' : ''}

          <div style="margin-top:20px; text-align:right;">
            <button onclick="confirmCloseVoucher('${voucherId}')" class="primary-btn" ${bankOptionsDisabled || accountOptionsDisabled ? 'disabled' : ''}>確認付款並銷案</button>
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
    alert('載入單據失敗：' + err.message);
  }
};

/**
 * 3b. 確認執行付款銷案：補上未分類的明細科目後，交給 closeVoucherByAccounting
 * 統一寫入正確的借貸雙分錄、銀行流水、付款紀錄，並把單據狀態轉為 closed。
 */
window.confirmCloseVoucher = async (voucherId) => {
  return window.openPaymentQueue(voucherId);

  const accountCode = document.getElementById('closeAccountCode')?.value;
  const bankAccountId = document.getElementById('closeBankAccountId')?.value;

  if (!accountCode) { alert('請選擇歸帳科目'); return; }
  if (!bankAccountId) { alert('請選擇付款銀行帳戶'); return; }

  try {
    await ensureAccountingCanCloseVoucher(voucherId);

    // 勾稽核對：明細金額、發票金額、科目有效性（內含警告時的確認對話框）
    const passedVerification = await confirmCrossVerification(voucherId, accountCode);
    if (!passedVerification) return;
    if (!confirm('確定要執行付款並將此單據「銷案」嗎？')) return;

    // 補上還沒被歸類科目的明細列
    await supabase.from('voucher_lines').update({ account_code: accountCode }).eq('voucher_id', voucherId).is('account_code', null);

    const result = await closeVoucherByAccounting(
      voucherId,
      accountCode,
      bankAccountId,
      new Date().toISOString().slice(0, 10)
    );
    if (!result.success) throw new Error(result.error);

    // 寫入審批歷程
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('voucher_workflow_logs').insert([{
      voucher_id: voucherId, actor_id: user?.id || state.currentUser?.id, action: 'close',
      from_status: 'approved', to_status: 'closed', reject_reason: '執行付款銷案',    }]);

    alert('單據已成功付款並銷案！');

    document.querySelector('.modal-backdrop')?.remove();
    if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
    if (typeof renderDashboard === 'function') renderDashboard();

    const modal = document.getElementById('voucherDetailModal');
    if (modal) modal.style.display = 'none';

  } catch (err) {
    console.error(err);
    alert(`銷案與付款操作失敗：${err.message}`);
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

let selectedTeamMembers = [];

async function populateProjectFormTeamPickers() {
  const deptSelect = document.getElementById('teamMemberDept');
  if (!deptSelect) return;
  const departments = await fetchDepartments();
  deptSelect.innerHTML = departments.map(d => `<option value="${d.id}">${d.display_name || d.name}</option>`).join('');
  await refreshTeamMemberPersonOptions();
  deptSelect.addEventListener('change', refreshTeamMemberPersonOptions);
}

async function refreshTeamMemberPersonOptions() {
  const deptId = document.getElementById('teamMemberDept')?.value;
  const personSelect = document.getElementById('teamMemberPerson');
  if (!deptId || !personSelect) return;
  const { data: people } = await supabase.from('profiles').select('id, full_name').eq('department_id', deptId);
  personSelect.innerHTML = (people || []).map(p => `<option value="${p.id}">${p.full_name}</option>`).join('');
}

window.addTeamMember = () => {
  const personSelect = document.getElementById('teamMemberPerson');
  const id = personSelect?.value;
  const name = personSelect?.selectedOptions[0]?.textContent;
  if (!id || selectedTeamMembers.some(m => m.id === id)) return;
  selectedTeamMembers.push({ id, name });
  renderTeamMemberList();
};

window.removeTeamMember = (id) => {
  selectedTeamMembers = selectedTeamMembers.filter(m => m.id !== id);
  renderTeamMemberList();
};

function renderTeamMemberList() {
  const list = document.getElementById('teamMemberList');
  if (!list) return;
  list.innerHTML = selectedTeamMembers.map(m =>
    `<li>${m.name} <button type="button" onclick="removeTeamMember('${m.id}')" style="color:red; border:none; background:none; cursor:pointer;">移除</button></li>`
  ).join('') || '<li class="muted">尚未指派成員</li>';
}

/**
 * 渲染財務中心 (Financial Center) - 專供會計與管理員進行歸帳與付款
 * 檔案來源: scripts/ui.js
 */
async function renderFinancialCenter() {
  return renderPaymentManagement();

  const container = document.getElementById('dashboardContainer') || document.getElementById('mainContent') || document.getElementById('dashboard');
  if (!container) return;

  const user = state.currentUser || JSON.parse(localStorage.getItem('currentUser') || '{}');
  const isPrivileged = ['admin', 'super_admin', 'accounting'].includes(user.role);

  if (!isPrivileged) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:red;"><h3>權限不足</h3><p>此頁面僅限財務與系統管理員存取。</p></div>`;
    return;
  }

  try {
    // 1. 取得所有狀態為 'approved' (主管已審核，等待財務處理) 的報支單
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .eq('status', 'approved')
      
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 2. 取得會計科目與銀行清單（供歸帳下拉選單使用）
    const { data: accounts } = await supabase.from('accounts').select('*').order('code');
    const { data: banks } = await supabase.from('bank_accounts').select('*');

    let html = `
      <div style="margin-bottom: 24px;">
        <h2 style="color: #1f2937; margin-bottom: 8px;">💰 財務中心 (Financial Center)</h2>
        <p style="color: #6b7280;">集中處理主管已核准案件之會計歸帳、銀行撥款與結案作業。</p>
      </div>

      <div style="background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
        <h3 style="margin-top:0; font-size:16px; color:#374151; margin-bottom:15px;">待歸帳與待付款案件 (${vouchers?.length || 0} 筆)</h3>
        
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="background:#f8f9fa; text-align:left; border-bottom:2px solid #e5e7eb;">
              <th style="padding:10px;">單號</th>
              <th style="padding:10px;">申請人</th>
              <th style="padding:10px;">部門</th>
              <th style="padding:10px;">摘要說明</th>
              <th style="padding:10px;">金額</th>
              <th style="padding:10px; width:20%;">指定會計科目</th>
              <th style="padding:10px; width:20%;">付款銀行</th>
              <th style="padding:10px; text-align:center;">操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (!vouchers || vouchers.length === 0) {
      html += `<tr><td colspan="8" style="text-align:center; padding:20px; color:#6b7280;">目前無待處理的核銷案件</td></tr>`;
    } else {
      for (const v of vouchers) {
        html += `
          <tr style="border-bottom:1px solid #e5e7eb;" id="row-${v.id}">
            <td style="padding:10px;"><a href="javascript:void(0)" onclick="viewVoucherDetail('${v.id}')" style="color:#007bff; font-weight:bold;">${v.voucher_no || '未編號'}</a></td>
            <td style="padding:10px;">${v.profiles?.full_name || '-'}</td>
            <td style="padding:10px;">${v.departments?.name || '-'}</td>
            <td style="padding:10px;">${v.summary || '-'}</td>
            <td style="padding:10px; font-weight:bold; color:#d9534f;">$${Number(v.total_amount || 0).toLocaleString()}</td>
            <td style="padding:10px;">
              <select id="acc-${v.id}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                <option value="">-- 選擇會計科目 --</option>
                ${accounts?.map(acc => `<option value="${acc.id}">${acc.code} ${acc.name}</option>`).join('')}
              </select>
            </td>
            <td style="padding:10px;">
              <select id="bank-${v.id}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                <option value="">-- 選擇付款銀行 --</option>
                ${banks?.map(b => `<option value="${b.id}">${b.bank_name} (${b.account_number})</option>`).join('')}
              </select>
            </td>
            <td style="padding:10px; text-align:center;">
              <button onclick="processPayment('${v.id}', ${v.total_amount})" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">
                付款完成 (Closed)
              </button>
            </td>
          </tr>
        `;
      }
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

  } catch (err) {
    console.error('載入財務中心失敗:', err);
    container.innerHTML = `<p style="color:red; padding:20px;">載入失敗：${err.message}</p>`;
  }
}

/**
 * 處理會計中心之付款結案與會計/銀行分錄連動 (升級版：含扣除專案預算)
 */
window.processPayment = async (voucherId, totalAmount) => {
  return window.openPaymentEditor(voucherId);

  const triggerBtn = document.querySelector(`button[onclick="processPayment('${voucherId}', ${totalAmount})"]`);
  const accountId = document.getElementById(`acc-${voucherId}`)?.value;
  const bankId = document.getElementById(`bank-${voucherId}`)?.value;

  if (!accountId || !bankId) {
    alert('請先指定會計科目與付款銀行');
    return;
  }
  if (!confirm(`確定付款結案？金額 $${Number(totalAmount).toLocaleString()}`)) return;

  await withActionLock(`payment:${voucherId}`, triggerBtn, async () => {
  try {
    await ensureAccountingCanCloseVoucher(voucherId);

    const today = new Date().toISOString().split('T')[0];
    const result = await closeVoucherByAccounting(voucherId, accountId, bankId, today);
    if (!result.success) throw new Error(result.error);

    alert('付款結案成功！');

    // 重新渲染畫面
    if (typeof renderFinancialCenter === 'function') renderFinancialCenter();
    if (typeof renderDashboard === 'function') renderDashboard();

  } catch (err) {
    console.error(err);
    alert(`付款結案失敗：${err.message}`);
  }
  });
}; // 確保函式有正確閉合

async function promptRejectReason() {
  const preset = prompt(
    '請輸入退件原因，或直接輸入代碼快速選擇：\n' +
    '1 = 單據不齊全，請補充憑證\n' +
    '2 = 金額有誤，請確認後重新送出\n' +
    '3 = 已電話告知申請人，請依說明修改\n' +
    '4 = 科目分類需調整\n' +
    '（也可以直接輸入其他原因文字）'
  );
  if (!preset) return null;
  const presets = {
    '1': '單據不齊全，請補充憑證',
    '2': '金額有誤，請確認後重新送出',
    '3': '已電話告知申請人，請依說明修改',
    '4': '科目分類需調整'
  };
  return presets[preset.trim()] || preset.trim();
}

// projectForm 的 submit 事件統一由 initializeEventsInternal() 以 safeListener 綁定。
// 這裡原本還有一段 DOMContentLoaded 綁定，會造成專案快速送出時重複新增。

// 用於暫存修改表單中各列所選擇的附件檔案
let resubLineAttachments = {};
// 用於暫存被標記移除的既有附件 id
let resubDeleteAttachmentIds = [];

// 1. 動態載入指定部門的主管清單
window.loadResubManagers = async (departmentId, selectedManagerId = '') => {
  const managerSelect = document.getElementById('resub-vManagerPicker');
  if (!managerSelect) return;

  managerSelect.innerHTML = '<option value="">不指定（整個部門主管都能審）</option>';
  if (!departmentId) return;

  try {
    // 試著從 users 或 profiles 撈取該部門的使用者（包含主管與專員）
    let { data: users, error } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('department_id', departmentId);

    if (error || !users || users.length === 0) {
      // 若 users 查不到，改查 profiles
      const res = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('department_id', departmentId);
      users = (res.data || []).map(p => ({ id: p.id, name: p.full_name, role: p.role }));
    }

    if (users && users.length > 0) {
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name || '未命名'} (${u.role || '成員'})`;
        if (u.id === selectedManagerId) opt.selected = true;
        managerSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn('載入部門主管清單失敗:', err);
  }
};

// 2. 點擊「修改並重送」時，彈出包含完整表單結構與完整邏輯的 Modal
window.openResubmitModal = async (voucherId) => {
  try {
    resubLineAttachments = {}; // 重置暫存附件
    resubDeleteAttachmentIds = []; // 重置待刪除的既有附件

    // A. 同步抓取資料（含既有附件）
    const [
      { data: vch, error: vErr },
      { data: lines, error: lErr },
      { data: invoices, error: iErr },
      { data: depts, error: dErr }
    ] = await Promise.all([
      supabase.from('vouchers').select('*').eq('id', voucherId).single(),
      supabase.from('voucher_lines').select('*').eq('voucher_id', voucherId),
      supabase.from('invoices').select('*').eq('voucher_id', voucherId),
      supabase.from('departments').select('id, name')
    ]);

    // 抓取既有附件（顯示於 Modal，可標記移除）
    let attachments = [];
    try {
      attachments = await getAttachmentsByVoucherId(voucherId);
    } catch (err) {
      console.warn('讀取既有附件失敗:', err);
    }

    if (vErr || !vch) throw new Error('無法取得報支單資料');

    // B. 根據使用者權限取得專案清單（非 Admin/會計只能看到自己被指派的專案）
    let projectsData = [];
    const isAdminOrAccounting = isFinanceOperator();
    
    if (isAdminOrAccounting) {
      const { data: pData } = await supabase.from('projects').select('id, name, project_code');
      projectsData = pData || [];
    } else {
      const { data: userProjs } = await supabase.from('project_members').select('project_id').eq('user_id', state.currentUser?.id);
      const projectIds = (userProjs || []).map(up => up.project_id);
      if (projectIds.length > 0) {
        const { data: pData } = await supabase.from('projects').select('id, name, project_code').in('id', projectIds);
        projectsData = pData || [];
      }
    }

    // 建立或取得 Modal 容器
    let modal = document.getElementById('resubmitModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'resubmitModal';
      modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:9999;";
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';

    // C. 組裝完整的表單 HTML 結構
    modal.innerHTML = `
      <div style="background:#fff; padding:24px; border-radius:8px; width:95%; max-width:950px; max-height:90vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #eee; padding-bottom:10px; margin-bottom:15px;">
          <h3 style="margin:0;">修改並重送報支單 [${vch.voucher_no || '未編號'}]</h3>
          <button type="button" onclick="document.getElementById('resubmitModal').style.display='none'" style="font-size:24px; cursor:pointer; background:none; border:none;">&times;</button>
        </div>

        <form id="resubmitFormElement" onsubmit="submitFullResubmission(event, '${vch.id}')" class="form-container">
          <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px;">
            <h4 style="margin-top:0; color:#0f172a;">報支基本資訊</h4>
            <div style="display: flex; gap: 15px; margin-bottom: 10px;">
              <div style="flex: 1;">
                <label>報支主旨 (必填)：</label>
                <input type="text" id="resub-vTitle" value="${vch.summary || ''}" required style="width: 100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
                
                <label style="margin-top:8px; display:block;">所屬部門：</label>
                <select id="resub-vDepartment" required onchange="loadResubManagers(this.value)" style="width: 100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
                  ${(depts || []).map(d => `<option value="${d.id}" ${d.id === vch.department_id ? 'selected' : ''}>${d.display_name || d.name}</option>`).join('')}
                </select>

                <label style="margin-top:8px; display:block;">指定審核主管（留空則整個部門的主管都能審）：</label>
                <select id="resub-vManagerPicker" style="width: 100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
                  <option value="">不指定（整個部門主管都能審）</option>
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 15px; margin-bottom: 10px;">
              <div style="flex: 1;">
                <label>專案：</label>
                <select id="resub-vProject" style="width: 100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
                  <option value="">無專案</option>
                  ${(projectsData || []).map(p => `<option value="${p.id}" ${p.id === vch.project_id ? 'selected' : ''}>${p.project_code ? p.project_code + ' - ' : ''}${p.name}</option>`).join('')}
                </select>
              </div>
              <div style="flex: 1;">
                <label>行程起日：</label>
                <input type="date" id="resub-vTripStart" value="${vch.trip_start_date || ''}" style="width: 100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
              </div>
              <div style="flex: 1;">
                <label>行程迄日：</label>
                <input type="date" id="resub-vTripEnd" value="${vch.trip_end_date || ''}" style="width: 100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
              </div>
            </div>
          </div>

          <div class="panel" style="background:#fff; border:1px solid #eee; padding:15px; border-radius:8px;">
            <h4 style="margin-top:0;">核銷明細</h4>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="padding: 8px; border: 1px solid #ddd; width: 13%;">單據年月</th>
                  <th style="padding: 8px; border: 1px solid #ddd; width: 10%;">憑證類型</th>
                  <th style="padding: 8px; border: 1px solid #ddd; width: 12%;">發票號碼</th>
                  <th style="padding: 8px; border: 1px solid #ddd; width: 22%;">會計科目 / 項目說明</th>
                  <th style="padding: 8px; border: 1px solid #ddd; width: 10%;">金額</th>
                  <th style="padding: 8px; border: 1px solid #ddd; width: 13%;">付款人(身分證/統編)</th>
                  <th style="padding: 8px; border: 1px solid #ddd; width: 20%;">操作與附件</th>
                </tr>
              </thead>
              <tbody id="resubExcelLinesBody">
                ${(lines && lines.length > 0) ? lines.map((l, index) => {
                  const inv = invoices?.[index] || invoices?.[0] || {};
                  const rowId = `resub-row-${index}`;
                  return `
                    <tr data-row-id="${rowId}">
                      <td style="padding:8px; border:1px solid #ddd;"><input type="month" class="grid-month" value="${l.receipt_month || ''}" style="width:96%; padding:4px;"></td>
                      <td style="padding:8px; border:1px solid #ddd;">
                        <select class="grid-inv-type" onchange="toggleInvoiceRequired(this)" style="width:100%; padding:4px;">
                          <option value="無" ${inv.invoice_type === '無' ? 'selected' : ''}>無</option>
                          <option value="發票" ${inv.invoice_type === '發票' ? 'selected' : ''}>發票</option>
                          <option value="收據" ${inv.invoice_type === '收據' ? 'selected' : ''}>收據</option>
                          <option value="領據" ${inv.invoice_type === '領據' ? 'selected' : ''}>領據</option>
                        </select>
                      </td>
                      <td style="padding:8px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" value="${inv.invoice_number || ''}" placeholder="可留空" style="width:90%; padding:4px;" ${!inv.invoice_type || inv.invoice_type === '無' ? 'disabled' : ''}></td>
                      <td style="padding:8px; border:1px solid #ddd;">
                        <select class="grid-item-category" onchange="toggleCategoryNote(this)" style="width:100%; padding:4px;">
                          <option value="車馬費" ${l.description === '車馬費' ? 'selected' : ''}>車馬費</option>
                          <option value="住宿費" ${l.description === '住宿費' ? 'selected' : ''}>住宿費</option>
                          <option value="文具用品" ${l.description === '文具用品' ? 'selected' : ''}>文具用品</option>
                          <option value="餐飲交際" ${l.description === '餐飲交際' ? 'selected' : ''}>餐飲交際</option>
                          <option value="郵電通訊" ${l.description === '郵電通訊' ? 'selected' : ''}>郵電通訊</option>
                          <option value="設備與軟體授權" ${l.description === '設備與軟體授權' ? 'selected' : ''}>設備與軟體授權</option>
                          <option value="專業服務費" ${l.description === '專業服務費' ? 'selected' : ''}>專業服務費</option>
                          <option value="其他" style="background:#eee;">其他（請說明）</option>
                        </select>
                        <input type="text" class="grid-category-note" value="${l.description}" placeholder="請說明項目內容" style="width:96%; padding:4px; margin-top:4px;">
                      </td>
                      <td style="padding:8px; border:1px solid #ddd;"><input type="number" class="grid-amount" value="${l.amount || 0}" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateResubTotal()"></td>
                      <td style="padding:8px; border:1px solid #ddd;">
                        <input type="text" class="grid-payee-id" value="${escapeHtml(l.payee_identifier || '')}" placeholder="身分證/統編" style="width:90%; padding:4px;" oninput="queuePayeeLookup(this)" onblur="fetchPayeeName(this)">
                        <span class="grid-payee-name" data-masked-name="${escapeHtml(maskPayeeName(l.payee_name || ''))}" style="font-size:12px; color:#666; display:block;">${escapeHtml(maskPayeeName(l.payee_name || ''))}</span>
                      </td>
                      <td style="padding:8px; border:1px solid #ddd; text-align:center;">
                        <input type="file" class="grid-attachment" accept="image/*,.pdf" style="display:none;" onchange="assignResubLineAttachment('${rowId}', this.files[0])">
                        <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="this.previousElementSibling.click()">📎 附件</button>
                        <div class="attachment-label" style="font-size:10px; color:#666; margin-top:2px;">未選擇</div>
                        <button type="button" class="danger" style="padding:4px 8px; font-size:12px; margin-top:4px;" onclick="this.closest('tr').remove(); calculateResubTotal();">刪除</button>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr data-row-id="resub-row-0">
                    <td style="padding:8px; border:1px solid #ddd;"><input type="month" class="grid-month" style="width:96%; padding:4px;"></td>
                    <td style="padding:8px; border:1px solid #ddd;">
                      <select class="grid-inv-type" onchange="toggleInvoiceRequired(this)" style="width:100%; padding:4px;">
                        <option value="無">無</option>
                        <option value="發票">發票</option>
                        <option value="收據">收據</option>
                        <option value="領據">領據</option>
                      </select>
                    </td>
                    <td style="padding:8px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" placeholder="可留空" style="width:90%; padding:4px;" disabled></td>
                    <td style="padding:8px; border:1px solid #ddd;">
                      <select class="grid-item-category" onchange="toggleCategoryNote(this)" style="width:100%; padding:4px;">
                        <option value="車馬費">車馬費</option>
                        <option value="住宿費">住宿費</option>
                        <option value="文具用品">文具用品</option>
                        <option value="餐飲交際">餐飲交際</option>
                        <option value="郵電通訊">郵電通訊</option>
                        <option value="設備與軟體授權">設備與軟體授權</option>
                        <option value="專業服務費">專業服務費</option>
                        <option value="其他">其他（請說明）</option>
                      </select>
                      <input type="text" class="grid-category-note" placeholder="請說明項目內容" style="display:none; width:96%; padding:4px; margin-top:4px;">
                    </td>
                    <td style="padding:8px; border:1px solid #ddd;"><input type="number" class="grid-amount" value="${vch.total_amount || 0}" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateResubTotal()"></td>
                    <td style="padding:8px; border:1px solid #ddd;">
                      <input type="text" class="grid-payee-id" placeholder="身分證/統編" style="width:90%; padding:4px;" oninput="queuePayeeLookup(this)" onblur="fetchPayeeName(this)">
                      <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;"></span>
                    </td>
                    <td style="padding:8px; border:1px solid #ddd; text-align:center;">
                      <input type="file" class="grid-attachment" accept="image/*,.pdf" style="display:none;" onchange="assignResubLineAttachment('resub-row-0', this.files[0])">
                      <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="this.previousElementSibling.click()">📎 附件</button>
                      <div class="attachment-label" style="font-size:10px; color:#666; margin-top:2px;">未選擇</div>
                      <button type="button" class="danger" style="padding:4px 8px; font-size:12px; margin-top:4px;" onclick="this.closest('tr').remove(); calculateResubTotal();">刪除</button>
                    </td>
                  </tr>
                `}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #ddd;">總計金額：</td>
                  <td colspan="3" style="padding: 8px; font-weight: bold; color: #d9534f; border: 1px solid #ddd;" id="resubTotalDisplay">$${Number(vch.total_amount || 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>

            <button type="button" class="secondary" onclick="addResubExcelRow()">+ 新增一列</button>

            <div style="margin-top: 15px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
              <h4 style="margin:0 0 8px; font-size:14px; color:#0f172a;">既有附件（${(attachments || []).length} 個）</h4>
              ${(attachments || []).length === 0
                ? '<p class="muted" style="font-size:12px; margin:0;">目前沒有附件。</p>'
                : attachments.map(att => `
                  <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:13px;">
                    <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                      <input type="checkbox" class="resub-delete-att" data-att-id="${att.id}" onchange="toggleResubDeleteAttachment('${att.id}', this.checked)">
                      <a href="${att.file_url || '#'}" target="_blank" rel="noopener" style="color:#2563eb; text-decoration:underline; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:320px;">${att.file_name || '附件'}</a>
                    </div>
                    <span style="font-size:11px; color:#94a3b8;">勾選以移除</span>
                  </div>
                `).join('')}
            </div>

            <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" class="secondary" onclick="document.getElementById('resubmitModal').style.display='none'" style="padding:8px 16px;">取消</button>
              <button type="submit" class="primary-btn" style="padding:8px 16px; background:#007bff; color:#fff; border:none; border-radius:4px; cursor:pointer;">確認修改並重送</button>
            </div>
          </div>
        </form>
      </div>
    `;

    // D. 自動載入當前部門的主管清單並選取原本指定的主管
    if (vch.department_id) {
      await loadResubManagers(vch.department_id, vch.current_manager_id);
    }

  } catch (err) {
    alert('開啟修改視窗失敗：' + err.message);
  }
};

// 3. 於修改表單中新增一列（包含付款人查詢、附件上傳功能）
window.addResubExcelRow = () => {
  const tbody = document.getElementById('resubExcelLinesBody');
  if (!tbody) return;
  const rowId = 'resub-row-' + Date.now();
  const tr = document.createElement('tr');
  tr.setAttribute('data-row-id', rowId);
  tr.innerHTML = `
    <td style="padding:8px; border:1px solid #ddd;"><input type="month" class="grid-month" style="width:96%; padding:4px;"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-inv-type" onchange="toggleInvoiceRequired(this)" style="width:100%; padding:4px;">
        <option value="無">無</option>
        <option value="發票">發票</option>
        <option value="收據">收據</option>
        <option value="領據">領據</option>
      </select>
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="text" class="grid-inv-num" placeholder="可留空" style="width:90%; padding:4px;" disabled></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <select class="grid-item-category" onchange="toggleCategoryNote(this)" style="width:100%; padding:4px;">
        <option value="車馬費">車馬費</option>
        <option value="住宿費">住宿費</option>
        <option value="文具用品">文具用品</option>
        <option value="餐飲交際">餐飲交際</option>
        <option value="郵電通訊">郵電通訊</option>
        <option value="設備與軟體授權">設備與軟體授權</option>
        <option value="專業服務費">專業服務費</option>
        <option value="其他">其他（請說明）</option>
      </select>
      <input type="text" class="grid-category-note" placeholder="請說明項目內容" style="display:none; width:96%; padding:4px; margin-top:4px;">
    </td>
    <td style="padding:8px; border:1px solid #ddd;"><input type="number" class="grid-amount" placeholder="0" style="width:90%; padding:4px;" min="0" oninput="calculateResubTotal()"></td>
    <td style="padding:8px; border:1px solid #ddd;">
      <input type="text" class="grid-payee-id" placeholder="身分證/統編" style="width:90%; padding:4px;" oninput="queuePayeeLookup(this)" onblur="fetchPayeeName(this)">
      <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;"></span>
    </td>
    <td style="padding:8px; border:1px solid #ddd; text-align:center;">
      <input type="file" class="grid-attachment" accept="image/*,.pdf" style="display:none;" onchange="assignResubLineAttachment('${rowId}', this.files[0])">
      <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="this.previousElementSibling.click()">📎 附件</button>
      <div class="attachment-label" style="font-size:10px; color:#666; margin-top:2px;">未選擇</div>
      <button type="button" class="danger" style="padding:4px 8px; font-size:12px; margin-top:4px;" onclick="this.closest('tr').remove(); calculateResubTotal();">刪除</button>
    </td>
  `;
  tbody.appendChild(tr);
};

// 4. 指派修改表單中的列附件
window.assignResubLineAttachment = (rowId, file) => {
  if (!file) return;
  resubLineAttachments[rowId] = file;
  const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
  const label = row?.querySelector('.attachment-label');
  if (label) label.textContent = `已選擇：${file.name}`;
};

// 4.1 標記／取消標記移除既有附件
window.toggleResubDeleteAttachment = (attId, checked) => {
  if (!resubDeleteAttachmentIds) resubDeleteAttachmentIds = [];
  if (checked) {
    if (!resubDeleteAttachmentIds.includes(attId)) resubDeleteAttachmentIds.push(attId);
  } else {
    resubDeleteAttachmentIds = resubDeleteAttachmentIds.filter(id => id !== attId);
  }
};

// 5. 即時計算修改表單總金額
window.calculateResubTotal = () => {
  const amounts = document.querySelectorAll('#resubExcelLinesBody .grid-amount');
  let total = 0;
  amounts.forEach(input => {
    total += Number(input.value) || 0;
  });
  const display = document.getElementById('resubTotalDisplay');
  if (display) display.textContent = '$' + total.toLocaleString();
};

// 6. 提交全部修改資料並將單據重新送審
window.submitFullResubmission = async (e, voucherId) => {
  e.preventDefault();

  const title = document.getElementById('resub-vTitle').value.trim();
  const departmentId = document.getElementById('resub-vDepartment').value;
  const managerId = document.getElementById('resub-vManagerPicker').value || null;
  const projectId = document.getElementById('resub-vProject').value || null;
  const tripStart = document.getElementById('resub-vTripStart').value || null;
  const tripEnd = document.getElementById('resub-vTripEnd').value || null;

  const rows = document.querySelectorAll('#resubExcelLinesBody tr');
  const newLines = [];
  const newInvoices = [];
  let totalAmount = 0;
  const missingPayeeRows = [];

  rows.forEach((row, index) => {
    const month = row.querySelector('.grid-month').value;
    const invType = row.querySelector('.grid-inv-type').value;
    const invNum = row.querySelector('.grid-inv-num').value.trim();
    const categorySelect = row.querySelector('.grid-item-category').value;
    const categoryNote = row.querySelector('.grid-category-note').value.trim();
    const description = categorySelect === '其他' ? (categoryNote || '其他') : categorySelect;
    const amount = Number(row.querySelector('.grid-amount').value) || 0;
    const payeeId = row.querySelector('.grid-payee-id').value.trim();
    const payeeName = (
      row.querySelector('.grid-payee-name')?.dataset.maskedName
      || row.querySelector('.grid-payee-name')?.innerText.trim()
      || ''
    ).replace(/^付款人：/, '').trim();
    if (amount > 0 && (!payeeId || !payeeName || payeeName.includes('查無') || payeeName.includes('查詢中'))) {
      missingPayeeRows.push(index + 1);
    }

    totalAmount += amount;

    newLines.push({
      receipt_month: month,
      description: description,
      item_category: categorySelect,
      item_category_note: categoryNote,
      amount: amount,
      payee_identifier: payeeId,
      payee_name: payeeName.includes('查無') || payeeName.includes('查詢中') ? null : payeeName
    });

    if (invType && invType !== '無') {
      const taxInfo = calcInvoiceTax(invType, amount);
      newInvoices.push({
        invoice_type: invType,
        invoice_number: invNum,
        amount: amount,
        tax_amount: taxInfo.taxAmount
      });
    }
  });

  if (newLines.length === 0) {
    alert('請至少填寫一筆報支明細！');
    return;
  }
  if (missingPayeeRows.length) {
    alert(`第 ${missingPayeeRows.join('、')} 列請輸入身分證/統編並確認有帶出付款人姓名。`);
    return;
  }

  try {
    // 0. 在 updateVoucher() 之前讀取目前憑證狀態，確保重送歷程的 from_status 是正確的
    //    （原本在更新後才讀取，此時狀態已被改成 pending_review，導致 from_status 記錄錯誤）
    const { data: currentVch } = await supabase
      .from('vouchers')
      .select('status')
      .eq('id', voucherId)
      .single();

    // 1. 透過共用 API 一次完成：更新主檔＋替換明細＋替換發票＋附件（刪除既有/上傳新檔）
    const updateResult = await updateVoucher(voucherId, {
      summary: title,
      departmentId: departmentId,
      currentManagerId: managerId,
      projectId: projectId,
      totalAmount: totalAmount,
      status: 'pending_review',
      detailLines: newLines,
      invoiceLines: newInvoices,
      tripStartDate: tripStart,
      tripEndDate: tripEnd,
      newAttachments: Object.values(resubLineAttachments),
      deleteAttachmentIds: resubDeleteAttachmentIds
    });

    if (!updateResult || !updateResult.success) {
      throw new Error(updateResult?.message || '更新憑證失敗');
    }

    // 2. 寫入工作流程記錄（重送）：from_status 使用更新前的真實狀態
    await supabase.from('voucher_workflow_logs').insert({
      voucher_id: voucherId,
      actor_id: state.currentUser?.id,
      action: 'submit',
      from_status: currentVch?.status || 'rejected',
      to_status: 'pending_review',
      reject_reason: null
    });

    alert('修改並重送成功！單據已重新送交主管審核。');
    document.getElementById('resubmitModal').style.display = 'none';

    if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();
    if (typeof renderDashboard === 'function') renderDashboard();

  } catch (err) {
    console.error(err);
    alert('修改失敗：' + err.message);
  }
};

window.approveFromDetail = async (voucherId) => {
  try {
    const { data: voucher } = await supabase.from('vouchers').select('*').eq('id', voucherId).single();
    
    // 根據角色決定呼叫哪個核准邏輯
    if (state.currentUser?.role === 'accounting') {
      await accountingApprove(voucher); // 假設有這個函式
      showMessage('會計審核完成。');
    } else {
      await managerApprove(voucher);
      showMessage('已核准，送至會計審核。');
    }
    
    document.querySelector('.modal-backdrop')?.remove();
    renderVoucherWorkflowList();
  } catch (error) {
    console.error('Approve Error:', error);
    showMessage('核准發生錯誤');
  }
};

window.rejectFromDetail = async (voucherId) => {
  const reason = await promptRejectReason();
  if (!reason) return;
  
  try {
    const { data: voucher } = await supabase.from('vouchers').select('*').eq('id', voucherId).single();
    
    // 根據角色決定呼叫哪個退件邏輯
    if (state.currentUser?.role === 'accounting') {
      await accountingReject(voucher, reason); // 假設有這個函式
    } else {
      await managerReject(voucher, reason);
    }
    
    showMessage('已退件。');
    document.querySelector('.modal-backdrop')?.remove();
    renderVoucherWorkflowList();
  } catch (error) {
    console.error('Reject Error:', error);
    showMessage('退件發生錯誤');
  }
};

// 初始化時將 state.companyInfo 填入畫面的輸入框中
function initCompanyInfoForm() {
  fillCompanyInfoForm();
  updateSettings();
}

let parsedStatementRecords = [];
let availableBankAccounts = []; // 用來暫存從 DB 抓取的銀行清單

// 1. 動態生成下拉選單
async function populateStatementBankAccountSelect() {
  const select = document.getElementById('statementBankAccountId');
  if (!select) return;
  
  // 呼叫你系統既有的 API 抓取 DB 裡的銀行帳戶
  availableBankAccounts = await fetchBankAccounts();
  
  select.innerHTML = '<option value="">請選擇銀行帳戶...</option>' + 
    availableBankAccounts.map(b => 
      `<option value="${b.id}">${b.bank_name} - ${b.account_number.slice(-4)} (${b.nickname || ''})</option>`
    ).join('');

  // 監聽選擇改變，提示使用者對應的解析規則
  select.addEventListener('change', (e) => {
    const bankCode = detectParserCode(e.target.value);
    const hintEl = document.getElementById('detectedParserText');
    if (bankCode) {
      hintEl.innerHTML = `✅ 已自動對應解析規則：<strong>${bankCode}</strong>`;
      hintEl.style.color = 'green';
    } else if (e.target.value) {
      hintEl.innerHTML = `⚠️ 系統目前沒有此銀行帳戶的 PDF 解析規則`;
      hintEl.style.color = 'red';
    } else {
      hintEl.innerHTML = '';
    }
  });
}

// 2. 自動判斷對應的 Parser 規則 (玉山187, 兆豐347...等)
function detectParserCode(bankId) {
  const bank = availableBankAccounts.find(b => b.id === bankId);
  if (!bank) return null;

  const bankName = bank.bank_name || '';
  const accNum = bank.account_number || '';
  const last3 = accNum.slice(-3); // 取帳號末三碼

  if (bankName.includes('玉山')) return `玉山${last3}`;
  if (bankName.includes('兆豐')) return `兆豐${last3}`;
  
  return null; 
}

// 3. 修改解析按鈕邏輯
async function handleParseStatement() {
  const fileInput = document.getElementById('statementFileInput');
  const bankAccountId = document.getElementById('statementBankAccountId').value;
  const previewArea = document.getElementById('statementPreviewArea');
  const file = fileInput?.files[0];

  if (!bankAccountId) { showMessage('請先選擇對應的銀行帳戶。', true); return; }
  if (!file) { showMessage('請先選擇 PDF 檔案。', true); return; }

  // 動態取得 bankCode
  const bankCode = detectParserCode(bankAccountId);
  if (!bankCode) {
    showMessage('系統目前無法解析此銀行的對帳單，請確認是否為支援的帳戶。', true);
    return;
  }

  previewArea.innerHTML = '<p class="muted">解析中，請稍候…</p>';

  try {
    const fileBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch('/api/parse-bank-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, bankCode }) // 送出動態產生的 bankCode
    });
    
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || '解析失敗');

    parsedStatementRecords = result.records;

    if (!parsedStatementRecords.length) {
      previewArea.innerHTML = '<p class="muted">沒有解析到任何交易紀錄，請確認 PDF 格式或銀行別是否正確。</p>';
      return;
    }

    previewArea.innerHTML = `
      <p>解析到 <strong>${parsedStatementRecords.length}</strong> 筆交易，請確認後匯入：</p>
      <table>
        <thead><tr><th>日期</th><th>摘要</th><th>對象</th><th>支出</th><th>收入</th><th>餘額</th></tr></thead>
        <tbody>
          ${parsedStatementRecords.map(r => `
            <tr>
              <td>${r.date || '-'}</td><td>${r.detail || '-'}</td><td>${r.counterparty || '-'}</td>
              <td>${r.expense ? Number(r.expense).toLocaleString() : '-'}</td>
              <td>${r.income ? Number(r.income).toLocaleString() : '-'}</td>
              <td>${r.balance != null ? Number(r.balance).toLocaleString() : '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <button id="confirmImportStatementBtn" class="primary-btn" style="margin-top:12px;">確認匯入帳單庫</button>
    `;

    document.getElementById('confirmImportStatementBtn')?.addEventListener('click', handleConfirmImportStatement);
  } catch (error) {
    previewArea.innerHTML = `<p class="muted">解析失敗：${error.message}</p>`;
  }
}

// 4. 修改確認匯入邏輯
async function handleConfirmImportStatement() {
  const bankAccountId = document.getElementById('statementBankAccountId').value;
  // 匯入資料庫時，一併把解析規則(bankCode)存進去備查
  const bankCode = detectParserCode(bankAccountId); 
  const fileName = document.getElementById('statementFileInput')?.files[0]?.name || '';
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const rows = parsedStatementRecords
      .filter(r => r.date)
      .map(r => ({
        bank_account_id: bankAccountId || null,
        bank_code: bankCode,
        tx_date: r.date.replace(/\//g, '-'),
        detail: r.detail,
        counterparty: r.counterparty,
        expense: r.expense || 0,
        income: r.income || 0,
        balance: r.balance,
        source_file_name: fileName,
        uploaded_by: user.id
      }));

    const rowsWithCompany = rows.map(r => ({ ...r,  }));
    const { error } = await supabase.from('bank_statement_transactions').insert(rowsWithCompany);
    if (error) throw error;

    showMessage(`已匯入 ${rows.length} 筆對帳資料。`);
    document.getElementById('statementPreviewArea').innerHTML = '';
    document.getElementById('statementFileInput').value = '';
    document.getElementById('detectedParserText').innerHTML = '';
  } catch (error) {
    showMessage(`匯入失敗：${error.message}`, true);
  }
}


function setDefaultReportPeriod() {
  const startInput = document.getElementById('reportPeriodStart');
  const endInput = document.getElementById('reportPeriodEnd');
  if (startInput && !startInput.value) {
    const year = new Date().getFullYear();
    startInput.value = `${year}-01-01`;
  }
  if (endInput && !endInput.value) {
    endInput.value = new Date().toISOString().slice(0, 10);
  }
}

window.renderUserManagementView = renderUserManagementPanel;

// ===== 通知功能 =====
let notificationPollTimer = null;

async function refreshNotificationBadge() {
  try {
    const count = await fetchUnreadCount();
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('更新通知未讀數失敗:', err);
  }
}

async function renderNotificationList() {
  const list = document.getElementById('notificationList');
  if (!list) return;
  list.innerHTML = '<div style="padding:16px; text-align:center; color:#999; font-size:13px;">載入中…</div>';
  try {
    const notifications = await fetchMyNotifications();
    if (notifications.length === 0) {
      list.innerHTML = '<div style="padding:16px; text-align:center; color:#999; font-size:13px;">目前沒有通知</div>';
      return;
    }
    list.innerHTML = notifications.map(n => `
      <div class="notification-item" data-id="${n.id}" data-voucher-id="${n.voucher_id || ''}"
        style="padding:10px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer; ${n.is_read ? '' : 'background:#eff6ff;'}">
        <div style="font-size:13px; font-weight:${n.is_read ? '400' : '600'}; color:#1e293b;">${n.title}</div>
        ${n.message ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">${n.message}</div>` : ''}
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${new Date(n.created_at).toLocaleString('zh-TW')}</div>
      </div>
    `).join('');

    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const voucherId = item.dataset.voucherId;
        await markNotificationRead(id);
        await refreshNotificationBadge();
        item.style.background = '#fff';
        const panel = document.getElementById('notificationPanel');
        if (panel) panel.style.display = 'none';
        if (voucherId && typeof window.viewVoucherDetail === 'function') {
          window.viewVoucherDetail(voucherId);
        }
      });
    });
  } catch (err) {
    console.error('讀取通知列表失敗:', err);
    list.innerHTML = '<div style="padding:16px; text-align:center; color:#dc2626; font-size:13px;">讀取失敗</div>';
  }
}

function initNotificationBell() {
  const bellBtn = document.getElementById('notificationBellBtn');
  const panel = document.getElementById('notificationPanel');
  const markAllBtn = document.getElementById('markAllNotificationsReadBtn');
  if (!bellBtn || !panel) return;

  if (!bellBtn.dataset.bound) {
    bellBtn.dataset.bound = 'true';
    bellBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = panel.style.display === 'block';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) await renderNotificationList();
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== bellBtn) {
        panel.style.display = 'none';
      }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await markAllNotificationsRead();
        await refreshNotificationBadge();
        await renderNotificationList();
      });
    }
  }

  refreshNotificationBadge();

  if (!notificationPollTimer) {
    notificationPollTimer = setInterval(refreshNotificationBadge, 30000);
  }
}

async function reloadAppData() {
  try {
    // 1) refresh company-independent info and settings
    state.companyInfo = {};
    state.structureSettings = {};

    // 2) refresh bank accounts
    try {
      const banks = await fetchBankAccounts();
      const bankSelect = document.getElementById('txBankAccount');
      if (bankSelect) bankSelect.innerHTML = banks.map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('');
    } catch (e) { console.warn('reloadAppData: fetchBankAccounts failed', e); }

    // 3) refresh accounts list
    try {
      const accounts = await fetchAccounts();
      // update any account-dependent UI (dropdowns, labels)
      const accountSelect = document.getElementById('accountSelect');
      if (accountSelect) accountSelect.innerHTML = accounts.map(a => `<option value="${a.id}">${a.code} ${a.name}</option>`).join('');
    } catch (e) { console.warn('reloadAppData: fetchAccounts failed', e); }

    // 4) refresh departments
    try {
      await populateInviteDepartmentSelect();
    } catch (e) { console.warn('reloadAppData: populateInviteDepartmentSelect failed', e); }

    // 5) refresh projects and vouchers
    try {
      const v = await fetchMyVouchers();
      // re-render dashboard table if present
      const dashboardBody = document.getElementById('dashboardTableBody');
      if (dashboardBody) {
        dashboardBody.innerHTML = (v || []).slice(0,10).map(item => `<tr><td>${item.tx_date || ''}</td><td>-</td><td>${item.summary || ''}</td><td>${item.category || ''}</td><td>${item.total_amount || 0}</td><td>${item.voucher_no || item.id}</td></tr>`).join('');
      }
    } catch (e) { console.warn('reloadAppData: fetchMyVouchers failed', e); }

    // 6) refresh reports summary
    try {
      const summary = await getCurrentMonthVoucherSummary();
      if (summary) {
        document.getElementById('countValue').textContent = summary.count || 0;
        document.getElementById('incomeValue').textContent = summary.totalIncome || 0;
        document.getElementById('expenseValue').textContent = summary.totalExpense || 0;
        document.getElementById('profitValue').textContent = (summary.totalIncome - summary.totalExpense) || 0;
      }
    } catch (e) { console.warn('reloadAppData: getCurrentMonthVoucherSummary failed', e); }

  } catch (err) {
    console.error('reloadAppData failed', err);
  }
}

// react to companyChanged events (dispatched by companyContext.setActiveCompanyId)
window.addEventListener('companyChanged', (e) => {
  reloadAppData();
});
