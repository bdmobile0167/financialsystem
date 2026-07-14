import { COMPANY_INFO, BUSINESS_ITEMS, DIRECTOR_SHAREHOLDER_LIST, STRUCTURE_SETTINGS, OPTION_LIST, STANDARDIZED_STRUCTURE_SETTINGS } from './company-data.js';

export const STORAGE_KEY = 'finance_netlify_app_v1';
export const USER_KEY = 'finance_netlify_user';

export const SAMPLE_DATA = [
  { date: '2025-03-14', bank: '玉山187', customer: '交大', detail: '企網非約轉帳', type: '支出', amount: 5642, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-17', bank: '玉山187', customer: '臺銀', detail: '中華電信費用', type: '支出', amount: 5500, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-17', bank: '玉山187', customer: '臺銀', detail: '中華電信費用', type: '支出', amount: 999, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-19', bank: '玉山187', customer: '臺銀', detail: '勞保局保險費', type: '支出', amount: 1196, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-20', bank: '玉山187', customer: '11402', detail: '企網本行轉帳', type: '支出', amount: 60000, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-21', bank: '玉山187', customer: 'ZW27817601', detail: '企網本行轉帳', type: '支出', amount: 1780000, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-28', bank: '玉山187', customer: '兆豐銀', detail: 'ATM跨行轉', type: '收入', amount: 10644, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-31', bank: '玉山187', customer: '國世銀', detail: 'ATM跨行轉', type: '收入', amount: 2000000, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-31', bank: '玉山187', customer: '國世銀', detail: 'ATM跨行轉', type: '收入', amount: 200000, voucher: '', remark: '玉山範例', source: 'sample' },
  { date: '2025-03-04', bank: '台新796', customer: '', detail: '代繳勞保(11401)', type: '支出', amount: 27559, voucher: '', remark: '台新範例', source: 'sample' },
  { date: '2025-03-04', bank: '台新796', customer: '', detail: '代繳勞退(11312)', type: '支出', amount: 9543, voucher: '', remark: '台新範例', source: 'sample' },
  { date: '2025-03-01', bank: '台新809', customer: '', detail: '期初餘額', type: '收入', amount: 113651, voucher: '', remark: '期初餘額', source: 'sample' },
  { date: '2025-03-01', bank: '台新854', customer: '', detail: '期初餘額', type: '收入', amount: 27651, voucher: '', remark: '期初餘額', source: 'sample' }
];

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
