import { loadChartOfAccounts } from './chartOfAccounts.js';

function resolveAccounts(accounts, category, type) {
  const bank = accounts.find(a => a.code === '1102');
  const expense = accounts.find(a => a.code === '6100');
  const revenue = accounts.find(a => a.code === '4111');
  const fixedAsset = accounts.find(a => a.code === '1601');
  const capital = accounts.find(a => a.code === '3110');

  if (category === '投資') {
    return type === '支出'
      ? { debit: fixedAsset, credit: bank }   // 買設備/資產
      : { debit: bank, credit: fixedAsset };  // 處分資產
  }
  if (category === '融資') {
    return type === '支出'
      ? { debit: capital, credit: bank }   // 還款 / 分配股利 / 減資
      : { debit: bank, credit: capital };  // 股東入資 / 借款
  }
  // 預設：營業活動
  return type === '支出'
    ? { debit: expense, credit: bank }
    : { debit: bank, credit: revenue };
}

export function buildJournalEntries(transactions) {
  const accounts = loadChartOfAccounts();

  return transactions.map((tx, index) => {
    const amount = Number(tx.amount || 0);
    const category = tx.category || '營業';
    const { debit, credit } = resolveAccounts(accounts, category, tx.type);

    return {
      id: `je-${tx.date}-${index}`,
      date: tx.date,
      memo: tx.detail || tx.customer || '未註明',
      bank: tx.bank,
      category,
      debitAccountId: debit.id,
      debitAccountCode: debit.code,
      debitAccountName: debit.name,
      debitAmount: amount,
      creditAccountId: credit.id,
      creditAccountCode: credit.code,
      creditAccountName: credit.name,
      creditAmount: amount,
      voucher: tx.voucher || '',
      status: tx.voucher ? '已對應' : '待補'
    };
  });
}