export function buildGeneralLedger(journalEntries, accounts) {
  const ledger = {};
  accounts.forEach(acc => {
    ledger[acc.id] = { account: acc, entries: [], debitTotal: 0, creditTotal: 0 };
  });

  journalEntries.forEach(entry => {
    if (ledger[entry.debitAccountId]) {
      ledger[entry.debitAccountId].entries.push({ ...entry, side: 'debit' });
      ledger[entry.debitAccountId].debitTotal += entry.debitAmount;
    }
    if (ledger[entry.creditAccountId]) {
      ledger[entry.creditAccountId].entries.push({ ...entry, side: 'credit' });
      ledger[entry.creditAccountId].creditTotal += entry.creditAmount;
    }
  });

  return ledger;
}