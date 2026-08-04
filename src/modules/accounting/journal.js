import { loadChartOfAccounts } from './chartOfAccounts.js';
import { runAccountingPipeline } from './index.js'; // 供 catch 降級使用
// 請根據您專案實際的路徑引入 supabase (例如以下路徑)
import { supabase } from '../../../scripts/supabaseClient.js';

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

// 請將這個遺失的函式補回 journal.js 檔案中
export function buildJournalEntries(transactions = []) {
  const accounts = loadChartOfAccounts();
  return transactions.map(tx => {
    const { debit, credit } = resolveAccounts(accounts, tx.category, tx.type);
    
    return {
      date: tx.date || '-',
      memo: tx.desc || tx.summary || '未註明',
      bank: tx.bank || '-',
      debitAccountCode: debit ? debit.code : '-',
      debitAccountName: debit ? debit.name : '-',
      debitAmount: Number(tx.amount || 0),
      creditAccountCode: credit ? credit.code : '-',
      creditAccountName: credit ? credit.name : '-',
      creditAmount: Number(tx.amount || 0),
      voucher: tx.id || '-',
      status: '已入帳'
    };
  });
}

export async function buildJournal(transactions = []) {
  try {    let q = supabase
      .from('journal_entries')
      .select(`
        *,
        debit_account:accounts!debit_account_id(code, name),
        credit_account:accounts!credit_account_id(code, name)
      `)
      .order('entry_date', { ascending: false });    const { data: journalEntries, error } = await q;

    if (error) throw error;

    return journalEntries.map(entry => ({
      date: entry.entry_date,
      summary: entry.memo || '未註明',
      bank: '-',
      debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
      debitAmount: Number(entry.debit_amount || 0),
      creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
      creditAmount: Number(entry.credit_amount || 0),
      voucher: entry.transaction_id || '-',
      status: '已入帳'
    }));
  } catch (err) {
    console.warn('從 journal_entries 讀取失敗，降級使用本地計算:', err.message);
    const { journalEntries: localEntries } = runAccountingPipeline(transactions);
    return localEntries.map(entry => ({
      date: entry.date, summary: entry.memo, bank: entry.bank,
      debitAccount: `${entry.debitAccountCode} ${entry.debitAccountName}`, debitAmount: entry.debitAmount,
      creditAccount: `${entry.creditAccountCode} ${entry.creditAccountName}`, creditAmount: entry.creditAmount,
      voucher: entry.voucher, status: entry.status
    }));
  }
}