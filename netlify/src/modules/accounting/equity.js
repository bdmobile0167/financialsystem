import { COMPANY_INFO } from '../../../scripts/company-data.js';
import { runAccountingPipeline } from './index.js';

export function buildEquityAnalysis(transactions) {
  const { trialBalance } = runAccountingPipeline(transactions);
  const openingCapital = Number(COMPANY_INFO.totalCapital || 0);

  const revenueRow = trialBalance.rows.find(r => r.code === '4111');
  const expenseRow = trialBalance.rows.find(r => r.code === '6100');
  const revenue = revenueRow ? revenueRow.creditTotal - revenueRow.debitTotal : 0;
  const expense = expenseRow ? expenseRow.debitTotal - expenseRow.creditTotal : 0;
  const retainedEarnings = revenue - expense;

  // 本期透過「融資活動」新增的股本（股東入資/借款 - 還款/減資）
  const capitalRow = trialBalance.rows.find(r => r.code === '3110');
  const capitalChange = capitalRow ? capitalRow.creditTotal - capitalRow.debitTotal : 0;

  const endingEquity = openingCapital + capitalChange + retainedEarnings;

  const bankRow = trialBalance.rows.find(r => r.code === '1102');
  const cashBalance = bankRow ? bankRow.debitTotal - bankRow.creditTotal : 0;

  const monthsCovered = new Set(transactions.map(t => (t.date || '').slice(0, 7))).size || 1;
  const avgMonthlyExpense = expense / monthsCovered;
  const cashRunwayMonths = avgMonthlyExpense > 0 ? cashBalance / avgMonthlyExpense : null;

  let fundraisingSuggestion = '資金水位正常，暫時不需要募資。';
  if (cashRunwayMonths !== null && cashRunwayMonths < 3) {
    fundraisingSuggestion = `目前現金僅夠支撐約 ${cashRunwayMonths.toFixed(1)} 個月營運費用，建議評估募資或增資。`;
  } else if (retainedEarnings < 0 && Math.abs(retainedEarnings) > openingCapital * 0.3) {
    fundraisingSuggestion = '累積虧損已侵蝕超過三成原始資本，建議提前規劃募資。';
  }

  return { openingCapital, capitalChange, retainedEarnings, endingEquity, cashBalance, cashRunwayMonths, fundraisingSuggestion };
}