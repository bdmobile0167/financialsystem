import { supabase } from '../../../scripts/supabaseClient.js';

export async function loadBankAccounts() {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .order('bank_name');

  if (error) throw error;
  return data || [];
}

export async function addBankAccount(account) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert([{
      bank_name: account.bank_name,
      account_number: account.account_number,
      nickname: account.nickname,
      opening_balance: account.opening_balance,
      ledger_account_id: account.ledger_account_id || null,
      accounting_account_id: account.accounting_account_id || account.ledger_account_id || null,
      created_by: user?.id
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  const { error } = await supabase
    .from('bank_accounts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export function getBankBalance(bankAccount, transactions = []) {
  if (!bankAccount) return 0;

  const openingBalance = Number(bankAccount.opening_balance || 0);
  const netTransactions = transactions
    .filter(tx => tx.bank_account_id === bankAccount.id || tx.bankAccountId === bankAccount.id)
    .reduce((sum, tx) => {
      const amount = Number(tx.amount || 0);
      return tx.type === '收入' ? sum + amount : sum - amount;
    }, 0);

  return openingBalance + netTransactions;
}

export function setupTransactionForm() {
  console.warn('setupTransactionForm is deprecated. Use #transactionForm in scripts/ui.js with create_manual_bank_transaction_entry RPC.');
}
