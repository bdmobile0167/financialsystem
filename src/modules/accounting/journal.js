import { loadChartOfAccounts } from './chartOfAccounts.js';
import { runAccountingPipeline } from './index.js'; // 靘?catch ??雿輻
// 隢?撠?撖阡??楝敺???supabase (靘?隞乩?頝臬?)
import { supabase } from '../../../scripts/supabaseClient.js';

function debitBase(entry) {
  return Number(entry?.debit_amount_base ?? entry?.debit_amount ?? 0);
}

function creditBase(entry) {
  return Number(entry?.credit_amount_base ?? entry?.credit_amount ?? 0);
}

function resolveAccounts(accounts, category, type) {
  const bank = accounts.find(a => a.code === '1102');
  const expense = accounts.find(a => a.code === '6100');
  const revenue = accounts.find(a => a.code === '4111');
  const fixedAsset = accounts.find(a => a.code === '1601');
  const capital = accounts.find(a => a.code === '3110');

  if (category === '??') {
    return type === '?臬'
      ? { debit: fixedAsset, credit: bank }   // 鞎瑁身??鞈
      : { debit: bank, credit: fixedAsset };  // ??鞈
  }
  if (category === '??') {
    return type === '?臬'
      ? { debit: capital, credit: bank }   // ?狡 / ???∪ / 皜?
      : { debit: bank, credit: capital };  // ?⊥?亥? / ?狡
  }
  // ?身嚗?璆剜暑??
  return type === '?臬'
    ? { debit: expense, credit: bank }
    : { debit: bank, credit: revenue };
}

// 隢??憭梁??賢?鋆? journal.js 瑼?銝?
export function buildJournalEntries(transactions = []) {
  const accounts = loadChartOfAccounts();
  return transactions.map(tx => {
    const { debit, credit } = resolveAccounts(accounts, tx.category, tx.type);
    
    return {
      date: tx.date || '-',
      memo: tx.desc || tx.summary || '?芾酉??,
      bank: tx.bank || '-',
      debitAccountCode: debit ? debit.code : '-',
      debitAccountName: debit ? debit.name : '-',
      debitAmount: Number(tx.amount || 0),
      creditAccountCode: credit ? credit.code : '-',
      creditAccountName: credit ? credit.name : '-',
      creditAmount: Number(tx.amount || 0),
      voucher: tx.id || '-',
      status: '撌脣撣?
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
      summary: entry.memo || '?芾酉??,
      bank: '-',
      debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
      debitAmount: debitBase(entry),
      creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
      creditAmount: creditBase(entry),
      voucher: entry.transaction_id || '-',
      status: '撌脣撣?
    }));
  } catch (err) {
    console.warn('敺?journal_entries 霈?仃????雿輻?砍閮?:', err.message);
    const { journalEntries: localEntries } = runAccountingPipeline(transactions);
    return localEntries.map(entry => ({
      date: entry.date, summary: entry.memo, bank: entry.bank,
      debitAccount: `${entry.debitAccountCode} ${entry.debitAccountName}`, debitAmount: entry.debitAmount,
      creditAccount: `${entry.creditAccountCode} ${entry.creditAccountName}`, creditAmount: entry.creditAmount,
      voucher: entry.voucher, status: entry.status
    }));
  }
}