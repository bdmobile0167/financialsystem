export const DEFAULT_ACCOUNTS = [
  { id: 'acc-1101', code: '1101', name: 'Cash on hand', type: 'asset' },
  { id: 'acc-1102', code: '1102', name: 'Bank deposits', type: 'asset' },
  { id: 'acc-1141', code: '1141', name: 'Accounts receivable', type: 'asset' },
  { id: 'acc-1601', code: '1601', name: 'Fixed assets', type: 'asset' },
  { id: 'acc-1602', code: '1602', name: 'Accumulated depreciation', type: 'asset' },
  { id: 'acc-2141', code: '2141', name: 'Accounts payable', type: 'liability' },
  { id: 'acc-3110', code: '3110', name: 'Share capital', type: 'equity' },
  { id: 'acc-3310', code: '3310', name: 'Retained earnings', type: 'equity' },
  { id: 'acc-4111', code: '4111', name: 'Operating revenue', type: 'revenue' },
  { id: 'acc-6100', code: '6100', name: 'Operating expense', type: 'expense' }
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
  return accounts.find(account => account.code === code);
}
