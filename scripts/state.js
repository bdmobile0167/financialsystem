import { COMPANY_INFO, BUSINESS_ITEMS, DIRECTOR_SHAREHOLDER_LIST, STRUCTURE_SETTINGS, OPTION_LIST, STANDARDIZED_STRUCTURE_SETTINGS } from './company-data.js';

export const STORAGE_KEY = 'finance_netlify_app_v1';
export const USER_KEY = 'finance_netlify_user';

export const defaultState = {
  transactions: [],
  currentUser: null,
  activeTab: 'dashboard',
  systemName: '財務管理系統',
  pendingRequests: [],
  companyInfo: COMPANY_INFO,
  businessItems: BUSINESS_ITEMS,
  directorShareholders: DIRECTOR_SHAREHOLDER_LIST,
  structureSettings: STRUCTURE_SETTINGS,
  optionList: OPTION_LIST,
  standardizedSettings: STANDARDIZED_STRUCTURE_SETTINGS
};

export function loadState(state) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    state.transactions = parsed.transactions || [];
    state.systemName = parsed.systemName || '財務管理系統';
    state.companyInfo = parsed.companyInfo || COMPANY_INFO;
    state.businessItems = parsed.businessItems || BUSINESS_ITEMS;
    state.directorShareholders = parsed.directorShareholders || DIRECTOR_SHAREHOLDER_LIST;
    state.structureSettings = parsed.structureSettings || STRUCTURE_SETTINGS;
    state.optionList = parsed.optionList || OPTION_LIST;
    state.standardizedSettings = parsed.standardizedSettings || STANDARDIZED_STRUCTURE_SETTINGS;
  } else {
    state.transactions = SAMPLE_DATA;
    saveState(state);
  }
  const user = localStorage.getItem(USER_KEY);
  if (user) {
    state.currentUser = JSON.parse(user);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    transactions: state.transactions,
    systemName: state.systemName,
    companyInfo: state.companyInfo,
    businessItems: state.businessItems,
    directorShareholders: state.directorShareholders,
    structureSettings: state.structureSettings,
    optionList: state.optionList,
    standardizedSettings: state.standardizedSettings
  }));
}
