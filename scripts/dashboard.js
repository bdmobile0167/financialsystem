import { supabase } from './supabaseClient.js';

/**
 * Google AI 風格卡片式 Dashboard
 * 透過 window.finance（由 ui.js 掛載）共享 state、getStatusBadge 等工具，
 * 避免循環依賴。
 */
export async function renderDashboardV2() {
  const container = document.getElementById('dashboard');
  if (!container) return;

  const fin = window.finance || {};
  const state = fin.state || {};
  const user = state.currentUser;
  if (!user || !user.id) {
    container.innerHTML = '<p class="muted">請先登入</p>';
    return;
  }

  const role = user.role;
  const isPrivileged = ['admin', 'accounting'].includes(role);
  const selectedProj = state.currentProjectId || 'all';
  const getStatusBadge = fin.getStatusBadge || ((s) => s || '-');

  try {
    // 1. 依角色抓報支單
    let voucherQuery = supabase
      .from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .order('created_at', { ascending: false });
    if (!isPrivileged && user.department_id) {
      voucherQuery = voucherQuery.eq('department_id', user.department_id);
    }
    const { data: vchs } = await voucherQuery;
    const vouchers = vchs || [];

    // 2. 依角色抓專案（預算來源）
    let projectQuery = supabase.from('projects').select('id, name, project_code, total_budget, remaining_budget, department_id');
    if (!isPrivileged && user.department_id) {
      projectQuery = projectQuery.eq('department_id', user.department_id);
    }
    const { data: projects } = await projectQuery;
    const projectList = projects || [];

    const filteredProjects = selectedProj !== 'all'
      ? projectList.filter(p => p.id === selectedProj)
      : projectList;
    const totalBudget = filteredProjects.reduce((s, p) => s + Number(p.total_budget || 0), 0);

    let displayVouchers = vouchers;
    if (selectedProj !== 'all') {
      displayVouchers = vouchers.filter(v => v.project_id === selectedProj);
    }
    const projectIds = new Set(filteredProjects.map(p => p.id));
    const totalSpent = displayVouchers
      .filter(v => (!v.project_id || projectIds.has(v.project_id)) && ['approved', 'closed', 'pending_accounting'].includes(v.status))
      .reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const totalRemaining = Math.max(0, totalBudget - totalSpent);

    // 3. 待辦數字
    const pendingReview = displayVouchers.filter(v => v.status === 'pending_review').length;
    const pendingAccounting = displayVouchers.filter(v => v.status === 'pending_accounting').length;
    const pendingPayment = displayVouchers.filter(v => v.status === 'approved').length;
    const rejectedCount = displayVouchers.filter(v => v.status === 'manager_rejected' || v.status === 'accounting_rejected').length;

    const roleLabel = role === 'admin' ? '系統管理員' : role === 'accounting' ? '會計部門' : role === 'manager' ? '部門主管' : '一般專員';
    const overviewLabel = isPrivileged && selectedProj === 'all' ? '全公司' : '範圍內';

    // ---------- 組裝畫面 ----------
    let html = `
      <!-- 深色角色橫幅 -->
      <div class="gb-dash-hero">
        <div>
          <div class="gb-dash-hero-role-tag">目前角色：${user.name || user.full_name || ''}（${roleLabel}）</div>
          <h2>智慧財務報表與憑證稽核中心</h2>
          <p>${isPrivileged
            ? '具備全權限發票與憑證即時勾稽核對、自動化會計分錄生成、專案預算稽核與 IFRS 財務報表編製。'
            : '您可填報專案費用單據、追蹤主管與會計兩階段審核進度，並查看個人專案憑證勾稽結果。'}</p>
          <div class="gb-dash-hero-actions">
            <button type="button" class="gb-dash-hero-btn primary" onclick="activateTab('voucherWorkflow')">＋ 填報新費用單據</button>
            ${isPrivileged ? '<button type="button" class="gb-dash-hero-btn secondary" onclick="activateTab(\'reports\')">查看 IFRS 報表</button>' : ''}
          </div>
        </div>
        <div class="gb-dash-steps">
          <div class="gb-dash-step"><span class="gb-step-num">1</span><div><span class="gb-step-label">員工報銷送出</span><span class="gb-step-sub">發票/收據登錄</span></div></div>
          <div class="gb-dash-step"><span class="gb-step-num">2</span><div><span class="gb-step-label">部門主管審核</span><span class="gb-step-sub">專案業務核准</span></div></div>
          <div class="gb-dash-step"><span class="gb-step-num">3</span><div><span class="gb-step-label">會計部門複核</span><span class="gb-step-sub">稅額精算過帳</span></div></div>
          <div class="gb-dash-step"><span class="gb-step-num">4</span><div><span class="gb-step-label">憑證生成與勾稽</span><span class="gb-step-sub">轉帳憑證產出</span></div></div>
        </div>
      </div>

      <!-- 指標卡 -->
      <div class="gb-dash-stats">
        <div class="gb-dash-stat">
          <div class="gb-dash-stat-head"><span>${overviewLabel}專案預算</span><div class="gb-dash-stat-icon blue">◍</div></div>
          <div class="gb-dash-stat-value">NT$ ${totalBudget.toLocaleString()}</div>
          <div class="gb-dash-stat-sub">參與專案數：${filteredProjects.length} 個</div>
        </div>
        <div class="gb-dash-stat">
          <div class="gb-dash-stat-head"><span>已使用 / 剩餘預算</span><div class="gb-dash-stat-icon emerald">◍</div></div>
          <div class="gb-dash-stat-value">NT$ ${totalSpent.toLocaleString()}</div>
          <div class="gb-dash-stat-sub">剩餘 NT$ ${totalRemaining.toLocaleString()}</div>
        </div>
        <div class="gb-dash-stat">
          <div class="gb-dash-stat-head"><span>待審核單據</span><div class="gb-dash-stat-icon amber">◍</div></div>
          <div class="gb-dash-stat-value" style="color:#d97706;">${pendingReview + pendingAccounting} 筆</div>
          <div class="gb-dash-stat-sub">主管 ${pendingReview} 筆｜會計 ${pendingAccounting} 筆</div>
        </div>
        <div class="gb-dash-stat">
          <div class="gb-dash-stat-head"><span>待付款 / 退件</span><div class="gb-dash-stat-icon purple">◍</div></div>
          <div class="gb-dash-stat-value">${pendingPayment} 筆</div>
          <div class="gb-dash-stat-sub" style="color:#be123c;">退件 ${rejectedCount} 筆</div>
        </div>
      </div>

      <div class="gb-dash-grid">
        <div class="gb-dash-panel">
          <div class="gb-dash-panel-head">
            <h3>單據簽核狀態進度</h3>
            <a href="javascript:void(0)" onclick="activateTab('voucherWorkflow')">進入簽核中心 →</a>
          </div>
          <div class="gb-dash-panel-body">
            ${displayVouchers.length === 0
              ? '<p class="muted" style="padding:20px; text-align:center;">目前尚無相關單據</p>'
              : displayVouchers.slice(0, 6).map(v => `
                  <div class="gb-dash-list-item">
                    <div>
                      <div class="gb-item-title">
                        <a href="javascript:void(0)" onclick="viewVoucherDetail('${v.id}')" style="color:#2563eb;">${v.voucher_no || '未編號'}</a>
                        <span class="gb-inv-mono" style="color:#64748b;">${v.summary || '-'}</span>
                      </div>
                      <div class="gb-item-sub">${v.profiles?.full_name || '-'}｜${v.departments?.name || '-'}</div>
                    </div>
                    <div style="text-align:right;">
                      <div class="gb-dash-stat-value" style="font-size:14px;">NT$ ${Number(v.total_amount || 0).toLocaleString()}</div>
                      <div style="margin-top:4px;">${getStatusBadge(v.status)}</div>
                    </div>
                  </div>
                `).join('')}
          </div>
        </div>

        <div class="gb-dash-panel">
          <div class="gb-dash-panel-head">
            <h3>專案預算管理</h3>
            <a href="javascript:void(0)" onclick="activateTab('budget')">專案詳情 →</a>
          </div>
          <div class="gb-dash-panel-body">
            ${filteredProjects.length === 0
              ? '<p class="muted" style="padding:20px; text-align:center;">目前沒有可檢視的專案預算。</p>'
              : filteredProjects.map(p => {
                  const tb = Number(p.total_budget || 0);
                  const rb = Number(p.remaining_budget || 0);
                  const used = Math.max(0, tb - rb);
                  const pct = tb > 0 ? Math.min(100, Math.round((used / tb) * 100)) : 0;
                  const barClass = pct >= 100 ? 'over' : pct >= 70 ? 'warn' : '';
                  return `
                    <div style="padding:10px 0; border-bottom:1px solid #f8fafc;">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <span class="gb-item-title">${p.name}</span>
                        <span class="gb-inv-mono" style="color:#64748b;">${p.project_code || ''}</span>
                      </div>
                      <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; margin-top:4px;">
                        <span>已用 NT$ ${used.toLocaleString()}</span>
                        <span>剩餘 NT$ ${rb.toLocaleString()}（${pct}%）</span>
                      </div>
                      <div class="gb-dash-progress"><div class="gb-dash-progress-fill ${barClass}" style="width:${pct}%;"></div></div>
                    </div>
                  `;
                }).join('')}
          </div>
        </div>
      </div>

      <!-- 權限規範卡 -->
      <div class="gb-dash-rules">
        <h4>⚕ 系統權限與安全規範說明</h4>
        <ul>
          <li><strong>專案編輯權限：</strong>僅會計人員與管理員有資格新建專案、增減預算或調動專案成員。</li>
          <li><strong>歷史軌跡記錄：</strong>每一次專案或分錄修改，系統將永久保留異動時間與操作人員姓名。</li>
          <li><strong>員工隔離檢視：</strong>一般員工登入後僅可瀏覽其所屬專案，確保財務數據安全。</li>
          <li><strong>簽核三層防線：</strong>員工送出 → 部門主管批准 → 會計複核過帳 → 付款結案。</li>
        </ul>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error('Dashboard（新版）載入失敗:', err);
    container.innerHTML = `<p style="color:red; padding:16px;">載入失敗：${err.message}</p>`;
  }
}
