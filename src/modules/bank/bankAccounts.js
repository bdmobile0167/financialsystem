import { supabase } from '../../../scripts/supabaseClient.js';

export async function loadBankAccounts() {  let q = supabase.from('bank_accounts').select('*').order('bank_name');  const { data, error } = await q;
  if (error) throw error;
  return attachBankAccountBalances(data || []);
}

export async function loadBankAccountBalances() {
  const { data, error } = await supabase.from('bank_account_balances').select('*');
  if (error) throw error;
  return data || [];
}

export async function attachBankAccountBalances(accounts = []) {
  let balances = [];
  try {
    balances = await loadBankAccountBalances();
  } catch (error) {
    console.warn('讀取 bank_account_balances 失敗，銀行目前餘額將顯示為空值:', error);
  }

  const byBankAccountId = new Map();
  balances.forEach(row => {
    const key = row.bank_account_id || row.account_id || row.bank_id || row.id;
    if (key) byBankAccountId.set(key, row);
  });

  return accounts.map(account => {
    const balance = byBankAccountId.get(account.id);
    const currentBalance = balance?.current_balance ?? balance?.balance ?? balance?.ending_balance ?? null;
    return {
      ...account,
      balance_record: balance || null,
      current_balance: currentBalance,
      actual_current_balance: currentBalance
    };
  });
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
      created_by: user?.id,    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
  if (error) throw error;
}

/**
 * 計算銀行帳戶的即時餘額
 * 邏輯：期初餘額 + 收入總額 - 支出總額
 * @param {Object} bankAccount - 銀行帳戶物件（需包含 opening_balance）
 * @param {Array} transactions - 該帳戶的所有交易流水陣列
 */
export function getBankBalance(bankAccount, transactions = []) {
  if (!bankAccount) return 0;
  if (typeof bankAccount === 'object' && bankAccount.current_balance !== null && bankAccount.current_balance !== undefined) {
    return Number(bankAccount.current_balance || 0);
  }

  const bankAccountId = typeof bankAccount === 'object' ? bankAccount.id : bankAccount;
  
  // 1. 取得期初餘額 (若無則預設為 0)
  const openingBalance = typeof bankAccount === 'object' ? Number(bankAccount.opening_balance || 0) : 0;
  
  // 2. 計算該帳戶歷年/當期所有交易的淨額 (收入加、支出減)
  const netTransactions = transactions
    .filter(tx => tx.bank_account_id === bankAccountId || tx.bankAccountId === bankAccountId)
    .reduce((sum, tx) => {
      const amt = Number(tx.amount || 0);
      return tx.type === '收入' ? sum + amt : sum - amt;
    }, 0);

  // 3. 期初 + 異動數 = 最終剩餘金額
  return openingBalance + netTransactions;
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
          created_by: state?.currentUser?.id,        }]);

      if (error) throw error;

      alert('交易新增成功！');
      e.target.reset();
    } catch (err) {
      alert(`新增交易失敗: ${err.message}`);
      console.error(err);
    }
  });
}
