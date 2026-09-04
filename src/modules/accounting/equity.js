import { runAccountingPipeline } from './index.js';

export function buildEquityAnalysis(transactions = [], openingCapital = 0) {
  const { trialBalance } = runAccountingPipeline(transactions);
  const capitalOpening = Number(openingCapital || 0);

  const totalRevenue = trialBalance.rows
    .filter(row => row.code.startsWith('4'))
    .reduce((sum, row) => sum + (row.creditTotal - row.debitTotal), 0);

  const totalExpense = trialBalance.rows
    .filter(row => row.code.startsWith('5') || row.code.startsWith('6'))
    .reduce((sum, row) => sum + (row.debitTotal - row.creditTotal), 0);

  const retainedEarnings = totalRevenue - totalExpense;
  const capitalRow = trialBalance.rows.find(row => row.code === '3110');
  const capitalChange = capitalRow ? capitalRow.creditTotal - capitalRow.debitTotal : 0;
  const endingEquity = capitalOpening + capitalChange + retainedEarnings;

  const bankRow = trialBalance.rows.find(row => row.code === '1102');
  const cashBalance = bankRow ? bankRow.debitTotal - bankRow.creditTotal : 0;

  const monthsCovered = new Set((transactions || []).map(tx => (tx.date || tx.tx_date || '').slice(0, 7))).size || 1;
  const avgMonthlyExpense = totalExpense / monthsCovered;
  const cashRunwayMonths = avgMonthlyExpense > 0 ? cashBalance / avgMonthlyExpense : null;

  let fundraisingSuggestion = 'Cash runway is stable based on current records.';
  if (cashRunwayMonths !== null && cashRunwayMonths < 3) {
    fundraisingSuggestion = `Cash runway is about ${cashRunwayMonths.toFixed(1)} months. Review fundraising or expense controls.`;
  } else if (retainedEarnings < 0 && Math.abs(retainedEarnings) > capitalOpening * 0.3) {
    fundraisingSuggestion = 'Accumulated loss is material compared with opening capital. Review funding plan.';
  }

  return {
    openingCapital: capitalOpening,
    capitalChange,
    retainedEarnings,
    endingEquity,
    cashBalance,
    cashRunwayMonths,
    fundraisingSuggestion
  };
}
