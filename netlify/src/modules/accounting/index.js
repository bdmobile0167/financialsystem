import { loadChartOfAccounts } from './chartOfAccounts.js';
import { buildJournalEntries } from './journal.js';
import { buildGeneralLedger } from './ledger.js';
import { buildTrialBalance } from './trialBalance.js';

export function runAccountingPipeline(transactions) {
  const accounts = loadChartOfAccounts();
  const journalEntries = buildJournalEntries(transactions);
  const generalLedger = buildGeneralLedger(journalEntries, accounts);
  const trialBalance = buildTrialBalance(generalLedger);
  return { accounts, journalEntries, generalLedger, trialBalance };
}

export * from './chartOfAccounts.js';
export * from './journal.js';
export * from './ledger.js';
export * from './trialBalance.js';
export * from './equity.js';
export * from './cashflow.js';