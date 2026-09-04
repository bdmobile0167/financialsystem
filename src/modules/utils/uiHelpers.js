import { userHasPermission } from './permissions.js';

export const STATUS_LABELS = {
  pending_review: '\u5f85\u4e3b\u7ba1\u5be9\u6838',
  manager_rejected: '\u4e3b\u7ba1\u9000\u56de',
  pending_accounting: '\u5f85\u6703\u8a08\u6838\u51c6',
  accounting_rejected: '\u6703\u8a08\u9000\u56de',
  approved: '\u5f85\u4ed8\u6b3e',
  closed: '\u5df2\u92b7\u5e33',
  paid: '\u5df2\u4ed8\u6b3e',
  voided: '\u5df2\u4f5c\u5ee2',
  cancelled: '\u5df2\u64a4\u92b7'
};

export const ROLE_LABELS = {
  super_admin: '\u8d85\u7d1a\u7ba1\u7406\u54e1',
  admin: '\u7ba1\u7406\u54e1',
  accounting: '\u6703\u8a08',
  manager: '\u4e3b\u7ba1',
  employee: '\u4e00\u822c\u54e1\u5de5'
};

const WORKFLOW_STEPS = [
  { key: 'submit', label: '\u9001\u51fa\u7533\u8acb' },
  { key: 'manager', label: '\u4e3b\u7ba1\u6838\u51c6' },
  { key: 'accounting', label: '\u6703\u8a08\u6838\u51c6' },
  { key: 'closed', label: '\u4ed8\u6b3e\u92b7\u5e33' }
];

const WORKFLOW_STATE_BY_STATUS = {
  pending_review: ['done', 'current', 'pending', 'pending'],
  manager_rejected: ['done', 'rejected', 'pending', 'pending'],
  pending_accounting: ['done', 'done', 'current', 'pending'],
  accounting_rejected: ['done', 'done', 'rejected', 'pending'],
  approved: ['done', 'done', 'done', 'current'],
  closed: ['done', 'done', 'done', 'done'],
  paid: ['done', 'done', 'done', 'done'],
  voided: ['done', 'done', 'done', 'rejected'],
  cancelled: ['done', 'rejected', 'pending', 'pending']
};

const actionLocks = new Set();

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
  toast.style.cssText = [
    'padding:12px 20px',
    'border-radius:8px',
    'color:white',
    'font-size:14px',
    'font-weight:500',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
    'max-width:350px'
  ].join(';');
  toast.style.backgroundColor = type === 'error' ? '#ef4444' : (type === 'warning' ? '#f59e0b' : '#10b981');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function showMessage(text, isError = false) {
  const element = document.getElementById('loginMessage')
    || document.getElementById('inviteResultBox')
    || document.getElementById('forcePasswordMessage');

  if (!element) {
    showToast(text, isError ? 'error' : 'success');
    return;
  }

  element.className = `message ${isError ? 'error' : 'success'}`;
  element.textContent = text;
  element.style.display = 'block';
}

export default showMessage;

export function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

export function getBankNickname(bankAccountId, accounts = []) {
  const account = (accounts || []).find((item) => item.id === bankAccountId);
  return account ? (account.nickname || account.bank_name || account.account_number || '-') : 'Unassigned bank';
}

export function populateBankSelect(selectEl, accounts = []) {
  if (!selectEl) return;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    selectEl.innerHTML = '<option value="">No bank accounts</option>';
    return;
  }

  selectEl.innerHTML = accounts
    .map((account) => `<option value="${account.id}">${account.nickname || account.bank_name || account.account_number || 'Bank account'}</option>`)
    .join('');
}

export function maskPersonName(name, identifier) {
  if (!name) return '';
  if (identifier && identifier.length === 8 && !Number.isNaN(Number(identifier))) return name;
  if (name.length === 2) return `${name[0]}O`;
  if (name.length === 3) return `${name[0]}O${name[2]}`;
  if (name.length >= 4) return `${name[0]}O${name.slice(2)}`;
  return name;
}

export function maskIdentifierString(identifier) {
  if (!identifier) return '';
  const value = String(identifier);
  if (value.length === 8 && !Number.isNaN(Number(value))) return value;
  if (value.length >= 10) return `${value.substring(0, 4)}****${value.substring(value.length - 3)}`;
  return value;
}

export function maskPayeeName(name) {
  if (!name) return '';
  const value = String(name);
  if (value.length <= 1) return value;
  if (value.length === 2) return `${value[0]}O`;
  return `${value[0]}${'O'.repeat(value.length - 2)}${value[value.length - 1]}`;
}

export function getStatusBadge(status) {
  const label = STATUS_LABELS[status] || status || 'Unknown';
  const className = {
    pending_review: 'warning',
    pending_accounting: 'warning',
    approved: 'success',
    manager_rejected: 'danger',
    accounting_rejected: 'danger',
    closed: 'secondary',
    paid: 'success',
    voided: 'secondary',
    cancelled: 'secondary'
  }[status] || 'secondary';

  return `<span class="badge ${className}" style="padding:2px 8px; border-radius:12px; font-size:12px;">${label}</span>`;
}

function getWorkflowStepStates(status) {
  return WORKFLOW_STATE_BY_STATUS[status] || ['done', 'pending', 'pending', 'pending'];
}

function getStepStyle(state) {
  switch (state) {
    case 'done':
      return 'background:#dcfce7; color:#166534;';
    case 'current':
      return 'background:#dbeafe; color:#1d4ed8;';
    case 'rejected':
      return 'background:#fee2e2; color:#991b1b;';
    default:
      return 'background:#f1f5f9; color:#64748b;';
  }
}

export function buildApprovalStepperHtml(status) {
  if (status === 'cancelled') {
    return '<div class="badge secondary" style="padding:6px 12px;">\u5df2\u64a4\u92b7</div>';
  }

  const stepStates = getWorkflowStepStates(status);
  return `
    <ul class="approval-stepper" style="display:flex; gap:8px; list-style:none; padding:0; margin:12px 0; flex-wrap:wrap;">
      ${WORKFLOW_STEPS.map((step, index) => {
        const state = stepStates[index];
        const mark = state === 'done' ? 'OK' : (state === 'rejected' ? '!' : index + 1);
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
  if (status === 'cancelled') return '<span class="muted" style="font-size:11px;">\u5df2\u64a4\u92b7</span>';
  const stepStates = getWorkflowStepStates(status);
  const colorOf = (state) => {
    if (state === 'done') return '#10b981';
    if (state === 'current') return '#3b82f6';
    if (state === 'rejected') return '#ef4444';
    return '#cbd5e1';
  };

  return `<span style="display:inline-flex; gap:4px; align-items:center;" title="\u9001\u51fa\u7533\u8acb / \u4e3b\u7ba1\u6838\u51c6 / \u6703\u8a08\u6838\u51c6 / \u4ed8\u6b3e\u92b7\u5e33">
    ${stepStates.map((state) => `<span style="width:8px; height:8px; border-radius:50%; background:${colorOf(state)}; display:inline-block;"></span>`).join('')}
  </span>`;
}

export function formatTwd(n) {
  return `NT$ ${Math.round(Number(n || 0)).toLocaleString()}`;
}

export function downloadJsonFile(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function setTabVisible(tab, visible) {
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach((element) => {
    element.style.display = visible ? '' : 'none';
  });
}

export function updateAdminNavVisibility() {
  const user = window.state?.currentUser;
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const canManageUsers = isAdmin || userHasPermission(user, 'canManageUsers');
  const adminUsersBtn = document.getElementById('adminUsersNavBtn');
  if (adminUsersBtn) adminUsersBtn.style.display = canManageUsers ? '' : 'none';
}

export function applyRoleBasedTabVisibility() {
  const user = window.state?.currentUser;
  const canFinance = userHasPermission(user, 'canViewFinancials');
  const canReports = userHasPermission(user, 'canViewReports') || canFinance;
  const canBank = userHasPermission(user, 'canViewBankAccounts');
  const canReconcile = userHasPermission(user, 'canReconcileBank') || canBank;
  const canProjects = userHasPermission(user, 'canManageProjects');
  const canLedger = userHasPermission(user, 'canViewJournalLedger');
  const canVouchers = userHasPermission(user, 'canViewVouchers') || canProjects;

  setTabVisible('transactions', canLedger || canFinance);
  setTabVisible('bankAccounts', canBank);
  setTabVisible('bankReconcile', canReconcile);
  setTabVisible('budget', canProjects);
  setTabVisible('reports', canReports);
  setTabVisible('equity', canReports);
  setTabVisible('auditTrail', canLedger || canFinance);
  setTabVisible('voucherCenter', canVouchers || canFinance);
  setTabVisible('adminUsers', userHasPermission(user, 'canManageUsers'));
}

export function safeListener(id, event, handler) {
  const element = document.getElementById(id);
  if (element) element.addEventListener(event, handler);
}

export async function withActionLock(actionKey, button, asyncFn, options = {}) {
  const key = actionKey || 'default-action';
  if (actionLocks.has(key)) return null;
  actionLocks.add(key);

  const originalText = button ? button.textContent : '';
  const loadingText = options.loadingText || 'Loading...';

  if (button) {
    button.disabled = true;
    button.dataset.processing = '1';
    if (loadingText) button.textContent = loadingText;
  }

  try {
    return await asyncFn();
  } finally {
    actionLocks.delete(key);
    if (button) {
      button.disabled = false;
      button.dataset.processing = '0';
      if (loadingText) button.textContent = originalText;
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

function ensureElementId(control, index) {
  if (control.id) return control.id;
  const generatedId = `auto-field-${Date.now()}-${index}`;
  control.id = generatedId;
  return generatedId;
}

export function ensureLabelAssociations(root = document) {
  if (!root?.querySelectorAll) return;

  const labels = root.querySelectorAll('label:not([for])');
  labels.forEach((label, index) => {
    const nestedControl = label.querySelector('input, select, textarea');
    if (nestedControl) {
      label.setAttribute('for', ensureElementId(nestedControl, index));
      return;
    }

    const nextControl = label.nextElementSibling?.matches?.('input, select, textarea')
      ? label.nextElementSibling
      : null;
    if (nextControl) {
      label.setAttribute('for', ensureElementId(nextControl, index));
    }
  });
}

export function observeLabelAssociations() {
  ensureLabelAssociations(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) ensureLabelAssociations(node);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
