export async function renderTransactionTable() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Transaction rendering is owned by scripts/ui.js.');
}

export async function renderBankAccounts() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Bank account rendering is owned by scripts/ui.js.');
}

export function setupTransactionForm() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Use #transactionForm in scripts/ui.js with create_manual_bank_transaction_entry RPC.');
}

export async function populateStatementBankAccountSelect() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Bank statement import is owned by scripts/ui.js.');
}

export function detectParserCode() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Bank statement parser detection is owned by scripts/ui.js.');
  return null;
}

export async function handleParseStatement() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Bank statement parsing is owned by scripts/ui.js.');
}

export async function handleConfirmImportStatement() {
  console.warn('src/modules/transaction/transactionUI.js is deprecated. Bank statement import is owned by scripts/ui.js.');
}
