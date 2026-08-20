export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.style.cssText = `
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
    max-width: 350px;
  `;
  toast.style.backgroundColor = type === 'error' ? '#ef4444' : (type === 'warning' ? '#f59e0b' : '#10b981');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function showMessage(text, isError = false) {
  const el = document.getElementById('loginMessage') || document.getElementById('inviteResultBox') || document.getElementById('forcePasswordMessage');
  if (!el) {
    showToast(text, isError ? 'error' : 'success');
    return;
  }
  el.className = `message ${isError ? 'error' : 'success'}`;
  el.textContent = text;
  el.style.display = 'block';
}

export function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

export function getBankNickname(bankAccountId, accounts = []) {
  const account = accounts.find(a => a.id === bankAccountId);
  return account ? (account.nickname || account.bank_name || account.account_number || '-') : '未設定';
}

export function populateBankSelect(selectEl, accounts = []) {
  if (!selectEl) return;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    selectEl.innerHTML = '<option value="">尚未建立銀行帳戶</option>';
    return;
  }
  selectEl.innerHTML = accounts
    .map(a => `<option value="${a.id}">${a.nickname || a.bank_name || a.account_number || '銀行帳戶'}</option>`)
    .join('');
}

export function maskPersonName(name, identifier) {
  if (!name) return '';
  if (identifier && identifier.length === 8 && !Number.isNaN(Number(identifier))) return name;
  if (name.length === 2) return name[0] + 'O';
  if (name.length === 3) return name[0] + 'O' + name[2];
  if (name.length >= 4) return name[0] + 'O' + name.slice(2);
  return name;
}

export function maskIdentifierString(identifier) {
  if (!identifier) return '';
  if (identifier.length === 8 && !Number.isNaN(Number(identifier))) return identifier;
  if (identifier.length >= 10) return identifier.substring(0, 4) + '****' + identifier.substring(identifier.length - 3);
  return identifier;
}

export function maskPayeeName(name) {
  if (!name) return '';
  const len = name.length;
  if (len <= 1) return name;
  if (len === 2) return name[0] + 'O';
  return name[0] + 'O'.repeat(len - 2) + name[len - 1];
}

export const STATUS_LABELS = {
  pending_review: '待主管審核',
  manager_rejected: '主管退件',
  pending_accounting: '待會計審核',
  accounting_rejected: '會計退件',
  approved: '已核准待付款',
  closed: '已付款結案',
  cancelled: '已取消'
};

export function getStatusBadge(status) {
  const label = STATUS_LABELS[status] || status || '未知';
  const className = {
    pending_review: 'warning',
    pending_accounting: 'warning',
    approved: 'success',
    manager_rejected: 'danger',
    accounting_rejected: 'danger',
    closed: 'secondary',
    cancelled: 'secondary'
  }[status] || 'secondary';
  return `<span class="badge ${className}" style="padding:2px 8px; border-radius:12px; font-size:12px;">${label}</span>`;
}

export const ROLE_LABELS = {
  admin: '管理員',
  accounting: '會計部門',
  manager: '部門主管',
  employee: '一般專員'
};

const WORKFLOW_STEPS = [
  { key: 'submit', label: '提交申請' },
  { key: 'manager', label: '主管審核' },
  { key: 'accounting', label: '會計審核' },
  { key: 'closed', label: '付款結案' }
];

function getWorkflowStepStates(status) {
  return {
    pending_review: ['done', 'current', 'pending', 'pending'],
    manager_rejected: ['done', 'rejected', 'pending', 'pending'],
    pending_accounting: ['done', 'done', 'current', 'pending'],
    accounting_rejected: ['done', 'done', 'rejected', 'pending'],
    approved: ['done', 'done', 'done', 'current'],
    closed: ['done', 'done', 'done', 'done']
  }[status] || ['done', 'pending', 'pending', 'pending'];
}

function getStepStyle(state) {
  switch (state) {
    case 'done': return 'background:#dcfce7; color:#166534;';
    case 'current': return 'background:#dbeafe; color:#1d4ed8;';
    case 'rejected': return 'background:#fee2e2; color:#991b1b;';
    default: return 'background:#f1f5f9; color:#94a3b8;';
  }
}

export function buildApprovalStepperHtml(status) {
  if (status === 'cancelled') return '<div class="badge secondary" style="padding:6px 12px;">已取消</div>';
  const stepStates = getWorkflowStepStates(status);
  return `
    <ul class="approval-stepper" style="display:flex; gap:8px; list-style:none; padding:0; margin:12px 0; flex-wrap:wrap;">
      ${WORKFLOW_STEPS.map((step, index) => {
        const state = stepStates[index];
        const mark = state === 'done' ? '✓' : (state === 'rejected' ? '!' : index + 1);
        return `
          <li class="${state}" style="display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:20px; font-size:12px; font-weight:600; ${getStepStyle(state)}">
            <span class="step-dot" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">${mark}</span>
            ${step.label}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

export function buildMiniStepperDots(status) {
  if (status === 'cancelled') return '<span class="muted" style="font-size:11px;">已取消</span>';
  const stepStates = getWorkflowStepStates(status);
  const colorOf = state => state === 'done' ? '#10b981' : (state === 'current' ? '#3b82f6' : (state === 'rejected' ? '#ef4444' : '#cbd5e1'));
  return `<span style="display:inline-flex; gap:4px; align-items:center;" title="提交、主管、會計、付款">
    ${stepStates.map(state => `<span style="width:8px; height:8px; border-radius:50%; background:${colorOf(state)}; display:inline-block;"></span>`).join('')}
  </span>`;
}

export function formatTwd(n) {
  return `NT$ ${Math.round(Number(n || 0)).toLocaleString()}`;
}

export function downloadJsonFile(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isAccountingOrAdmin(user) {
  return ['accounting', 'admin', 'super_admin'].includes(user?.role) || user?.department === '財務部' || user?.department_name === '財務部';
}

function hasPermission(user, permissionKey) {
  if (!user) return false;
  if (isAccountingOrAdmin(user)) return true;
  return user.permissions?.[permissionKey] === true;
}

function setTabVisible(tab, visible) {
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => {
    el.style.display = visible ? '' : 'none';
  });
}

export function updateAdminNavVisibility() {
  const user = window.state?.currentUser;
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const canManageUsers = isAdmin || hasPermission(user, 'canManageUsers');
  const adminUsersBtn = document.getElementById('adminUsersNavBtn');
  const userManagementBtn = document.getElementById('userManagementNavBtn');
  if (adminUsersBtn) adminUsersBtn.style.display = canManageUsers ? '' : 'none';
  if (userManagementBtn) userManagementBtn.style.display = canManageUsers ? '' : 'none';
}

export function applyRoleBasedTabVisibility() {
  const user = window.state?.currentUser;
  const canFinance = hasPermission(user, 'canViewFinancials');
  const canReports = hasPermission(user, 'canViewReports') || canFinance;
  const canBank = hasPermission(user, 'canViewBankAccounts');
  const canReconcile = hasPermission(user, 'canReconcileBank') || canBank;
  const canProjects = hasPermission(user, 'canManageProjects');
  const canLedger = hasPermission(user, 'canViewJournalLedger');
  const canVouchers = hasPermission(user, 'canViewVouchers') || canProjects;

  setTabVisible('transactions', canLedger || canFinance);
  setTabVisible('bankAccounts', canBank);
  setTabVisible('bankReconcile', canReconcile);
  setTabVisible('budget', canProjects);
  setTabVisible('reports', canReports);
  setTabVisible('equity', canReports);
  setTabVisible('auditTrail', canLedger || canFinance);
  setTabVisible('voucherCenter', canVouchers || canFinance);
}

export function safeListener(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

const actionLocks = new Set();

export async function withActionLock(actionKey, button, asyncFn, options = {}) {
  const key = actionKey || 'default-action';
  if (actionLocks.has(key)) return null;
  actionLocks.add(key);

  const btn = button || null;
  const originalText = btn ? btn.textContent : '';
  const loadingText = options.loadingText || '處理中...';

  if (btn) {
    btn.disabled = true;
    btn.dataset.processing = '1';
    if (loadingText) btn.textContent = loadingText;
  }

  try {
    return await asyncFn();
  } finally {
    actionLocks.delete(key);
    if (btn) {
      btn.disabled = false;
      btn.dataset.processing = '0';
      if (loadingText) btn.textContent = originalText;
    }
  }
}

export function closeSidebar() {
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  sidebarEl?.classList.remove('open');
  sidebarOverlay?.classList.remove('open');
  menuToggleBtn?.classList.remove('open');
  menuToggleBtn?.setAttribute('aria-expanded', 'false');
}

export function openSidebar() {
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  sidebarEl?.classList.add('open');
  sidebarOverlay?.classList.add('open');
  menuToggleBtn?.classList.add('open');
  menuToggleBtn?.setAttribute('aria-expanded', 'true');
}

export function toggleSidebar() {
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl?.classList.contains('open')) closeSidebar();
  else openSidebar();
}
