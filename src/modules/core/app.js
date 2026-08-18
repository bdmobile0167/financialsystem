import { supabase } from '../../../scripts/supabaseClient.js';
import { defaultState, loadState } from '../../../scripts/state.js';
import { getCurrentSessionUser } from '../../../scripts/auth.js';

window.state = window.state || { ...defaultState };

export async function renderCompanyInfo() {
    const data = await fetchCompanyData();
    // 進行 DOM 操作將資料顯示在網頁上
}

async function initPage() {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return;
    }

    window.state.currentUser = sessionUser;
    window.state.myCompanies = [];

    await renderHeader(sessionUser);

    window.state.companyInfo = {};
    window.state.structureSettings = {};

    if (typeof renderCompanyData === 'function') renderCompanyData();
    if (typeof fillCompanyInfoForm === 'function') fillCompanyInfoForm();
    if (typeof renderBusinessData === 'function') renderBusinessData();
  } catch (error) {
    console.error('載入失敗：', error);
  }
}

document.addEventListener('DOMContentLoaded', initPage);

function render() {
  const adminOnlyElements = ['departmentForm', 'inviteUserForm', /* 其他 Admin 專屬 ID */];
  adminOnlyElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = window.state.currentUser?.role === 'admin' ? 'block' : 'none';
  });
  const passwordEmail = document.getElementById('passwordUserEmail');
  if (window.state.currentUser) {
    setText('#welcomeText', `歡迎，${window.state.currentUser.name}`);
    if (passwordEmail) passwordEmail.value = window.state.currentUser.username || '';
  } else {
    setText('#welcomeText', '歡迎，使用者');
  }
  document.getElementById('systemName').value = window.state.systemName;
  document.title = `${window.state.systemName} | Netlify Demo`;

  updateAdminNavVisibility();
  applyRoleBasedTabVisibility();
  renderDashboard();
  renderTransactionTable();
  if (['accounting', 'admin'].includes(window.state.currentUser?.role)) {
    renderReports();
  }
  renderCompanyData();
  fillCompanyInfoForm();
  renderBusinessData();
  updateSettings();
  renderBankAccounts();
  renderVoucherCenter();
  renderBudget();
  if (['accounting', 'admin'].includes(window.state.currentUser?.role)) {
    renderEquityTab();
  }
  renderTabs();
  populateProjectDepartmentSelect();
  renderProjectList();
  loadAndRenderProjects();
}

function showApp() {
  if (!window.state.currentUser) {
    document.getElementById('loginView').style.display = 'grid';
    document.getElementById('appView').classList.remove('active');
    return;
  }
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').classList.add('active');
  render();
  window.state.activeTab = 'dashboard';
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

window.showForcePasswordView = showForcePasswordView;

async function initialize() {
    loadState(window.state);
    initializeEvents();

    const user = await getCurrentSessionUser();
    if(user){
        window.state.currentUser=user;
        if(user.mustChangePassword){
            showForcePasswordView();
        }else{
            await showApp();
        }
    }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

export { initPage, render, showApp, showForcePasswordView, initialize };
