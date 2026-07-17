import { supabase } from '../../../scripts/supabaseClient.js';

export async function loadBankAccounts() {
  const { data, error } = await supabase.from('bank_accounts').select('*').order('bank_name');
  if (error) throw error;
  return data || [];
}

export async function addBankAccount({ bankName, accountNumber, nickname, openingBalance }) {
  const { data, error } = await supabase.from('bank_accounts').insert({
    bank_name: bankName,
    account_number: accountNumber,
    nickname: nickname || `${bankName}${accountNumber.slice(-4)}`,
    opening_balance: Number(openingBalance || 0)
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
  if (error) throw error;
}

export function getBankBalance(id, transactions = []) { /* 保持原有邏輯 */ }