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

document.getElementById('addTransactionForm').addEventListener('submit', async (e) => {
  e.preventDefault(); // 阻止表單預設重整行為

  const bankAccountId = document.getElementById('trans_bank_account_id').value;
  const transType = document.getElementById('trans_type').value; // 'income' 或 'expense'
  const amount = parseFloat(document.getElementById('trans_amount').value);
  const transDate = document.getElementById('trans_date').value;
  const description = document.getElementById('trans_description').value;

  // 簡單防呆
  if (!bankAccountId || !transType || !amount || !transDate) {
    return alert('請填寫所有必填欄位！');
  }

  try {
    const { data, error } = await supabase
      .from('bank_transactions') // 確保這是你的交易資料表名稱
      .insert([{
        bank_account_id: bankAccountId,
        type: transType,
        amount: amount,
        transaction_date: transDate,
        description: description,
        created_by: state.currentUser?.id // 記錄是誰新增的 (如果有此欄位)
      }]);

    if (error) throw error;

    alert('交易新增成功！');
    document.getElementById('addTransactionModal').style.display = 'none';
    e.target.reset(); // 清空表單
    
    // 重新載入交易明細
    loadTransactions(bankAccountId); 
  } catch (err) {
    alert(`新增交易失敗: ${err.message}`);
    console.error(err);
  }
});