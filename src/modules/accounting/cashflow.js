const ACTIVITY_OPERATING = 'operating';
const ACTIVITY_INVESTING = 'investing';
const ACTIVITY_FINANCING = 'financing';

function activityOf(category) {
  if (category === '投資' || category === 'investing') return ACTIVITY_INVESTING;
  if (category === '融資' || category === 'financing') return ACTIVITY_FINANCING;
  return ACTIVITY_OPERATING;
}

function amountBase(row) {
  return Number(row?.amount_base ?? row?.amount ?? 0);
}

export function buildCashFlowByActivity(transactions = []) {
  const totals = {
    [ACTIVITY_OPERATING]: 0,
    [ACTIVITY_INVESTING]: 0,
    [ACTIVITY_FINANCING]: 0
  };

  transactions.forEach(tx => {
    const activity = activityOf(tx.category);
    const signedAmount = tx.type === '收入' ? amountBase(tx) : -amountBase(tx);
    totals[activity] = (totals[activity] || 0) + signedAmount;
  });

  const net = totals[ACTIVITY_OPERATING] + totals[ACTIVITY_INVESTING] + totals[ACTIVITY_FINANCING];
  return {
    operating: totals[ACTIVITY_OPERATING],
    investing: totals[ACTIVITY_INVESTING],
    financing: totals[ACTIVITY_FINANCING],
    net
  };
}
