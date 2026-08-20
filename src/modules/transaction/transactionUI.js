import { supabase } from '../../../scripts/supabaseClient.js';
import { showMessage, getBankNickname, populateBankSelect } from '../utils/uiHelpers.js';
import { loadBankAccounts, getBankBalance } from '../bank/bankAccounts.js';
import { fetchBankAccounts } from '../voucher/voucherApi.js';

export async function renderTransactionTable() {
  let txs = window.state.transactions || [];
  
  if (window.state.currentProjectId && window.state.currentProjectId !== 'all') {
    txs = txs.filter(tx => tx.project_id === window.state.currentProjectId);
  }

  const body = document.getElementById('transactionTableBody');
  if (!body) return;
  
  body.innerHTML = '';
  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="8" class="muted">目前尚無交易資料。</td></tr>';
    return;
  }
  
  txs.forEach((tx, index) => {
    const row = document.createElement('tr');
    
    const voucherDisplay = tx.voucher_id ? 
      `<a href="javascript:void(0)" onclick="viewVoucherDetail('${tx.voucher_id}')" style="color:#007bff; font-weight:bold; text-decoration:underline;">${tx.voucher || '檢視憑證'}</a>` : 
      (tx.voucher ? `<span class="badge">${tx.voucher}</span>` : '<span class="badge wait">無憑證</span>');

    row.innerHTML = `
      <td>${voucherDisplay}</td>
      <td>${tx.date}</td>
      <td>${getBankNickname(tx.bankAccountId) || tx.bank || '未設定'}</td>
      <td>${tx.detail}<div class="muted">${tx.customer || ''}</div></td>
      <td>${tx.type}</td>
      <td>${tx.category || '營業'}</td>
      <td>$${Number(tx.amount).toLocaleString()}</td>
      <td><button class="secondary delete-transaction-btn" data-index="${index}">刪除</button></td>
    `;
    body.appendChild(row);
  });
}

export async function renderBankAccounts() {
  const body = document.getElementById('bankAccountTableBody');
  if (!body) return;

  try {
    let accounts = await loadBankAccounts();
    if (!accounts || !Array.isArray(accounts)) accounts = [];

    body.innerHTML = accounts.map(a => {
      const totalBalance = a.current_balance !== null && a.current_balance !== undefined
        ? Number(a.current_balance || 0)
        : null;
      const balanceDisplay = totalBalance === null ? '尚無餘額資料' : totalBalance.toLocaleString();

      return `
        <tr>
          <td>${a.bank_name || a.bankName || '未命名'}</td>
          <td>${a.account_number || a.accountNumber || '-'}</td>
          <td>${a.nickname || '-'}</td>
          <td>${balanceDisplay}</td>
          <td>
            <button class="secondary edit-bank-btn" data-id="${a.id}">編輯</button>
            <button class="danger delete-bank-btn" data-id="${a.id}">刪除</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5" class="muted">尚未設定銀行帳戶。</td></tr>';

    populateBankSelect(document.getElementById('txBankAccount'), accounts);
    populateBankSelect(document.getElementById('vBankAccount'), accounts);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<tr><td colspan="5" class="muted">載入失敗</td></tr>';
  }
}

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
          created_by: window.state?.currentUser?.id,        }]);

      if (error) throw error;

      alert('交易新增成功！');
      e.target.reset();
    } catch (err) {
      alert(`新增交易失敗: ${err.message}`);
      console.error(err);
    }
  });
}

let parsedStatementRecords = [];
let availableBankAccounts = [];

export async function populateStatementBankAccountSelect() {
  const select = document.getElementById('statementBankAccountId');
  if (!select) return;
  
  availableBankAccounts = await fetchBankAccounts();
  
  select.innerHTML = '<option value="">請選擇銀行帳戶...</option>' + 
    availableBankAccounts.map(b => 
      `<option value="${b.id}">${b.bank_name} - ${b.account_number.slice(-4)} (${b.nickname || ''})</option>`
    ).join('');

  select.addEventListener('change', (e) => {
    const bankCode = detectParserCode(e.target.value);
    const hintEl = document.getElementById('detectedParserText');
    if (bankCode) {
      hintEl.innerHTML = `✅ 已自動對應解析規則：<strong>${bankCode}</strong>`;
      hintEl.style.color = 'green';
    } else if (e.target.value) {
      hintEl.innerHTML = `⚠️ 系統目前沒有此銀行帳戶的 PDF 解析規則`;
      hintEl.style.color = 'red';
    } else {
      hintEl.innerHTML = '';
    }
  });
}

export function detectParserCode(bankId) {
  const bank = availableBankAccounts.find(b => b.id === bankId);
  if (!bank) return null;

  const bankName = bank.bank_name || '';
  const accNum = bank.account_number || '';
  const last3 = accNum.slice(-3);

  if (bankName.includes('玉山')) return `玉山${last3}`;
  if (bankName.includes('兆豐')) return `兆豐${last3}`;
  
  return null; 
}

export async function handleParseStatement() {
  const fileInput = document.getElementById('statementFileInput');
  const bankAccountId = document.getElementById('statementBankAccountId').value;
  const previewArea = document.getElementById('statementPreviewArea');
  const file = fileInput?.files[0];

  if (!bankAccountId) { showMessage('請先選擇對應的銀行帳戶。', true); return; }
  if (!file) { showMessage('請先選擇 PDF 檔案。', true); return; }

  const bankCode = detectParserCode(bankAccountId);
  if (!bankCode) {
    showMessage('系統目前無法解析此銀行的對帳單，請確認是否為支援的帳戶。', true);
    return;
  }

  previewArea.innerHTML = '<p class="muted">解析中，請稍候…</p>';

  try {
    const fileBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch('/api/parse-bank-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, bankCode })
    });
    
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || '解析失敗');

    parsedStatementRecords = result.records;

    if (!parsedStatementRecords.length) {
      previewArea.innerHTML = '<p class="muted">沒有解析到任何交易紀錄，請確認 PDF 格式或銀行別是否正確。</p>';
      return;
    }

    previewArea.innerHTML = `
      <p>解析到 <strong>${parsedStatementRecords.length}</strong> 筆交易，請確認後匯入：</p>
      <table>
        <thead><tr><th>日期</th><th>摘要</th><th>對象</th><th>支出</th><th>收入</th><th>餘額</th></tr></thead>
        <tbody>
          ${parsedStatementRecords.map(r => `
            <tr>
              <td>${r.date || '-'}</td><td>${r.detail || '-'}</td><td>${r.counterparty || '-'}</td>
              <td>${r.expense ? Number(r.expense).toLocaleString() : '-'}</td>
              <td>${r.income ? Number(r.income).toLocaleString() : '-'}</td>
              <td>${r.balance != null ? Number(r.balance).toLocaleString() : '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <button id="confirmImportStatementBtn" class="primary-btn" style="margin-top:12px;">確認匯入帳單庫</button>
    `;

    document.getElementById('confirmImportStatementBtn')?.addEventListener('click', handleConfirmImportStatement);
  } catch (error) {
    previewArea.innerHTML = `<p class="muted">解析失敗：${error.message}</p>`;
  }
}

export async function handleConfirmImportStatement() {
  const bankAccountId = document.getElementById('statementBankAccountId').value;
  const bankCode = detectParserCode(bankAccountId); 
  const fileName = document.getElementById('statementFileInput')?.files[0]?.name || '';
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const rows = parsedStatementRecords
      .filter(r => r.date)
      .map(r => ({
        bank_account_id: bankAccountId || null,
        bank_code: bankCode,
        tx_date: r.date.replace(/\//g, '-'),
        detail: r.detail,
        counterparty: r.counterparty,
        expense: r.expense || 0,
        income: r.income || 0,
        balance: r.balance,
        source_file_name: fileName,
        uploaded_by: user.id
      }));

    const rowsWithCompany = rows.map(r => ({ ...r,  }));
    const { error } = await supabase.from('bank_statement_transactions').insert(rowsWithCompany);
    if (error) throw error;

    showMessage(`已匯入 ${rows.length} 筆對帳資料。`);
    document.getElementById('statementPreviewArea').innerHTML = '';
    document.getElementById('statementFileInput').value = '';
    document.getElementById('detectedParserText').innerHTML = '';
  } catch (error) {
    showMessage(`匯入失敗：${error.message}`, true);
  }
}
