import { runAccountingPipeline, buildEquityAnalysis, buildCashFlowByActivity } from '../src/modules/accounting/index.js';
import { supabase } from './supabaseClient.js';
import { COMPANY_INFO } from './company-data.js';

export function summarizeTransactions(transactions) {
  const revenue = transactions.filter(t => t.type === '收入').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = transactions.filter(t => t.type === '支出').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = revenue - expense;
  return { revenue, expense, netProfit };
}

async function fetchSupabaseTrialBalance(startDate, endDate) {
  let query = supabase.from('journal_entries').select('*');
  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);
  const { data: entries, error } = await query;
  if (error) throw error;

  const { data: accounts, error: accError } = await supabase.from('accounts').select('*');
  if (accError) throw accError;

  const ledger = {};
  accounts.forEach(acc => { ledger[acc.id] = { account: acc, debitTotal: 0, creditTotal: 0 }; });

  entries.forEach(entry => {
    if (ledger[entry.debit_account_id]) ledger[entry.debit_account_id].debitTotal += Number(entry.debit_amount || 0);
    if (ledger[entry.credit_account_id]) ledger[entry.credit_account_id].creditTotal += Number(entry.credit_amount || 0);
  });

  const rows = Object.values(ledger)
    .filter(item => item.debitTotal > 0 || item.creditTotal > 0)
    .map(item => ({
      code: item.account.code,
      name: item.account.name,
      type: item.account.type,
      debitTotal: item.debitTotal,
      creditTotal: item.creditTotal
    }));

  return { rows };
}

export async function buildJournal(transactions = [], startDate = null, endDate = null) {
  try {
    let query = supabase
      .from('journal_entries')
      .select(`
        *,
        debit_account:accounts!debit_account_id(code, name),
        credit_account:accounts!credit_account_id(code, name)
      `)
      .order('entry_date', { ascending: false });
      
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);

    const { data: journalEntries, error } = await query;
    if (error) throw error;

    return journalEntries.map(entry => ({
      date: entry.entry_date,
      summary: entry.memo || '未註明',
      bank: '-',
      debitAccount: entry.debit_account ? `${entry.debit_account.code} ${entry.debit_account.name}` : '-',
      debitAmount: Number(entry.debit_amount || 0),
      creditAccount: entry.credit_account ? `${entry.credit_account.code} ${entry.credit_account.name}` : '-',
      creditAmount: Number(entry.credit_amount || 0),
      voucher: entry.voucher_id || '-',
      status: '已入帳'
    }));
  } catch (err) {
    console.warn('日記帳讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { journalEntries: localEntries } = runAccountingPipeline(transactions);
    return localEntries.map(entry => ({
      date: entry.date, summary: entry.memo, bank: entry.bank,
      debitAccount: `${entry.debitAccountCode} ${entry.debitAccountName}`, debitAmount: entry.debitAmount,
      creditAccount: `${entry.creditAccountCode} ${entry.creditAccountName}`, creditAmount: entry.creditAmount,
      voucher: entry.voucher, status: entry.status
    }));
  }
}

export async function buildIncomeStatement(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const revenueRow = rows.find(r => r.code === '4111');
    const expenseRow = rows.find(r => r.code === '6100');
    const revenue = revenueRow ? revenueRow.creditTotal - revenueRow.debitTotal : 0;
    const expense = expenseRow ? expenseRow.debitTotal - expenseRow.creditTotal : 0;
    const netProfit = revenue - expense;
    return [['營業收入', revenue], ['營業費用', -expense], ['本期淨利', netProfit]];
  } catch (err) {
    console.warn('損益表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { trialBalance } = runAccountingPipeline(transactions);
    const revenueRow = trialBalance.rows.find(r => r.code === '4111');
    const expenseRow = trialBalance.rows.find(r => r.code === '6100');
    const revenue = revenueRow ? revenueRow.creditTotal - revenueRow.debitTotal : 0;
    const expense = expenseRow ? expenseRow.debitTotal - expenseRow.creditTotal : 0;
    const netProfit = revenue - expense;
    return [['營業收入', revenue], ['營業費用', -expense], ['本期淨利', netProfit]];
  }
}

export async function buildBalanceSheet(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const bankRow = rows.find(r => r.code === '1102');
    const cash = bankRow ? bankRow.debitTotal - bankRow.creditTotal : 0;
    const revenueRow = rows.find(r => r.code === '4111');
    const expenseRow = rows.find(r => r.code === '6100');
    const revenue = revenueRow ? revenueRow.creditTotal - revenueRow.debitTotal : 0;
    const expense = expenseRow ? expenseRow.debitTotal - expenseRow.creditTotal : 0;
    const netProfit = revenue - expense;
    return [
      ['現金及銀行存款', Math.max(0, cash)],
      ['流動資產合計', Math.max(0, cash)],
      ['本期淨利(權益)', netProfit],
      ['權益合計', netProfit]
    ];
  } catch (err) {
    console.warn('資產負債表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { trialBalance } = runAccountingPipeline(transactions);
    const bankRow = trialBalance.rows.find(r => r.code === '1102');
    const cash = bankRow ? bankRow.debitTotal - bankRow.creditTotal : 0;
    const { netProfit } = summarizeTransactions(transactions);
    return [
      ['現金及銀行存款', Math.max(0, cash)],
      ['流動資產合計', Math.max(0, cash)],
      ['本期淨利(權益)', netProfit],
      ['權益合計', netProfit]
    ];
  }
}

export async function buildCashflowStatement(transactions, startDate = null, endDate = null) {
  try {
    const { data: bankAccount, error: bankErr } = await supabase.from('accounts').select('id').eq('code', '1102').single();
    if (bankErr || !bankAccount) throw new Error('找不到銀行存款科目');

    let query = supabase
      .from('journal_entries')
      .select('debit_account_id, credit_account_id, debit_amount, credit_amount, voucher_id, vouchers(category)')
      .not('voucher_id', 'is', null);
    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);
    const { data: entries, error } = await query;
    if (error) throw error;

    const totals = { 營業: 0, 投資: 0, 融資: 0 };
    entries.forEach(entry => {
      const category = entry.vouchers?.category || '營業';
      if (!(category in totals)) totals[category] = 0;
      if (entry.debit_account_id === bankAccount.id) totals[category] += Number(entry.debit_amount || 0);
      if (entry.credit_account_id === bankAccount.id) totals[category] -= Number(entry.credit_amount || 0);
    });

    const net = totals['營業'] + totals['投資'] + totals['融資'];
    return [
      ['營業活動現金流量', totals['營業']],
      ['投資活動現金流量', totals['投資']],
      ['融資活動現金流量', totals['融資']],
      ['淨現金增加額', net]
    ];
  } catch (err) {
    console.warn('現金流量表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { operating, investing, financing, net } = buildCashFlowByActivity(transactions);
    return [
      ['營業活動現金流量', operating],
      ['投資活動現金流量', investing],
      ['融資活動現金流量', financing],
      ['淨現金增加額', net]
    ];
  }
}

export async function buildEquityStatement(transactions, startDate = null, endDate = null) {
  try {
    const { rows } = await fetchSupabaseTrialBalance(startDate, endDate);
    const revenueRow = rows.find(r => r.code === '4111');
    const expenseRow = rows.find(r => r.code === '6100');
    const revenue = revenueRow ? revenueRow.creditTotal - revenueRow.debitTotal : 0;
    const expense = expenseRow ? expenseRow.debitTotal - expenseRow.creditTotal : 0;
    const retainedEarnings = revenue - expense;

    const capitalRow = rows.find(r => r.code === '3110');
    const capitalChange = capitalRow ? capitalRow.creditTotal - capitalRow.debitTotal : 0;

    const openingCapital = Number(COMPANY_INFO.totalCapital || 0);
    const endingEquity = openingCapital + capitalChange + retainedEarnings;

    return [
      ['期初股本', openingCapital],
      ['本期新增股本（募資/借款）', capitalChange],
      ['本期損益（保留盈餘）', retainedEarnings],
      ['期末權益合計', endingEquity]
    ];
  } catch (err) {
    console.warn('權益變動表讀取 Supabase 失敗，降級使用本地計算:', err.message);
    const { openingCapital, capitalChange, retainedEarnings, endingEquity } = buildEquityAnalysis(transactions);
    return [
      ['期初股本', openingCapital],
      ['本期新增股本（募資/借款）', capitalChange],
      ['本期損益（保留盈餘）', retainedEarnings],
      ['期末權益合計', endingEquity]
    ];
  }
}

export function getEquityAnalysis(transactions) {
  return buildEquityAnalysis(transactions);
}

export function getTrialBalance(transactions) {
  return runAccountingPipeline(transactions).trialBalance;
}