export const DEFAULT_ACCOUNTS = [
  { id: 'acc-1101', code: '1101', name: '現金', type: 'asset' },
  { id: 'acc-1102', code: '1102', name: '銀行存款', type: 'asset' },
  { id: 'acc-1141', code: '1141', name: '應收帳款', type: 'asset' },
  { id: 'acc-1601', code: '1601', name: '固定資產', type: 'asset' },
  { id: 'acc-2141', code: '2141', name: '應付帳款', type: 'liability' },
  { id: 'acc-3110', code: '3110', name: '股本', type: 'equity' },
  { id: 'acc-3310', code: '3310', name: '保留盈餘', type: 'equity' },
  { id: 'acc-4111', code: '4111', name: '營業收入', type: 'revenue' },
  { id: 'acc-6100', code: '6100', name: '營業費用', type: 'expense' }
];

const STORAGE_KEY = 'chartOfAccounts';

export function loadChartOfAccounts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  saveChartOfAccounts(DEFAULT_ACCOUNTS);
  return DEFAULT_ACCOUNTS;
}

export function saveChartOfAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function findAccountByCode(accounts, code) {
  return accounts.find(a => a.code === code);
}