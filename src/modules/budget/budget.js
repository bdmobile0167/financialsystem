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
  existing ? (existing.amount = Number(amount)) : targets.push({ period, accountCode, amount: Number(amount) });
  saveBudgetTargets(targets);
  return targets;
}

const ACCOUNT_NAMES = { '4111': '營業收入', '6100': '營業費用', '1601': '固定資產', '3110': '股本' };

function getActualForPeriod(transactions, period, accountCode) {
  const periodTx = transactions.filter(t => (t.date || '').slice(0, 7) === period);
  const { trialBalance } = runAccountingPipeline(periodTx);
  const row = trialBalance.rows.find(r => r.code === accountCode);
  if (!row) return 0;
  return ['expense', 'asset'].includes(row.type) ? row.debitTotal - row.creditTotal : row.creditTotal - row.debitTotal;
}

// 自動計算：只要設定過目標，實際數字每次都直接從分錄/總帳重新算，不用手動輸入
export function buildBudgetReport(transactions, period) {
  return loadBudgetTargets().filter(t => t.period === period).map(target => {
    const actual = getActualForPeriod(transactions, period, target.accountCode);
    const variance = actual - target.amount;
    return {
      period, accountCode: target.accountCode,
      accountName: ACCOUNT_NAMES[target.accountCode] || target.accountCode,
      budget: target.amount, actual, variance,
      variancePercent: target.amount ? (variance / target.amount) * 100 : 0
    };
  });
}

export async function createProject(projectData) {
  const code = `PROJ-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2,'0')}-${Math.floor(Math.random()*999).toString().padStart(3,'0')}`;
  
  const { data, error } = await supabase
    .from('projects')
    .insert([{ ...projectData, project_code: code, remaining_budget: projectData.total_budget }])
    .select().single();
  if (error) throw error;
  return data;
}