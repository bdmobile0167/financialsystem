import { supabase } from '../../../scripts/supabaseClient.js';

const STATUS_LABELS = {
  pending_review: '待主管審核',
  pending_accounting: '待會計複核',
  approved: '待付款',
  closed: '已結案',
  manager_rejected: '主管退件',
  accounting_rejected: '會計退件',
  voided: '已作廢'
};

const ROLE_LABELS = {
  admin: '系統管理員',
  super_admin: '超級管理員',
  accounting: '會計部門',
  manager: '部門主管',
  employee: '一般員工'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(value) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
}

function statusBadge(status) {
  const safeStatus = escapeHtml(status || 'unknown');
  return `<span class="dashboard-status dashboard-status-${safeStatus}">${escapeHtml(STATUS_LABELS[status] || status || '未知')}</span>`;
}

function metricCard(label, value, detail, tone = 'blue') {
  return `
    <article class="dashboard-metric dashboard-metric-${tone}">
      <span class="dashboard-metric-label">${escapeHtml(label)}</span>
      <strong class="dashboard-metric-value">${escapeHtml(value)}</strong>
      <span class="dashboard-metric-detail">${escapeHtml(detail)}</span>
    </article>
  `;
}

function navigateTo(tabId) {
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.click();
}

function bindDashboardNavigation(container) {
  container.querySelectorAll('[data-dashboard-tab]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.dashboardTab));
  });
}

export async function renderDashboard() {
  const container = document.getElementById('dashboardContainer') || document.getElementById('dashboard');
  if (!container) return;

  const user = window.state?.currentUser;
  if (!user?.id) {
    container.innerHTML = '<p class="muted">請先登入。</p>';
    return;
  }

  const role = user.role || 'employee';
  const isPrivileged = ['admin', 'super_admin', 'accounting'].includes(role);
  const isEmployee = role === 'employee';
  const selectedProjectId = window.state?.currentProjectId || 'all';

  container.innerHTML = '<div class="dashboard-loading" role="status">正在載入財務總覽...</div>';

  try {
    let voucherQuery = supabase
      .from('vouchers')
      .select('id, voucher_no, applicant_id, department_id, project_id, summary, total_amount, status, created_at, tx_date, profiles!applicant_id(full_name), departments(name)')
      .order('created_at', { ascending: false });

    let projectQuery = supabase
      .from('projects')
      .select('id, name, project_code, total_budget, remaining_budget, department_id')
      .order('name');

    if (!isPrivileged && user.department_id) {
      voucherQuery = voucherQuery.eq('department_id', user.department_id);
      projectQuery = projectQuery.eq('department_id', user.department_id);
    }

    const [{ data: voucherRows, error: voucherError }, { data: projectRows, error: projectError }] = await Promise.all([
      voucherQuery,
      projectQuery
    ]);

    if (voucherError) throw voucherError;
    if (projectError) throw projectError;

    const projects = projectRows || [];
    const vouchers = voucherRows || [];
    const visibleProjects = selectedProjectId === 'all'
      ? projects
      : projects.filter(project => project.id === selectedProjectId);
    const visibleVouchers = selectedProjectId === 'all'
      ? vouchers
      : vouchers.filter(voucher => voucher.project_id === selectedProjectId);
    const projectNames = new Map(projects.map(project => [project.id, project.name]));

    const totalBudget = visibleProjects.reduce((sum, project) => sum + Number(project.total_budget || 0), 0);
    const totalSpent = visibleVouchers
      .filter(voucher => ['pending_accounting', 'approved', 'closed'].includes(voucher.status))
      .reduce((sum, voucher) => sum + Number(voucher.total_amount || 0), 0);
    const totalRemaining = Math.max(0, totalBudget - totalSpent);
    const pendingReview = visibleVouchers.filter(voucher => voucher.status === 'pending_review').length;
    const pendingAccounting = visibleVouchers.filter(voucher => voucher.status === 'pending_accounting').length;
    const pendingPayment = visibleVouchers.filter(voucher => voucher.status === 'approved').length;
    const rejectedCount = visibleVouchers.filter(voucher => ['manager_rejected', 'accounting_rejected'].includes(voucher.status)).length;

    const myVouchers = vouchers.filter(voucher => voucher.applicant_id === user.id);
    const myPendingCount = myVouchers.filter(voucher => ['pending_review', 'pending_accounting'].includes(voucher.status)).length;
    const myCompletedCount = myVouchers.filter(voucher => ['approved', 'closed'].includes(voucher.status)).length;

    const metrics = isEmployee
      ? [
          metricCard('獲授權專案總預算', formatMoney(totalBudget), `參與專案 ${visibleProjects.length} 個`, 'blue'),
          metricCard('專案累計已動支', formatMoney(totalSpent), `預算執行率 ${totalBudget ? Math.round(totalSpent / totalBudget * 100) : 0}%`, 'teal'),
          metricCard('個人待審單據', `${myPendingCount} 筆`, '主管或會計審核中', 'amber'),
          metricCard('個人完成單據', `${myCompletedCount} 筆`, '已核准或完成過帳', 'green')
        ]
      : [
          metricCard(`${isPrivileged && selectedProjectId === 'all' ? '全公司' : '範圍內'}專案預算`, formatMoney(totalBudget), `專案 ${visibleProjects.length} 個`, 'blue'),
          metricCard('已使用／剩餘預算', formatMoney(totalSpent), `剩餘 ${formatMoney(totalRemaining)}`, 'teal'),
          metricCard('待審核單據', `${pendingReview + pendingAccounting} 筆`, `主管 ${pendingReview} 筆，會計 ${pendingAccounting} 筆`, 'amber'),
          metricCard('待付款／退件', `${pendingPayment} 筆`, `退件 ${rejectedCount} 筆`, 'rose')
        ];

    const accessibleVouchers = isEmployee ? myVouchers : visibleVouchers;
    const voucherList = accessibleVouchers.length
      ? accessibleVouchers.slice(0, 5).map(voucher => `
          <li class="dashboard-list-row">
            <div class="dashboard-list-main">
              <div class="dashboard-list-title">
                <span class="dashboard-code">${escapeHtml(voucher.voucher_no || '未編號')}</span>
                <strong>${escapeHtml(voucher.summary || '未填摘要')}</strong>
              </div>
              <span class="dashboard-list-meta">${escapeHtml(voucher.profiles?.full_name || '未指定申請人')} · ${escapeHtml(voucher.departments?.name || '未指定部門')} · ${escapeHtml(projectNames.get(voucher.project_id) || '未指定專案')}</span>
            </div>
            <div class="dashboard-list-aside">
              <strong>${escapeHtml(formatMoney(voucher.total_amount))}</strong>
              ${statusBadge(voucher.status)}
            </div>
          </li>
        `).join('')
      : '<li class="dashboard-empty">目前尚無相關單據。</li>';

    const projectList = visibleProjects.length
      ? visibleProjects.slice(0, 6).map(project => {
          const spent = visibleVouchers
            .filter(voucher => voucher.project_id === project.id && ['approved', 'closed'].includes(voucher.status))
            .reduce((sum, voucher) => sum + Number(voucher.total_amount || 0), 0);
          const budget = Number(project.total_budget || 0);
          const percent = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
          const tone = percent > 90 ? 'danger' : percent > 70 ? 'warning' : 'normal';
          return `
            <li class="dashboard-project-row">
              <div class="dashboard-project-heading">
                <strong>${escapeHtml(project.name)}</strong>
                <span>${escapeHtml(project.project_code || project.id)}</span>
              </div>
              <div class="dashboard-project-values"><span>已用 ${escapeHtml(formatMoney(spent))}</span><span>${percent}%</span></div>
              <div class="dashboard-progress" aria-label="預算使用 ${percent}%"><span class="dashboard-progress-${tone}" style="width:${percent}%"></span></div>
            </li>
          `;
        }).join('')
      : '<li class="dashboard-empty">目前沒有可檢視的專案。</li>';

    container.innerHTML = `
      <div class="dashboard-overview">
        <section class="dashboard-hero">
          <div class="dashboard-hero-main">
            <span class="dashboard-role">目前角色：${escapeHtml(user.name || user.full_name || user.email || '使用者')}（${escapeHtml(ROLE_LABELS[role] || role)}）</span>
            <h1>IFRS 智慧財務報表與憑證稽核中心</h1>
            <p>${isEmployee ? '填報專案費用、追蹤主管與會計審核進度，並查看個人憑證狀態。' : '集中掌握單據簽核、會計過帳、專案預算與財務報表狀態。'}</p>
          </div>
          <div class="dashboard-actions">
            <button type="button" class="dashboard-action dashboard-action-primary" data-dashboard-tab="voucherWorkflow">新增費用單據</button>
            ${isEmployee ? '' : '<button type="button" class="dashboard-action" data-dashboard-tab="reports">查看 IFRS 報表</button>'}
          </div>
          <ol class="dashboard-workflow" aria-label="報支簽核流程">
            <li><span>1</span><div><strong>員工送出</strong><small>發票與收據登錄</small></div></li>
            <li><span>2</span><div><strong>主管審核</strong><small>專案業務核准</small></div></li>
            <li><span>3</span><div><strong>會計複核</strong><small>稅額與科目覆核</small></div></li>
            <li><span>4</span><div><strong>過帳勾稽</strong><small>分錄與付款完成</small></div></li>
          </ol>
        </section>

        <section class="dashboard-metrics" aria-label="財務指標">${metrics.join('')}</section>

        <div class="dashboard-content-grid">
          <section class="dashboard-card dashboard-card-wide">
            <header class="dashboard-card-header">
              <div><span class="dashboard-eyebrow">WORKFLOW</span><h2>單據簽核狀態</h2></div>
              <button type="button" class="dashboard-link" data-dashboard-tab="voucherWorkflow">進入簽核中心</button>
            </header>
            <ul class="dashboard-list">${voucherList}</ul>
          </section>

          <section class="dashboard-card">
            <header class="dashboard-card-header">
              <div><span class="dashboard-eyebrow">BUDGET</span><h2>專案預算</h2></div>
              <button type="button" class="dashboard-link" data-dashboard-tab="budget">專案詳情</button>
            </header>
            <ul class="dashboard-project-list">${projectList}</ul>
          </section>

          <section class="dashboard-card dashboard-card-wide dashboard-audit-note">
            <span class="dashboard-eyebrow">CONTROL</span>
            <h2>會計憑證與勾稽原則</h2>
            <p>正式財報以總帳分錄為唯一來源；銀行實際餘額僅供勾稽與差異警示，不會直接改寫財務報表。</p>
          </section>

          <section class="dashboard-card dashboard-security-note">
            <span class="dashboard-eyebrow">ACCESS</span>
            <h2>權限與稽核</h2>
            <p>專案、預算及會計分錄依角色與部門控管，高風險異動均應保留稽核紀錄。</p>
          </section>
        </div>
      </div>
    `;

    bindDashboardNavigation(container);
  } catch (error) {
    console.error('Dashboard 載入失敗:', error);
    container.innerHTML = `<div class="message error">Dashboard 載入失敗：${escapeHtml(error.message)}</div>`;
  }
}
