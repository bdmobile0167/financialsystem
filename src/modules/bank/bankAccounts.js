import { supabase } from '../../../scripts/supabaseClient.js';

export async function loadBankAccounts() {
  const { data, error } = await supabase.from('bank_accounts').select('*').order('bank_name');
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
      created_by: user?.id
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
  if (error) throw error;
}

export function getBankBalance(id, transactions = []) { /* 保持原有邏輯 */ }