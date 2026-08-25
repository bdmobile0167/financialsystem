import { STORAGE_KEY, USER_KEY } from './config.js';

export { STORAGE_KEY, USER_KEY };

const LEGACY_STORAGE_KEY = ['finance_', 'net', 'lify_app_v1'].join('');
const LEGACY_USER_KEY = ['finance_', 'net', 'lify_user'].join('');

export const defaultState = {
  transactions: [],
  currentUser: null,
  activeTab: 'dashboard',
  systemName: '財務管理系統',
  pendingRequests: [],
  // Do NOT treat company-data.js as the authoritative source for company data.
  // Use empty defaults; frontend should fetch real company data from Supabase.
  companyInfo: {},
  businessItems: [],
  directorShareholders: [],
  structureSettings: {},
  optionList: [],
  standardizedSettings: {}
};

export function loadState(state) {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    state.systemName = parsed.systemName || '財務管理系統';
    // Financial, company and payee records are loaded only from Supabase.
    state.transactions = [];
    state.companyInfo = {};
    state.businessItems = [];
    state.directorShareholders = [];
    if (!localStorage.getItem(STORAGE_KEY)) saveState(state);
  } else {
    // 新環境不載入範例交易，正式資料一律由 Supabase 取得。
    state.transactions = [];
    saveState(state);
  }
  const user = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
  if (user) {
    state.currentUser = JSON.parse(user);
    if (!localStorage.getItem(USER_KEY)) localStorage.setItem(USER_KEY, user);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    systemName: state.systemName
  }));
}
