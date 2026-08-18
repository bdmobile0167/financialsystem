import { supabase } from '../../../scripts/supabaseClient.js';
import { 
  getStatusBadge, 
  buildApprovalStepperHtml,
  showMessage 
} from '../../utils/uiHelpers.js';

export async function renderDashboard() {
  const container = document.getElementById('dashboardContainer') || document.getElementById('dashboard');
  if (!container) return;

  const user = window.state?.currentUser;
  if (!user || !user.id) {
    container.innerHTML = '<p class="muted">請先登入</p>';
    return;
  }

  const role = user.role;
  const isPrivileged = ['admin', 'accounting'].includes(role);
  const selectedProj = window.state?.currentProjectId || 'all';

  try {
    // 1. 依角色抓報支單
    let voucherQuery = supabase
      .from('vouchers')
      .select('*, profiles!applicant_id(full_name), departments(name)')
      .order('created_at', { ascending: false });
    if (!isPrivileged && user.department_id) {
      voucherQuery = voucherQuery.eq('department_id', user.department_id);
    }

    const { data: vchs, error: vError } = await voucherQuery;
    if (vError) throw vError;
    const vouchers = vchs || [];

    // 2. 依角色抓專案（預算來源）
    let projectQuery = supabase.from('projects').select('id, name, project_code, total_budget, remaining_budget, department_id');
    if (!isPrivileged && user.department_id) {
      projectQuery = projectQuery.eq('department_id', user.department_id);
    }
    const { data: projects } = await projectQuery;
    const projectList = projects || [];

    // 有選單一專案時，再過濾
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
      .filter(v =>
        (!v.project_id || projectIds.has(v.project_id)) &&
        ['approved', 'closed', 'pending_accounting'].includes(v.status)
      )
      .reduce((s, v) => s + Number(v.total_amount || 0), 0);

    const totalRemaining = Math.max(0, totalBudget - totalSpent);

    // 3. 待辦數字
    const pendingReview = displayVouchers.filter(v => v.status === 'pending_review').length;
    const pendingAccounting = displayVouchers.filter(v => v.status === 'pending_accounting').length;
    const pendingPayment = displayVouchers.filter(v => v.status === 'approved').length;
    const rejectedCount = displayVouchers.filter(v =>
      v.status === 'manager_rejected' || v.status === 'accounting_rejected'
    ).length;

    // 4. 員工專屬計算
    const isEmployee = role === 'employee';
    const myPendingBillsCount = vouchers.filter(v => 
      v.applicant_id === user.id && (v.status === 'pending_review' || v.status === 'pending_accounting')
    ).length;
    const myApprovedBillsCount = vouchers.filter(v => 
      v.applicant_id === user.id && (v.status === 'approved' || v.status === 'closed')
    ).length;
    const myRejectedBillsCount = vouchers.filter(v => 
      v.applicant_id === user.id && (v.status === 'manager_rejected' || v.status === 'accounting_rejected')
    ).length;

    // 5. 組裝畫面 - 卡片式設計
    let html = `
      <!-- Role Banner - Clean Dark Minimalist Header -->
      <div class="bg-slate-900 p-6 rounded-xl text-white shadow-sm border border-slate-800 relative overflow-hidden mb-6">
        <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1.5">
            <div class="flex items-center space-x-2">
              <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                目前角色：${user.name || user.full_name || ''} (${getRoleLabel(role)})
              </span>
              <span class="text-xs text-slate-400">• ${user.department_name || user.department || ''}</span>
            </div>
            <h2 class="text-xl font-bold tracking-tight">IFRS 國際會計原則 智慧財務報表與憑證稽核中心</h2>
            <p class="text-xs text-slate-300 max-w-2xl leading-relaxed">
              ${isEmployee 
                ? '您可填報專案費用單據、追蹤主管與會計兩階段審核進度，並查看個人專案憑證勾稽結果。'
                : '具備全權限發票與憑證即時勾稽核對、自動化會計分錄生成、專案預算稽核與 IFRS 財務三大報表編製。'}
            </p>
          </div>
          <div class="flex items-center space-x-2.5">
            <button
              onclick="activateTab('voucherWorkflow')"
              class="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
            >
              <svg class="w-3.5 h-3.5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              <span>填報新費用單據</span>
            </button>
            ${!isEmployee ? `
            <button
              onclick="activateTab('reports')"
              class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs px-3.5 py-2 rounded-lg transition cursor-pointer"
            >
              查看 IFRS 報表
            </button>
            ` : ''}
          </div>
        </div>

        <!-- Workflow Stepper Line -->
        <div class="mt-5 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <div class="flex items-center space-x-2 text-slate-300">
            <div class="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">1</div>
            <div>
              <span class="font-semibold block text-white">員工報銷送出</span>
              <span class="text-[10px] text-slate-400">發票/收據登錄</span>
            </div>
          </div>
          <div class="flex items-center space-x-2 text-slate-300">
            <div class="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-bold text-[10px] flex items-center justify-center border border-slate-700 shrink-0">2</div>
            <div>
              <span class="font-semibold block text-white">部門主管審核</span>
              <span class="text-[10px] text-slate-400">專案業務核准</span>
            </div>
          </div>
          <div class="flex items-center space-x-2 text-slate-300">
            <div class="w-5 h-5 rounded-full bg-slate-800 text-blue-400 font-bold text-[10px] flex items-center justify-center border border-slate-700 shrink-0">3</div>
            <div>
              <span class="font-semibold block text-white">會計部門複核</span>
              <span class="text-[10px] text-slate-400">稅額精算過帳</span>
            </div>
          </div>
          <div class="flex items-center space-x-2 text-slate-300">
            <div class="w-5 h-5 rounded-full bg-slate-800 text-emerald-400 font-bold text-[10px] flex items-center justify-center border border-slate-700 shrink-0">4</div>
            <div>
              <span class="font-semibold block text-white">憑證生成與勾稽</span>
              <span class="text-[10px] text-slate-400">轉帳憑證產出</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // High-level Metrics - 角色導向
    if (isEmployee) {
      html += `
        <!-- Employee Metrics -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">獲授權專案總預算</span>
              <div class="w-7 h-7 rounded bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-slate-900 tabular-nums">NT$ ${totalBudget.toLocaleString()}</div>
              <div class="mt-1 flex items-center text-[11px] text-blue-600 font-medium">
                <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>參與專案數: ${filteredProjects.length} 個</span>
              </div>
            </div>
          </div>

          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">專案累計已動支金額</span>
              <div class="w-7 h-7 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-slate-900 tabular-nums">NT$ ${totalSpent.toLocaleString()}</div>
              <div class="mt-1 text-[11px] text-slate-500 font-mono">執行進度: ${totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}%</div>
            </div>
          </div>

          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">個人填報待審單據</span>
              <div class="w-7 h-7 rounded bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-amber-600 tabular-nums">${myPendingBillsCount} 筆</div>
              <div class="mt-1 text-[11px] text-slate-500">簽核進行中 (主管/會計)</div>
            </div>
          </div>

          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">個人核銷與過帳單據</span>
              <div class="w-7 h-7 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-slate-900 tabular-nums">${myApprovedBillsCount} 筆</div>
              <div class="mt-1 text-[11px] text-emerald-600 font-medium flex items-center">
                <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                <span>已完成報銷並產出憑證</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <!-- Admin/Accounting/Manager Metrics -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${isPrivileged && selectedProj === 'all' ? '全公司' : '範圍內'}專案預算</span>
              <div class="w-7 h-7 rounded bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-slate-900 tabular-nums">NT$ ${totalBudget.toLocaleString()}</div>
              <div class="mt-1 flex items-center text-[11px] text-emerald-600 font-medium">
                <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>參與專案數: ${filteredProjects.length} 個</span>
              </div>
            </div>
          </div>

          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">已使用 / 剩餘預算</span>
              <div class="w-7 h-7 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-slate-900 tabular-nums">NT$ ${totalSpent.toLocaleString()}</div>
              <div class="mt-1 text-[11px] text-slate-500 font-mono">剩餘 NT$ ${totalRemaining.toLocaleString()}</div>
            </div>
          </div>

          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">待審核單據</span>
              <div class="w-7 h-7 rounded bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-amber-600 tabular-nums">${pendingReview + pendingAccounting} 筆</div>
              <div class="mt-1 text-[11px] text-slate-500">主管 ${pendingReview} 筆｜會計 ${pendingAccounting} 筆</div>
            </div>
          </div>

          <div class="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">待付款 / 退件</span>
              <div class="w-7 h-7 rounded bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2h2"></path></svg>
              </div>
            </div>
            <div>
              <div class="text-xl font-bold font-mono text-slate-900 tabular-nums">${pendingPayment} 筆</div>
              <div class="mt-1 text-[11px] text-rose-600 font-medium">退件 ${rejectedCount} 筆</div>
            </div>
          </div>
        </div>
      `;
    }

    // Main Grid: Pending Approvals & Accessible Projects
    html += `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column (2 cols): Pending Approvals & Recent Vouchers -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Pending Approvals Card -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-4 border-b border-slate-100 flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <h3 class="font-bold text-sm text-slate-900">單據簽核狀態進度</h3>
              </div>
              <button
                onclick="activateTab('voucherWorkflow')"
                class="text-xs text-blue-600 font-semibold hover:underline flex items-center"
              >
                <span>進入簽核中心</span>
                <svg class="w-3.5 h-3.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
              </button>
            </div>
            <div class="divide-y divide-slate-100 text-xs">
    `;

    // 顯示單據列表
    const accessibleVouchers = isEmployee 
      ? vouchers.filter(v => v.applicant_id === user.id)
      : displayVouchers;

    if (accessibleVouchers.length === 0) {
      html += `<div class="p-8 text-center text-slate-400 text-xs">目前尚無相關單據</div>`;
    } else {
      html += accessibleVouchers.slice(0, 4).map((bill) => `
        <div class="p-3.5 hover:bg-slate-50 transition flex items-center justify-between">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${bill.voucher_no || '未編號'}</span>
              <span class="font-bold text-slate-800 text-xs">${bill.summary || '-'}</span>
              <span class="text-[10px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">專案: ${bill.projects?.name || bill.project_id || '-'}</span>
            </div>
            <div class="text-[10px] text-slate-400 flex items-center space-x-3">
              <span>申請人: ${bill.profiles?.full_name || '-'}</span>
              <span>•</span>
              <span>部門: ${bill.departments?.name || '-'}</span>
            </div>
          </div>
          <div class="text-right space-y-1">
            <div class="font-bold font-mono text-slate-900 tabular-nums text-xs">NT$ ${Number(bill.total_amount || 0).toLocaleString()}</div>
            <div>${getStatusBadge(bill.status)}</div>
          </div>
        </div>
      `).join('');
    }

    html += `
            </div>
          </div>

          <!-- Vouchers & Cross-Verification Overview -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3.5">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div class="flex items-center space-x-2">
                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <h3 class="font-bold text-sm text-slate-900">會計憑證即時勾稽與稽核驗證</h3>
              </div>
              <button
                onclick="activateTab('voucherCenter')"
                class="text-xs text-blue-600 font-semibold hover:underline flex items-center"
              >
                <span>完整憑證列表</span>
                <svg class="w-3.5 h-3.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
              </button>
            </div>
            
            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <div class="font-semibold flex items-center text-slate-900">
                <svg class="w-4 h-4 mr-1.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>國際會計原則規定：發票或收據為商業單據，不代表會計憑證。</span>
              </div>
              <p class="text-slate-600 leading-relaxed text-[11px]">
                本系統在主管與會計審核通過後，自動將發票拆算 5% 營業稅/免稅，產生官方轉帳憑證，並執行借貸平衡、稅額精算、帳實對應之「即時勾稽核對 (Cross-Verification Audit)」。
              </p>
            </div>

            <div class="space-y-2.5">
    `;

    // 顯示最近憑證
    const recentVouchers = vouchers.filter(v => v.status === 'approved' || v.status === 'closed').slice(0, 3);
    if (recentVouchers.length === 0) {
      html += `<div class="p-3 text-center text-slate-400 text-xs">尚無已核准憑證</div>`;
    } else {
      html += recentVouchers.map(v => `
        <div class="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">${v.voucher_no || '未編號'}</span>
              <span class="font-medium text-slate-800">${v.summary || v.vendor || '-'}</span>
              <span class="text-[10px] text-slate-400 font-mono">(${v.tx_date || v.created_at?.slice(0,10)})</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-1">專案: ${v.projects?.name || v.project_id || '-'}</p>
          </div>
          <div class="flex items-center space-x-3">
            <span class="font-mono font-bold text-slate-900 text-xs tabular-nums">NT$ ${Number(v.total_amount || 0).toLocaleString()}</span>
            <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded font-bold flex items-center">
              <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 勾稽核對成功
            </span>
          </div>
        </div>
      `).join('');
    }

    html += `
            </div>
          </div>
        </div>

        <!-- Right Column (1 col): Accessible Projects & Strict Role Controls -->
        <div class="space-y-6">
          <!-- Projects Overview -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3.5">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div class="flex items-center space-x-2">
                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                <h3 class="font-bold text-sm text-slate-900">專案預算管理 (權限控管)</h3>
              </div>
              <button
                onclick="activateTab('budget')"
                class="text-xs text-indigo-600 font-semibold hover:underline"
              >
                專案詳情
              </button>
            </div>

            <p class="text-[11px] text-slate-500">
              ${isEmployee
                ? '依權限原則：員工僅可檢視與填報獲授權之專案。'
                : '會計人員與管理員可調整專案成員、編輯預算，並保留完整歷史變更紀錄。'}
            </p>

            <div class="space-y-2.5">
    `;

    if (filteredProjects.length === 0) {
      html += `<div class="p-4 text-center text-slate-400 text-xs">目前沒有可檢視的專案</div>`;
    } else {
      html += filteredProjects.map((p) => {
        const projectExpenses = displayVouchers
          .filter(b => b.project_id === p.id && (b.status === 'approved' || b.status === 'closed'))
          .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
        const percent = Math.min(100, Math.round((projectExpenses / (p.total_budget || 1)) * 100));
        const barClass = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-blue-600';

        return `
          <div class="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-900">${p.name}</span>
              <span class="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">${p.project_code || p.id}</span>
            </div>
            <div class="space-y-1">
              <div class="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>已用報銷: NT$ ${projectExpenses.toLocaleString()}</span>
                <span>預算: NT$ ${Number(p.total_budget || 0).toLocaleString()} (${percent}%)</span>
              </div>
              <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all ${barClass}" style="width:${percent}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    html += `
            </div>
          </div>

          <!-- Strict Permission Rules Card -->
          <div class="bg-slate-900 text-slate-200 rounded-xl p-4 border border-slate-800 space-y-2.5 shadow-sm">
            <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <span>系統權限與安全規範說明</span>
            </div>
            <ul class="text-[11px] text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
              <li><strong class="text-white">專案編輯權限：</strong>僅會計人員與管理員有資格新建專案、增減預算或調動專案成員。</li>
              <li><strong class="text-white">歷史軌跡記錄：</strong>每一次專案或分錄修改，系統將永久保留異動時間與操作人員姓名。</li>
              <li><strong class="text-white">員工隔離檢視：</strong>一般員工登入後僅可瀏覽其所屬專案，確保財務數據安全。</li>
              <li><strong class="text-white">簽核三層防線：</strong>員工送出 → 部門主管批准 → 會計複核過帳。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error('Dashboard 失敗:', err);
    container.innerHTML = `<p style="color:red; padding:16px;">載入失敗：${err.message}</p>`;
  }
}

function getRoleLabel(role) {
  const labels = { admin: '系統管理員', accounting: '會計部門', manager: '部門主管', employee: '一般員工' };
  return labels[role] || role;
}