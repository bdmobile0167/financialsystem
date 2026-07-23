import { runAccountingPipeline, buildEquityAnalysis, buildCashFlowByActivity } from '../src/modules/accounting/index.js';
import { supabase } from './supabaseClient.js';

export function summarizeTransactions(transactions) {
  const revenue = transactions.filter(t => t.type === '收入').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = transactions.filter(t => t.type === '支出').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = revenue - expense;
  return { revenue, expense, netProfit };
}

// ✅ 修正版：優先從 Supabase journal_entries 讀取
// reports.js
export async function buildJournal(transactions = []) {
  try {
    const { data: journalEntries, error } = await supabase   // 改成直接用 supabase
      .from('journal_entries')
      .select(`
        *,
        accounts!inner(code, name)
      `)
      .order('entry_date', { ascending: false });

    if (error) throw error;

    return journalEntries.map(entry => ({
      date: entry.entry_date || entry.date,
      summary: entry.description || entry.memo || '未註明',
      bank: entry.bank_name || entry.bank || '-',
      debitAccount: `${entry.debit_account_code || ''} ${entry.debit_account_name || ''}`.trim(),
      debitAmount: Number(entry.debit_amount || 0),
      creditAccount: `${entry.credit_account_code || ''} ${entry.credit_account_name || ''}`.trim(),
      creditAmount: Number(entry.credit_amount || 0),
      voucher: entry.voucher_no || entry.voucher || '-',
      status: entry.status || '已入帳'
    }));
  } catch (err) {
    console.warn('從 journal_entries 讀取失敗，降級使用本地計算:', err.message);
    
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

export function buildIncomeStatement(transactions) {
  const { trialBalance } = runAccountingPipeline(transactions);
  const revenueRow = trialBalance.rows.find(r => r.code === '4111');
  const expenseRow = trialBalance.rows.find(r => r.code === '6100');
  const revenue = revenueRow ? revenueRow.creditTotal - revenueRow.debitTotal : 0;
  const expense = expenseRow ? expenseRow.debitTotal - expenseRow.creditTotal : 0;
  const netProfit = revenue - expense;
  return [
    ['營業收入', revenue],
    ['營業費用', -expense],
    ['本期淨利', netProfit]
  ];
}

export function buildBalanceSheet(transactions) {
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

export function buildCashflowStatement(transactions) {
  const { operating, investing, financing, net } = buildCashFlowByActivity(transactions);
  return [
    ['營業活動現金流量', operating],
    ['投資活動現金流量', investing],
    ['融資活動現金流量', financing],
    ['淨現金增加額', net]
  ];
}

export function buildEquityStatement(transactions) {
  const { openingCapital, capitalChange, retainedEarnings, endingEquity } = buildEquityAnalysis(transactions);
  return [
    ['期初股本', openingCapital],
    ['本期新增股本（募資/借款）', capitalChange],
    ['本期損益（保留盈餘）', retainedEarnings],
    ['期末權益合計', endingEquity]
  ];
}

export function getEquityAnalysis(transactions) {
  return buildEquityAnalysis(transactions);
}

export function getTrialBalance(transactions) {
  return runAccountingPipeline(transactions).trialBalance;
}

export async function fetchJournalEntries() {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*, accounts(*)')
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return data;
}