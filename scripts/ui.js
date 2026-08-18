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
import { fetchAllUsers, updateUserProfile, toggleUserActive, inviteNewUser, updateUserPermissions, getDefaultPermissions, fetchProjectMembers, updateProjectMembers as saveProjectMembersApi } from '../src/modules/admin/adminApi.js';
import { fetchMyNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from './notifications.js';
import { calcInvoiceTax } from './taxCalc.js';
import { runVoucherCrossVerification } from './voucherVerification.js';

// Import modular components
import { renderDashboard } from '../src/modules/dashboard/dashboard.js';
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
  closeSidebar, 
  openSidebar, 
  toggleSidebar,
  STATUS_LABELS,
  ROLE_LABELS
} from '../src/modules/utils/uiHelpers.js';

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

// ===== 完整的使用者權限管理視圖 =====
async function renderUserManagementView() {
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
    
    const currentPerms = user.permissions || {};
    const updatedPerms = {
      ...currentPerms,
      [permKey]: !currentPerms[permKey]
    };
    
    await updateUserPermissions(userId, updatedPerms);
    showMessage('權限已更新');
    renderUserManagementView();
  } catch (error) {
    alert('更新權限失敗：' + error.message);
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
    renderUserManagementView();
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
    await updateUserProfile(resetPassUserId, { password: newPass });
    showMessage('密碼已重設');
    closeResetPasswordModal();
    renderUserManagementView();
  } catch (error) {
    alert('重設失敗：' + error.message);
  }
};



const state = { ...defaultState };
// 讓抽出到 uiHelpers.js 的共用函式（例如 applyRoleBasedTabVisibility、updateAdminNavVisibility）
// 也能讀到目前的登入使用者狀態。state 為 const 且只會原地修改屬性、不會整個重新賦值，
// 所以這裡指派一次參考即可，之後對 state.xxx 的修改都會同步反映在 window.state 上。
window.state = state;

// ===== 1. 全域狀態標籤 (移到 ui.js 最上方) =====
// 多階段簽核流程指示器：把單據狀態轉換成「提交→主管→會計→付款結案」的視覺步驟

// ===== Audit Trail Logs（全系統單據異動稽核軌跡） =====
async function renderAuditTrail() {
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
            <svg class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 0 0114 0z"></path></svg>
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


// ===== 2. 姓名遮罩工具 (新增到全域) =====
// ===== 智能姓名遮罩 (廠商不遮罩，個人遮罩) =====

// ===== 身分證字號遮罩 (例如: U800****518) =====





// 1. 將這兩個函式獨立移到外面（全域範圍）


function render() {
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
  applyRoleBasedTabVisibility();
  renderDashboard();
  renderTransactionTable();
  // 財報僅限 會計(accounting)/管理員(admin) 檢視；
  // employee/manager 不觸發報表 DB 查詢，避免因 RLS 限制觸發 406 Not Acceptable
  if (['accounting', 'admin'].includes(state.currentUser?.role)) {
    renderReports();
  }
  renderCompanyData();
  fillCompanyInfoForm();
  renderBusinessData();
  updateSettings();
  renderBankAccounts();
  renderVoucherCenter();
  renderBudget();
  if (['accounting', 'admin'].includes(state.currentUser?.role)) {
    renderEquityTab();
  }
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
  const directorRows = (state.directorShareholders || []).map(person => `
    <li>姓名：${person.name ?? '-'} / 職務：${person.role ?? '-'} / 身分證：${person.idNumber ?? '-'} / 出資：${Number(person.amount || 0).toLocaleString()} / 地址：${person.address ?? '-'}</li>
  `).join('');
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
    <div class="report-meta">統一編號：${company.taxId || '-'}</div>
    <div class="report-title">${reportTitle}</div>
    <div class="report-period">期間：${periodText}</div>
    <div class="report-printdate">列印日期：${today}</div>
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

function renderApprovalTable() {
  const body = document.getElementById('approvalTableBody');
  body.innerHTML = '';
  if (!state.currentUser || !isAdminUser(state.currentUser.role)) {
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
    passwordCard.style.display = state.currentUser && isAdminUser(state.currentUser.role) ? 'block' : 'none';
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
  // 👇 加上專案權限過濾與關鍵字搜尋
  const filtered = txs.filter(tx => {
    // 1. 權限與專案過濾：如果不是管理者 (admin) 或 會計 (accounting)，只能看當前專案的憑證
    if (state.currentUser?.role !== 'admin' && state.currentUser?.role !== 'accounting') {
      if (tx.project_id && tx.project_id !== (state.currentProjectId === 'all' ? tx.project_id : state.currentProjectId)) {
        return false;
      }
    }
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

window.fetchPayeeName = async (inputEl) => {
  const identifier = inputEl.value.trim();
  const container = inputEl.closest('td, div');
  const nameSpan = container.querySelector('.grid-payee-name');
  if (!nameSpan) return;
  if (!identifier) { nameSpan.innerHTML = ''; return; }

  nameSpan.innerText = '查詢中...';
  const { data, error } = await supabase.from('payees').select('name').eq('identifier', identifier).maybeSingle();

  if (error || !data) {
    nameSpan.innerHTML = `查無資料 <button type="button" class="secondary" style="padding:2px 6px; font-size:11px;" onclick="openAddPayeeModal('${identifier}', this)">＋ 新增付款人</button>`;
    return;
  }
  nameSpan.innerText = maskPayeeName(data.name);
  nameSpan.dataset.fullName = data.name; // 實際姓名存起來，送出表單時要用真實姓名，不是馬賽克版本
};

window.openAddPayeeModal = (prefillIdentifier, triggerBtn) => {
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
    
    // 回填到原本觸發的那個欄位
    const trigger = window.__payeeTriggerContext;
    if (trigger) {
      const container = trigger.closest('td, div');
      const idInput = container.querySelector('.grid-payee-id, .grid-proxy-id');
      const nameSpan = container.querySelector('.grid-payee-name, .grid-proxy-name');
      
      if (idInput) idInput.value = identifier;
      if (nameSpan) { 
        nameSpan.innerText = maskPayeeName(name); 
        nameSpan.dataset.fullName = name; 
      }
    }
  } catch (error) {
    alert('新增失敗：' + error.message);
  }
};

window.addExcelRow = (prefillFile = null) => {
  const tbody = document.getElementById('excelLinesBody');
  if (!tbody) return;
  const isAccounting = ['accounting', 'admin'].includes(state.currentUser?.role);

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
      <input type="text" class="grid-payee-id" placeholder="應付對象身分證/統編" style="width:90%; padding:4px;" onblur="fetchPayeeName(this)">
      <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;"></span>
      <label style="font-size:11px; display:block; margin-top:4px;">
        <input type="checkbox" class="grid-proxy-check" onchange="toggleProxyPayer(this)"> 已由他人代付
      </label>
      <input type="text" class="grid-proxy-id" placeholder="代付人身分證/統編" style="display:none; width:90%; padding:4px; margin-top:4px;" onblur="fetchProxyPayerName(this)">
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
  proxyInput.style.display = checkboxEl.checked ? 'block' : 'none';
  if (!checkboxEl.checked) { proxyInput.value = ''; proxyName.innerText = ''; }
};

window.fetchProxyPayerName = async (inputEl) => {
  const identifier = inputEl.value.trim();
  const nameSpan = inputEl.closest('td').querySelector('.grid-proxy-name');
  if (!identifier) { nameSpan.innerHTML = ''; return; }
  nameSpan.innerText = '查詢中...';
  const { data } = await supabase.from('payees').select('name').eq('identifier', identifier).maybeSingle();
  if (data) {
    nameSpan.innerText = `代付人：${maskPayeeName(data.name)}`;
    nameSpan.dataset.fullName = data.name;
  } else {
    nameSpan.innerHTML = `查無代付人資料 <button type="button" class="secondary" style="padding:2px 6px; font-size:11px;" onclick="openAddPayeeModal('${identifier}', this)">＋ 新增</button>`;
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
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

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
          stage === 'manager' ? await managerApprove(voucher) : await accountingApprove(voucher);
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
            ${l.reject_reason ? `｜原因：${l.reject_reason}` : ''}
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

    const result = await changeMyPassword(newPassword);
    if (!result.ok) {
      showMessage(`密碼修改失敗：${result.message}`, true);
      return;
    }

    showMessage('密碼修改成功！');
    e.target.reset();
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

      if ((tab === 'transactions' || tab === 'bankAccounts') && !['accounting', 'admin'].includes(state.currentUser?.role)) {
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
      if (tab === 'adminUsers') {
        populateInviteDepartmentSelect();
        renderAdminUserTable();
        renderAdminDepartmentList();
      }
      if (tab === 'budget') {
        renderBudget();
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
            state.transactions.splice(index, 1);
            saveState(state);
            render();
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
    showApp();
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

  safeListener('companyInfoForm', 'submit', (e) => {
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
      
    if (typeof renderReports === 'function') {
      renderReports();
    }
      
    showMessage('公司資料已儲存並同步至財報！');
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
    };
  }

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
      const accountId = editBtn.dataset.id;
      if (typeof window.editBankAccount === 'function') {
        window.editBankAccount(accountId);
      }
      return;
    }
  });

  safeListener('transactionForm', 'submit', async (e) => { 
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
    try {
      const result = await inviteNewUser({
        email: document.getElementById('inviteEmail').value.trim(),
        fullName: document.getElementById('inviteFullName').value.trim(),
        role: document.getElementById('inviteRole').value,
        departmentId: document.getElementById('inviteDepartment').value,
        password: document.getElementById('invitePassword').value.trim()
      });
      resultBox.style.display = 'block';
      resultBox.className = result.emailSent ? 'message success' : 'message error';
      resultBox.textContent = result.emailSent
        ? `帳號已建立，邀請信已寄至 ${result.credentials.email}（信中含登入網址與初始密碼，使用者登入後系統會強制要求設定新密碼）。`
        : `帳號已建立：${result.credentials.email}｜初始密碼：${result.credentials.tempPassword}（邀請信寄送失敗：${result.emailError || '未知原因'}，請自行告知使用者）`;
      e.target.reset();
      renderAdminUserTable();
    } catch (error) {
      resultBox.style.display = 'block';
      resultBox.className = 'message error';
      resultBox.textContent = `開通失敗：${error.message}`;
    }
  });

  const excelVoucherForm = document.getElementById('voucherCreateForm');
  if (excelVoucherForm) {
    excelVoucherForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      try {
        const txDate = document.getElementById('vDate')?.value || new Date().toISOString().split('T')[0];
        const projectId = document.getElementById('vProject')?.value || null;
        const generalSummary = document.getElementById('vTitle')?.value.trim() || "批量多行核銷單據";
        const departmentId = document.getElementById('vDepartment')?.value || null;
        const managerId = document.getElementById('vManagerPicker')?.value || null;
        const tripStart = document.getElementById('vTripStart')?.value || null;
        const tripEnd = document.getElementById('vTripEnd')?.value || null;
        
        const rows = document.querySelectorAll('#excelLinesBody tr');
        let detailLines = [];
        let invoiceLines = [];
        let calculatedTotal = 0;

        rows.forEach((row) => {
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

          calculatedTotal += amt;

          detailLines.push({
            description,
            item_category: category,
            item_category_note: categoryNote,
            account_code: accountSelect ? (accountSelect.value || null) : null,
            amount: amt,
            payee_identifier: payeeIdInput?.value.trim() || null,
            payee_name: payeeNameSpan?.innerText.includes('查無') ? null : (payeeNameSpan?.innerText || null),
            is_proxy_payment: proxyCheck?.checked || false,
            proxy_payer_identifier: proxyCheck?.checked ? (proxyIdInput?.value.trim() || null) : null,
            proxy_payer_name: proxyCheck?.checked ? (proxyNameSpan?.innerText.replace('代付人：', '') || null) : null
          });

          const invType = invTypeInput ? invTypeInput.value : '無';
          if (invType !== '無') {
            const taxInfo = calcInvoiceTax(invType, amt);
            invoiceLines.push({
              invoice_type: invType,
              invoice_number: invNumInput?.value.trim() || null,
              amount: amt,
              tax_amount: taxInfo.taxAmount
            });
          }
        });

        if (detailLines.length === 0) {
          throw new Error('請至少填寫一筆有效的摘要與金額！');
        }

        const attachmentsMap = typeof voucherLineAttachments !== 'undefined' ? voucherLineAttachments : {};

        const voucherPayload = {
          txDate: txDate,
          projectId: projectId && projectId !== 'all' ? projectId : null,
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

        renderDashboard();
        if (typeof renderVoucherWorkflowList === 'function') renderVoucherWorkflowList();

      } catch (err) {
        console.error(err);
        alert('送出報支單失敗：' + err.message);
      }
    });
  }

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

      const { data: newProject, error: projError } = await supabase
        .from('projects')
        .insert({
          name: name,
          start_date: document.getElementById('projectStart').value || null,
          end_date: document.getElementById('projectEnd').value || null,
          department_id: document.getElementById('projectDepartment').value || null,
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
        const userProjectsWithCompany = selectedTeamMembers.map(m => ({ user_id: m.id, project_id: newProject.id,  }));
        await supabase.from('user_projects').insert(userProjectsWithCompany);
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

  safeListener('departmentForm', 'submit', async (e) => {
    e.preventDefault();
    if (state.currentUser?.role !== 'admin') {
      showMessage('僅 Admin 可新增部門', true);
      return;
    }
    try {
      const name = document.getElementById('newDepartmentName').value.trim();
      const { error } = await supabase.from('departments').insert({ name,  });
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
    initializeEvents();

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
          ? departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
          : '<option value="">尚未建立部門</option>';
      }
      // 部門選好之後，主動載入該部門的人，不用等使用者手動觸發
      await loadDepartmentPeople(deptSelect.value);
    }

    const projectSelect = document.getElementById('vProject');
    if (projectSelect) {
      const projects = await fetchProjects();
      projectSelect.innerHTML = '<option value="">無專案</option>' + 
        projects.map(p => `<option value="${p.id}">${p.project_code} - ${p.name}</option>`).join('');
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
    });

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
    actions += `<button class="primary-btn" onclick="viewVoucherDetail('${v.id}')">查看並審核</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="manager">退件</button>`;
  }
  if (['accounting', 'admin'].includes(role) && v.status === 'pending_accounting') {
    actions += `<button class="primary-btn approve-voucher-btn" data-id="${v.id}" data-stage="accounting">核准入帳</button>
                <button class="danger reject-voucher-btn" data-id="${v.id}" data-stage="accounting">退件</button>`;
  }

  const statusBadge = getStatusBadge(v.status);
  const stepperDots = buildMiniStepperDots(v.status);

  return `
    <div class="voucher-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #f1f5f9;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:14px; color:#0f172a;">${v.voucher_no || '（產生中）'}</strong>
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
        <button class="secondary view-history-btn" data-id="${v.id}" style="font-size:12px; padding:6px 12px;">查看審批歷程</button>
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
        } else {
          actionButtons = `<button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button>`;
        }
      }
      else if (currentUserRole === 'manager') {
        if (vStatus === 'pending_review') {
          actionButtons = `
            <button type="button" class="approve-voucher-btn" data-id="${row.id}" data-stage="manager">核准</button>
            <button type="button" class="reject-voucher-btn" data-id="${row.id}" data-stage="manager">退件</button>
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
            <button class="btn-small success close-voucher-btn" data-id="${row.id}" onclick="openCloseVoucherModal('${row.id}')">
              執行付款銷案
            </button>
          `;
        } else {
          actionButtons = `<button class="btn-small view-history-btn" data-id="${row.id}">查看歷程</button>`;
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
    select.innerHTML = depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  } catch (e) {
    console.error(e);
  }
}

// 1. 渲染專案列表（包含可修改名稱、預算即時連動剩餘金額）
async function renderProjectList() {
  const container = document.getElementById('projectList');
  if (!container) return;

  try {
    const projects = await fetchProjects();
    const depts = await fetchDepartments();
    const deptOptions = depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

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
            <span class="badge ${usedPercent >= 100 ? 'danger' : (usedPercent >= 70 ? 'warning' : 'success')}">已用 ${usedPercent}%</span>
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
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const result = await saveProjectMembersApi(projectId, pmPendingMembers, user?.id || null);
    showMessage(`成員名單已更新（新增 ${result.added} 位、移除 ${result.removed} 位）。`);
    renderPmAuditLog(projectId);
  } catch (err) {
    alert('儲存失敗：' + err.message);
  }
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
      await supabase.from('projects').update({
        remaining_budget: newRemaining,
        department_id: newDeptInput.value || null
      }).eq('id', id);
    } else {
      await supabase.from('projects').update({ department_id: newDeptInput.value || null }).eq('id', id);
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

    // 管理員和會計可以看到全公司總覽
    if (['accounting', 'admin'].includes(userRole)) {
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
    } else if (['accounting', 'admin'].includes(userRole)) {
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
        renderTransactionTable();
        renderReports();
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
  const userRole = state.currentUser?.role;  let query = supabase.from('projects').select('*').order('project_code');
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
            ${l.reject_reason ? `<div class="tl-note">${l.reject_reason}</div>` : ''}
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
          .eq('id', projectId)
          ;
      }
    }

    // 3. 寫入審批流歷程檔案日誌
    await supabase.from('voucher_workflow_logs').insert([{
      voucher_id: voucherId,
      actor_id: state.currentUser?.id,
      action: 'recall',
      from_status: 'pending_review',
      to_status: 'voided',
      reject_reason: '使用者手動撤銷與辦理銷案',    }]);

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

window.accountingApproveAndClose = async (voucherId) => {
  // 防止連點：找到觸發此動作的按鈕並立即鎖住，避免同一張單據被重複歸帳（重複寫入分錄/銀行流水）。
  const triggerBtn = document.querySelector(`button[onclick="accountingApproveAndClose('${voucherId}')"]`);
  if (triggerBtn) {
    if (triggerBtn.disabled) return;
    triggerBtn.disabled = true;
    triggerBtn.dataset.originalLabel = triggerBtn.textContent;
    triggerBtn.textContent = '處理中...';
  }

  const accountCode = document.getElementById('reviewAccountCode')?.value;
  const bankAccountId = document.getElementById('reviewBankAccount')?.value;
  const note = document.getElementById('reviewNote')?.value.trim();

  if (!accountCode) { alert('請選擇歸帳科目'); if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset.originalLabel; } return; }
  if (!bankAccountId) { alert('請選擇付款銀行帳戶'); if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset.originalLabel; } return; }

  // 勾稽核對：明細金額、發票金額、科目有效性
  const passedVerification = await confirmCrossVerification(voucherId, accountCode);
  if (!passedVerification) { if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset.originalLabel; } return; }

  try {
    // 補上還沒被歸類科目的明細列
    await supabase.from('voucher_lines').update({ account_code: accountCode }).eq('voucher_id', voucherId).is('account_code', null);

    const { data: voucher, error: vErr } = await supabase.from('vouchers').select('*').eq('id', voucherId).single();
    if (vErr) throw vErr;

    // 1. 核准（狀態轉為 approved + 扣除專案預算）
    await accountingApprove(voucher);

    // 2. 歸帳並付款銷案：統一交給 closeVoucherByAccounting 處理，
    //    這個函式會正確寫入「借：所選費用科目／貸：銀行存款(1102)」的雙分錄到 journal_entries，
    //    並寫入銀行流水、voucher_payments，最後把單據狀態轉為 closed。
    const closeResult = await closeVoucherByAccounting(
      voucherId,
      accountCode,
      bankAccountId,
      new Date().toISOString().slice(0, 10)
    );
    if (!closeResult.success) throw new Error(closeResult.error);

    if (note) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('voucher_workflow_logs').insert({
        voucher_id: voucherId, actor_id: user.id, action: 'close', from_status: 'approved', to_status: 'closed', reject_reason: note,      });
    }

    // 通知受款人款項已匯出（Email，若受款人未登記信箱或寄送失敗都不影響歸帳結果，僅記錄於 console）
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const notifyRes = await fetch('/api/notify-payee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ voucherId })
      });
      const notifyResult = await notifyRes.json();
      if (notifyResult.sentCount > 0) {
        showMessage(`已核准並完成歸帳，並寄出 ${notifyResult.sentCount} 封受款人通知信。`);
      } else {
        showMessage('已核准並完成歸帳。');
      }
    } catch (notifyErr) {
      console.warn('受款人通知信寄送失敗（不影響歸帳結果）：', notifyErr.message);
      showMessage('已核准並完成歸帳。');
    }

    document.querySelector('.modal-backdrop')?.remove();
    renderVoucherWorkflowList();
    renderDashboard();
  } catch (err) {
    alert('歸帳失敗：' + err.message);
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

    // 取得銀行帳戶與會計科目
    const { data: banks } = await supabase.from('bank_accounts').select('*');
    const { data: accounts } = await supabase.from('accounts').select('*').order('code');
    // 或者使用: const accounts = window.__cachedAccounts || [];

    let html = `
      <div class="modal-backdrop" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center;">
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
          <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
            <select id="reviewAccountCode" style="flex:1; padding:8px;">
              <option value="">請選擇歸帳科目...</option>
              ${accounts.map(acc => `
                <option value="${acc.code}">${acc.code} ${acc.name}</option>
              `).join('')}
            </select>
            <button type="button" onclick="suggestAccountCodeAI('${voucherId}', 'reviewAccountCode')" style="white-space:nowrap; padding:8px 12px;">✨ AI建議科目</button>
          </div>
          <div id="aiSuggestExplain_reviewAccountCode" class="ai-suggest-box"></div>

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

/**
 * 呼叫 /api/classify，依單據內容取得 AI（或關鍵字規則）建議的會計科目，並自動帶入指定的下拉選單
 */
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

    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
      body: JSON.stringify({ description, vendor, amount: voucher.total_amount })
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.message || 'AI 建議失敗');

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
  try {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*, voucher_lines(*)')
      .eq('id', voucherId)
      .single();
    if (!voucher) return alert('找不到單據');

    const { data: banks } = await supabase.from('bank_accounts').select('*');
    const { data: accounts } = await supabase.from('accounts').select('*').order('code');

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
              <option value="">請選擇歸帳科目...</option>
              ${(accounts || []).map(acc => `
                <option value="${acc.code}" ${acc.code === existingCode ? 'selected' : ''}>${acc.code} ${acc.name}</option>
              `).join('')}
            </select>
            <button type="button" onclick="suggestAccountCodeAI('${voucherId}', 'closeAccountCode')" style="white-space:nowrap; padding:8px 12px;">✨ AI建議科目</button>
          </div>
          <div id="aiSuggestExplain_closeAccountCode" class="ai-suggest-box"></div>

          <label>付款銀行帳戶：</label>
          <select id="closeBankAccountId" style="width:100%; padding:8px; margin:8px 0;">
            <option value="">請選擇付款銀行帳戶...</option>
            ${(banks || []).map(b => `<option value="${b.id}">${b.nickname || b.bank_name}</option>`).join('')}
          </select>

          <div style="margin-top:20px; text-align:right;">
            <button onclick="confirmCloseVoucher('${voucherId}')" class="primary-btn">確認付款並銷案</button>
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
  const accountCode = document.getElementById('closeAccountCode')?.value;
  const bankAccountId = document.getElementById('closeBankAccountId')?.value;

  if (!accountCode) { alert('請選擇歸帳科目'); return; }
  if (!bankAccountId) { alert('請選擇付款銀行帳戶'); return; }

  // 勾稽核對：明細金額、發票金額、科目有效性（內含警告時的確認對話框）
  const passedVerification = await confirmCrossVerification(voucherId, accountCode);
  if (!passedVerification) return;
  if (!confirm('確定要執行付款並將此單據「銷案」嗎？')) return;

  try {
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
  deptSelect.innerHTML = departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
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
 * 檔案來源: netlify/scripts/ui.js
 */
async function renderFinancialCenter() {
  const container = document.getElementById('dashboardContainer') || document.getElementById('mainContent') || document.getElementById('dashboard');
  if (!container) return;

  const user = state.currentUser || JSON.parse(localStorage.getItem('currentUser') || '{}');
  const isPrivileged = ['admin', 'accounting'].includes(user.role);

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
  const accountId = document.getElementById(`acc-${voucherId}`)?.value;
  const bankId = document.getElementById(`bank-${voucherId}`)?.value;

  if (!accountId || !bankId) {
    alert('請先指定會計科目與付款銀行');
    return;
  }
  if (!confirm(`確定付款結案？金額 $${Number(totalAmount).toLocaleString()}`)) return;

  try {    const today = new Date().toISOString().split('T')[0];
    const user = state.currentUser;
    const { data: voucher, error: vErr } = await supabase
      .from('vouchers')
      .select('project_id, status, voucher_no, summary')
      .eq('id', voucherId)
      
      .single();
    if (vErr) throw vErr;
    if (voucher.status !== 'approved') throw new Error('僅「已核准待付款」可結案');

    // 1. 扣專案預算
    if (voucher.project_id) {
      const { data: proj } = await supabase
        .from('projects')
        .select('remaining_budget')
        .eq('id', voucher.project_id)
        
        .single();
      if (proj) {
        await supabase
          .from('projects')
          .update({
            remaining_budget: Math.max(0, Number(proj.remaining_budget || 0) - Number(totalAmount))
          })
          .eq('id', voucher.project_id)
          ;
      }
    }

    // 2. 銀行流水
    await supabase.from('bank_transactions').insert({
      bank_account_id: bankId,
      tx_date: today,
      type: '支出',
      amount: totalAmount,
      voucher_id: voucherId,
      description: `報支撥款 ${voucher.voucher_no || voucherId}`
      ,    });

    // 3. 會計分錄：借記所選費用科目，貸記銀行存款 (1102)
    const { data: bankLedgerAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('code', '1102')
      .single();

    await supabase.from('journal_entries').insert({
      entry_date: today,
      debit_account_id: accountId,
      credit_account_id: bankLedgerAccount?.id || null,
      debit_amount: totalAmount,
      credit_amount: totalAmount,
      memo: `報支結案：${voucher.summary || voucher.voucher_no}`,
      voucher_id: voucherId
      ,    });

    // 4. 狀態改 closed
    await supabase
      .from('vouchers')
      .update({ 
        status: 'closed', 
        closed_at: new Date().toISOString() 
      })
      .eq('id', voucherId)
      ;

    alert('付款結案成功！');

    // 5. 寫歷程
    await supabase.from('voucher_workflow_logs').insert({
      voucher_id: voucherId,
      actor_id: user?.id,
      action: 'close',
      from_status: 'approved',
      to_status: 'closed',    });

   // 重新渲染畫面
    if (typeof renderFinancialCenter === 'function') renderFinancialCenter();
    if (typeof renderDashboard === 'function') renderDashboard();

  } catch (err) {
    console.error(err);
    alert(`付款結案失敗：${err.message}`);
  }
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

document.addEventListener('DOMContentLoaded', () => {
  const projectForm = document.getElementById('projectForm');
  
  if (projectForm) {
    projectForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // 防止網頁重新整理

      // 取得表單欄位數值
      const name = document.getElementById('projectName').value.trim();
      const startDate = document.getElementById('projectStart').value;
      const endDate = document.getElementById('projectEnd').value;
      const departmentId = document.getElementById('projectDepartment').value;
      const totalBudget = parseFloat(document.getElementById('projectTotalBudget').value);

      if (!name || isNaN(totalBudget)) {
        alert('請填寫完整的專案名稱與總預算！');
        return;
      }

      try {
        // 呼叫 budget.js 的建立專案 API
        await createProject({
          name: name,
          start_date: startDate || null,
          end_date: endDate || null,
          department_id: departmentId || null,
          total_budget: totalBudget
        });

        alert('專案建立成功！');
        projectForm.reset(); // 清空表單輸入框
        
        // 重新渲染專案列表（更新右側清單）
        if (typeof window.renderProjectList === 'function') {
          window.renderProjectList();
        }
      } catch (error) {
        console.error('建立專案失敗：', error);
        alert('建立專案失敗：' + (error.message || '未知錯誤'));
      }
    });
  }
});

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
    const isAdminOrAccounting = ['admin', 'accounting'].includes(state.currentUser?.role);
    
    if (isAdminOrAccounting) {
      const { data: pData } = await supabase.from('projects').select('id, name, project_code');
      projectsData = pData || [];
    } else {
      const { data: userProjs } = await supabase.from('user_projects').select('project_id').eq('user_id', state.currentUser?.id);
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
                  ${(depts || []).map(d => `<option value="${d.id}" ${d.id === vch.department_id ? 'selected' : ''}>${d.name}</option>`).join('')}
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
                        <input type="text" class="grid-payee-id" value="${l.payee_identifier || ''}" placeholder="身分證/統編" style="width:90%; padding:4px;" onblur="fetchPayeeName(this)">
                        <span class="grid-payee-name" style="font-size:12px; color:#666; display:block;">${l.payee_name || ''}</span>
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
                      <input type="text" class="grid-payee-id" placeholder="身分證/統編" style="width:90%; padding:4px;" onblur="fetchPayeeName(this)">
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
      <input type="text" class="grid-payee-id" placeholder="身分證/統編" style="width:90%; padding:4px;" onblur="fetchPayeeName(this)">
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

  rows.forEach(row => {
    const month = row.querySelector('.grid-month').value;
    const invType = row.querySelector('.grid-inv-type').value;
    const invNum = row.querySelector('.grid-inv-num').value.trim();
    const categorySelect = row.querySelector('.grid-item-category').value;
    const categoryNote = row.querySelector('.grid-category-note').value.trim();
    const description = categorySelect === '其他' ? (categoryNote || '其他') : categorySelect;
    const amount = Number(row.querySelector('.grid-amount').value) || 0;
    const payeeId = row.querySelector('.grid-payee-id').value.trim();
    const payeeName = row.querySelector('.grid-payee-name')?.innerText || '';

    totalAmount += amount;

    newLines.push({
      receipt_month: month,
      description: description,
      item_category: categorySelect,
      item_category_note: categoryNote,
      amount: amount,
      payee_identifier: payeeId,
      payee_name: payeeName.includes('查無') ? null : payeeName
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
  const company = state.companyInfo || {};
  
  const setVal = (id, val) => {
  // 在 Tab 切換事件內加入這一段：
  if (tab === 'settings') {
    initCompanyInfoForm(); // 確保每次切過來時，輸入框都有最新資料
    
    // 同步帶入密碼設定區塊的登入帳號
    const emailInput = document.getElementById('passwordUserEmail');
    if (emailInput && state.currentUser) {
      emailInput.value = state.currentUser.email || '';
    }
  }  
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };

  setVal('companyNameZh', company.companyNameZh);
  setVal('companyNameEn', company.companyNameEn);
  setVal('companyTaxId', company.taxId);
  setVal('companyPhone', company.phone);
  setVal('companyAddress', company.address);
  setVal('companyRepresentative', company.representativeName);
  setVal('companyBoardCount', company.boardCount);
  setVal('companyTotalCapital', company.totalCapital);
  setVal('companyOpenDate', company.plannedOpenDate);
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

// 假設這段是在初始化 Navigation Bar 或 Header
async function renderHeader(user) {
  // 版本號顯示（固定）
  const VERSION_LABEL = 'Demo v2.9.8';
  const versionHTML = `<span id="versionLabel" style="margin-left:12px; color:#666; font-size:12px;">${VERSION_LABEL}</span>`;

  document.getElementById('header-user-info').innerHTML = `
    <span>歡迎，${user.name}</span>
    ${versionHTML}
  `;
}

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