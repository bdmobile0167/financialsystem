// 通用 UI 輔助函數

// 顯示 Toast 訊息
export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-message`;
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
  
  if (type === 'error') {
    toast.style.backgroundColor = '#ef4444';
  } else if (type === 'warning') {
    toast.style.backgroundColor = '#f59e0b';
  } else {
    toast.style.backgroundColor = '#10b981';
  }
  
  toast.textContent = message;
  container.appendChild(toast);

  // 3秒後自動移除
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 顯示訊息（用於表單提交結果等）
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

// 設定文字內容
export function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

// 取得銀行帳戶暱稱
export function getBankNickname(bankAccountId, accounts = []) {
  const account = accounts.find(a => a.id === bankAccountId);
  return account ? account.nickname : '未設定';
}

// 填充銀行下拉選單
export function populateBankSelect(selectEl, accounts = []) {
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

// 智能姓名遮罩 (廠商不遮罩，個人遮罩)
export function maskPersonName(name, identifier) {
  if (!name) return '';
  if (identifier && identifier.length === 8 && !isNaN(identifier)) {
    return name;
  }
  
  if (name.length === 2) return name[0] + 'O';
  if (name.length === 3) return name[0] + 'O' + name[2];
  if (name.length >= 4) return name[0] + 'O' + name.slice(2);
  return name;
}

// 身分證字號遮罩
export function maskIdentifierString(identifier) {
  if (!identifier) return '';
  if (identifier.length === 8 && !isNaN(identifier)) {
    return identifier;
  }
  if (identifier.length >= 10) {
    return identifier.substring(0, 4) + '****' + identifier.substring(identifier.length - 3);
  }
  return identifier;
}

// 付款人姓名遮罩
export function maskPayeeName(name) {
  if (!name) return '';
  const len = name.length;
  if (len <= 1) return name;
  if (len === 2) return name[0] + 'O';
  return name[0] + 'O'.repeat(len - 2) + name[len - 1];
}

// 狀態標籤
export const STATUS_LABELS = {
  pending_review: '待主管審核',
  manager_rejected: '主管退回',
  pending_accounting: '待會計核准',
  accounting_rejected: '會計退回',
  approved: '已核准入帳',
  cancelled: '已撤銷'
};

export function getStatusBadge(status) {
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

// 角色標籤
export const ROLE_LABELS = { admin: '管理員', accounting: '會計部門', manager: '部門主管', employee: '一般專員' };

// 建立審核步驟 HTML
export function buildApprovalStepperHtml(status) {
  const steps = [
    { key: 'submit', label: '提交申請' },
    { key: 'manager', label: '主管審核' },
    { key: 'accounting', label: '會計審核' },
    { key: 'closed', label: '付款結案' }
  ];

  let stepStates = ['done', 'pending', 'pending', 'pending'];
  switch (status) {
    case 'pending_review':
      stepStates = ['done', 'current', 'pending', 'pending']; break;
    case 'manager_rejected':
      stepStates = ['done', 'rejected', 'pending', 'pending']; break;
    case 'pending_accounting':
      stepStates = ['done', 'done', 'current', 'pending']; break;
    case 'accounting_rejected':
      stepStates = ['done', 'done', 'rejected', 'pending']; break;
    case 'approved':
      stepStates = ['done', 'done', 'done', 'current']; break;
    case 'closed':
      stepStates = ['done', 'done', 'done', 'done']; break;
    case 'cancelled':
      return `<div class="badge secondary" style="padding:6px 12px;">此單據已撤銷</div>`;
    default:
      stepStates = ['done', 'pending', 'pending', 'pending'];
  }

  return `
    <ul class="approval-stepper" style="display:flex; gap:8px; list-style:none; padding:0; margin:12px 0; flex-wrap:wrap;">
      ${steps.map((s, i) => `
        <li class="${stepStates[i]}" style="display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:20px; font-size:12px; font-weight:600; ${getStepStyle(stepStates[i])}">
          <span class="step-dot" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">${stepStates[i] === 'done' ? '✓' : (stepStates[i] === 'rejected' ? '✕' : i + 1)}</span>
          ${s.label}
        </li>
      `).join('')}
    </ul>
  `;
}

function getStepStyle(state) {
  switch (state) {
    case 'done': return 'background:#dcfce7; color:#166534;';
    case 'current': return 'background:#dbeafe; color:#1d4ed8;';
    case 'rejected': return 'background:#fee2e2; color:#991b1b;';
    default: return 'background:#f1f5f9; color:#94a3b8;';
  }
}

// 迷你步驟點
export function buildMiniStepperDots(status) {
  if (status === 'cancelled') return '<span class="muted" style="font-size:11px;">已撤銷</span>';
  const stepStates = {
    pending_review: ['done', 'current', 'pending', 'pending'],
    manager_rejected: ['done', 'rejected', 'pending', 'pending'],
    pending_accounting: ['done', 'done', 'current', 'pending'],
    accounting_rejected: ['done', 'done', 'rejected', 'pending'],
    approved: ['done', 'done', 'done', 'current'],
    closed: ['done', 'done', 'done', 'done']
  }[status] || ['done', 'pending', 'pending', 'pending'];

  const colorOf = (s) => s === 'done' ? '#10b981' : (s === 'current' ? '#3b82f6' : (s === 'rejected' ? '#ef4444' : '#cbd5e1'));
  return `<span style="display:inline-flex; gap:4px; align-items:center;" title="提交→主管→會計→結案">
    ${stepStates.map(s => `<span style="width:8px; height:8px; border-radius:50%; background:${colorOf(s)}; display:inline-block;"></span>`).join('')}
  </span>`;
}

// 格式化金額
export function formatTwd(n) {
  return `NT$ ${Math.round(Number(n || 0)).toLocaleString()}`;
}

// 下載 JSON 檔案
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

// 更新管理員導航可見性
export function updateAdminNavVisibility() {
  const btn = document.getElementById('adminUsersNavBtn');
  if (btn) btn.style.display = window.state?.currentUser?.role === 'admin' ? 'block' : 'none';
}

// 套用角色基礎分頁可見性
export function applyRoleBasedTabVisibility() {
  const role = window.state?.currentUser?.role;
  const financialOnly = ['accounting', 'admin'];
  const reportsBtn = document.querySelector('[data-tab="reports"]');
  const equityBtn = document.querySelector('[data-tab="equity"]');
  const auditTrailBtn = document.querySelector('[data-tab="auditTrail"]');
  if (reportsBtn) reportsBtn.style.display = financialOnly.includes(role) ? '' : 'none';
  if (equityBtn) equityBtn.style.display = financialOnly.includes(role) ? '' : 'none';
  if (auditTrailBtn) auditTrailBtn.style.display = financialOnly.includes(role) ? '' : 'none';
}

// 安全綁定事件監聽器
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

// 關閉側邊欄
export function closeSidebar() {
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  sidebarEl?.classList.remove('open');
  sidebarOverlay?.classList.remove('open');
  menuToggleBtn?.classList.remove('open');
  menuToggleBtn?.setAttribute('aria-expanded', 'false');
}

// 開啟側邊欄
export function openSidebar() {
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  sidebarEl?.classList.add('open');
  sidebarOverlay?.classList.add('open');
  menuToggleBtn?.classList.add('open');
  menuToggleBtn?.setAttribute('aria-expanded', 'true');
}

// 切換側邊欄
export function toggleSidebar() {
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl?.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}
