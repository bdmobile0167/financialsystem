import { supabase } from '../../../scripts/supabaseClient.js';
import { fetchAllUsers, updateUserProfile, toggleUserActive, updateUserPermissions, getDefaultPermissions, fetchDepartments, inviteNewUser } from '../admin/adminApi.js';
import { showMessage } from '../../utils/uiHelpers.js';

const ROLE_LABELS = { admin: '系統管理員', accounting: '會計部門', manager: '部門主管', employee: '一般專員' };

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

let resetPassUserId = null;

export async function renderUserManagementView() {
  const container = document.getElementById('userManagementContainer');
  if (!container) return;
  
  const currentUser = window.state?.currentUser;
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
              class="text-white/80 hover:text-white cursor-pointer"
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