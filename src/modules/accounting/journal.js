import { loadChartOfAccounts } from './chartOfAccounts.js';
import { runAccountingPipeline } from './index.js';
import { supabase } from '../../../scripts/supabaseClient.js';

function debitBase(entry) {
  return Number(entry?.debit_amount_base ?? entry?.debit_amount ?? 0);
}

function creditBase(entry) {
  return Number(entry?.credit_amount_base ?? entry?.credit_amount ?? 0);
}

function resolveAccounts(accounts, category, type) {
  const bank = accounts.find(account => account.code === '1102');
  const expense = accounts.find(account => account.code === '6100');
  const revenue = accounts.find(account => account.code === '4111');
  const fixedAsset = accounts.find(account => account.code === '1601');
  const capital = accounts.find(account => account.code === '3110');

  if (category === '投資' || category === 'investing') {
    return type === '支出'
      ? { debit: fixedAsset, credit: bank }
      : { debit: bank, credit: fixedAsset };
  }

  if (category === '融資' || category === 'financing') {
    return type === '支出'
      ? { debit: capital, credit: bank }
      : { debit: bank, credit: capital };
  }

  return type === '支出'
    ? { debit: expense, credit: bank }
    : { debit: bank, credit: revenue };
}

export function buildJournalEntries(transactions = []) {
  const accounts = loadChartOfAccounts();
  return transactions.map(tx => {
    const { debit, credit } = resolveAccounts(accounts, tx.category, tx.type);
    const amount = Number(tx.amount_base ?? tx.amount ?? 0);

    return {
      date: tx.date || tx.tx_date || '-',
      memo: tx.desc || tx.summary || tx.description || 'No memo',
      bank: tx.bank || '-',
      debitAccountId: debit?.id || null,
      debitAccountCode: debit?.code || '-',
      debitAccountName: debit?.name || '-',
      debitAmount: amount,
      creditAccountId: credit?.id || null,
      creditAccountCode: credit?.code || '-',
      creditAccountName: credit?.name || '-',
      creditAmount: amount,
      voucher: tx.id || tx.voucher_no || '-',
      status: 'posted'
    };
  });
}

export async function buildJournal(transactions = []) {
  try {
    const { data: journalEntries, error } = await supabase
      .from('journal_entries')
      .select(`
        *,
        debit_account:accounts!journal_entries_debit_account_id_fkey(code, name),
        credit_account:accounts!journal_entries_credit_account_id_fkey(code, name),
        vouchers(voucher_no)
      `)
      .order('entry_date', { ascending: false });

    if (error) throw error;

    return (journalEntries || []).map(entry => ({
      date: entry.entry_date,
      summary: entry.memo || 'No memo',
      bank: '-',
      debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
      debitAmount: debitBase(entry),
      creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
      creditAmount: creditBase(entry),
      voucher: entry.vouchers?.voucher_no || entry.voucher_id || entry.transaction_id || '-',
      status: 'posted'
    }));
  } catch (err) {
    console.warn('Unable to load Supabase journal entries, using local transactions:', err.message);
    const { journalEntries: localEntries } = runAccountingPipeline(transactions);
    return localEntries.map(entry => ({
      date: entry.date,
      summary: entry.memo,
      bank: entry.bank,
      debitAccount: `${entry.debitAccountCode} ${entry.debitAccountName}`,
      debitAmount: entry.debitAmount,
      creditAccount: `${entry.creditAccountCode} ${entry.creditAccountName}`,
      creditAmount: entry.creditAmount,
      voucher: entry.voucher,
      status: entry.status
    }));
  }
}
