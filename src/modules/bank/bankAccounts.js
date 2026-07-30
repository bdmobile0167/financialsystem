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

export function getBankBalance(id, transactions = []) {
  if (!id) return 0;
  return transactions
    .filter(tx => tx.bankAccountId === id)
    .reduce((sum, tx) => {
      const amt = Number(tx.amount || 0);
      return tx.type === '收入' ? sum + amt : sum - amt;
    }, 0);
}

// 交易新增（移到 ui.js 初始化時呼叫，避免 DOM 未 ready）
export function setupTransactionForm() {
  const form = document.getElementById('addTransactionForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const bankAccountId = document.getElementById('trans_bank_account_id').value;
    const transType = document.getElementById('trans_type').value;
    const amount = parseFloat(document.getElementById('trans_amount').value);
    const transDate = document.getElementById('trans_date').value;
    const description = document.getElementById('trans_description').value;

    if (!bankAccountId || !transType || !amount || !transDate) {
      return alert('請填寫所有必填欄位！');
    }

    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .insert([{
          bank_account_id: bankAccountId,
          type: transType,
          amount: amount,
          transaction_date: transDate,
          description: description,
          created_by: state?.currentUser?.id
        }]);

      if (error) throw error;

      alert('交易新增成功！');
      e.target.reset();
    } catch (err) {
      alert(`新增交易失敗: ${err.message}`);
      console.error(err);
    }
  });
}