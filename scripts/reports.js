import { runAccountingPipeline, buildEquityAnalysis, buildCashFlowByActivity } from '../src/modules/accounting/index.js';

export function summarizeTransactions(transactions) {
  const revenue = transactions.filter(t => t.type === '收入').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = transactions.filter(t => t.type === '支出').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = revenue - expense;
  return { revenue, expense, netProfit };
}

export function buildJournal(transactions) {
  const { journalEntries } = runAccountingPipeline(transactions);
  return journalEntries.map(entry => ({
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

export function getEquityAnalysis(transactions) {
  return buildEquityAnalysis(transactions);
}

export function getTrialBalance(transactions) {
  return runAccountingPipeline(transactions).trialBalance;
}