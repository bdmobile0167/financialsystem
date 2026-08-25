import { APP_VERSION } from '../../../scripts/config.js';
import { ROLE_LABELS } from '../utils/uiHelpers.js';

export function renderTabs(activeTab = window.state?.activeTab) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.style.display = 'none';
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });

  const currentPanel = document.getElementById(activeTab);
  if (currentPanel) currentPanel.style.display = 'block';
}

export async function renderHeader(user) {
  const headerUserInfo = document.getElementById('header-user-info');
  if (!headerUserInfo) return;

  headerUserInfo.innerHTML = `
    <span class="badge secondary">${ROLE_LABELS[user.role] || user.role || '使用者'}</span>
    <span id="versionLabel">v${APP_VERSION}</span>
  `;
}
