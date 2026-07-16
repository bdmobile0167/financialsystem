const STORAGE_KEY = 'bankAccounts';

export const DEFAULT_BANK_ACCOUNTS = [
  { id: 'bank-001', bankName: '玉山銀行', accountNumber: '86187', nickname: '玉山187', openingBalance: 0 },
  { id: 'bank-002', bankName: '台新銀行', accountNumber: '04809', nickname: '台新809', openingBalance: 113651 },
  { id: 'bank-003', bankName: '台新銀行', accountNumber: '04796', nickname: '台新796', openingBalance: 75793 },
  { id: 'bank-004', bankName: '台新銀行', accountNumber: '04854', nickname: '台新854', openingBalance: 27651 }
];

export function loadBankAccounts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  saveBankAccounts(DEFAULT_BANK_ACCOUNTS);
  return DEFAULT_BANK_ACCOUNTS;
}

export function saveBankAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function addBankAccount({ bankName, accountNumber, nickname, openingBalance }) {
  const accounts = loadBankAccounts();
  const newAccount = {
    id: `bank-${Date.now()}`,
    bankName, accountNumber, nickname: nickname || `${bankName}${accountNumber}`,
    openingBalance: Number(openingBalance || 0)
  };
  accounts.push(newAccount);
  saveBankAccounts(accounts);
  return newAccount;
}

export function deleteBankAccount(id) {
  const accounts = loadBankAccounts().filter(a => a.id !== id);
  saveBankAccounts(accounts);
  return accounts;
}

export function getBankBalance(id, transactions) {
  const account = loadBankAccounts().find(a => a.id === id);
  if (!account) return 0;
  const delta = transactions
    .filter(tx => tx.bankAccountId === id)
    .reduce((sum, tx) => sum + (tx.type === '收入' ? Number(tx.amount) : -Number(tx.amount)), 0);
  return account.openingBalance + delta;
}