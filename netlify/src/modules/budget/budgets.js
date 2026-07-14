import { runAccountingPipeline } from '../accounting/index.js';

const STORAGE_KEY = 'budgetTargets';

export function loadBudgetTargets() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}
export function saveBudgetTargets(targets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
}
export function setBudgetTarget(period, accountCode, amount) {
  const targets = loadBudgetTargets();
  const existing = targets.find(t => t.period === period && t.accountCode === accountCode);
  existing ? (existing.amount = amount) : targets.push({ period, accountCode, amount });
  saveBudgetTargets(targets);
  return targets;
}
function getActualForPeriod(transactions, period, accountCode) {
  const periodTx = transactions.filter(t => (t.date || '').slice(0, 7) === period);
  const { trialBalance } = runAccountingPipeline(periodTx);
  const row = trialBalance.rows.find(r => r.code === accountCode);
  if (!row) return 0;
  return ['expense', 'asset'].includes(row.type) ? row.debitTotal - row.creditTotal : row.creditTotal - row.debitTotal;
}
export function buildBudgetReport(transactions, period) {
  return loadBudgetTargets().filter(t => t.period === period).map(target => {
    const actual = getActualForPeriod(transactions, period, target.accountCode);
    const variance = actual - target.amount;
    return { period, accountCode: target.accountCode, budget: target.amount, actual, variance, variancePercent: target.amount ? (variance / target.amount) * 100 : 0 };
  });
}