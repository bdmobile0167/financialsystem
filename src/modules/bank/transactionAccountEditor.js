import { fetchTransactionJournals } from './transactionQueries.js';

export async function openTransactionAccountEditor({ client, transactionId, getAccounts, onSaved }) {
  if (document.getElementById('transactionAccountDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'transactionAccountDialog';
  dialog.className = 'transaction-account-dialog';
  dialog.setAttribute('aria-labelledby', 'transactionAccountTitle');
  dialog.innerHTML = '<header><h3 id="transactionAccountTitle">編輯交易科目</h3><button type="button" data-close>關閉</button></header><p role="status">載入分錄...</p><form></form>';
  document.body.appendChild(dialog);
  const status = dialog.querySelector('[role="status"]');
  const close = dialog.querySelector('[data-close]');
  const form = dialog.querySelector('form');
  let saving = false;
  const dismiss = () => {
    dialog.close();
    dialog.remove();
  };
  close.onclick = () => { if (!saving) dismiss(); };
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!saving) dismiss();
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  try {
    const [entries, accounts] = await Promise.all([fetchTransactionJournals(client, [transactionId]), getAccounts()]);
    if (!dialog.isConnected) return;
    if (!entries.length) throw new Error('此交易沒有可編輯的分錄');
    entries.forEach((entry, index) => {
      const fieldset = document.createElement('fieldset');
      fieldset.innerHTML = `<legend></legend>
        <label for="transactionDebit${index}">借方科目</label><select id="transactionDebit${index}" data-debit="${index}" required></select>
        <label for="transactionCredit${index}">貸方科目</label><select id="transactionCredit${index}" data-credit="${index}" required></select>`;
      fieldset.querySelector('legend').textContent = `分錄 ${index + 1} · ${entry.currency || 'TWD'} ${Number(entry.debit_amount).toLocaleString()}`;
      for (const side of ['debit', 'credit']) {
        const select = fieldset.querySelector(`[data-${side}]`);
        select.add(new Option('請選擇', ''));
        accounts.forEach(account => select.add(new Option(`${account.code} ${account.name}`, account.id)));
        select.value = entry[`${side}_account_id`] || '';
      }
      form.appendChild(fieldset);
    });
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary-btn';
    submit.textContent = '儲存科目';
    form.appendChild(submit);
    status.textContent = '';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      const payload = entries.map((entry, index) => ({
        id: entry.id,
        debit_account_id: form.querySelector(`[data-debit="${index}"]`).value,
        credit_account_id: form.querySelector(`[data-credit="${index}"]`).value,
        expected_debit_account_id: entry.debit_account_id,
        expected_credit_account_id: entry.credit_account_id
      }));
      if (payload.some(row => !row.debit_account_id || !row.credit_account_id || row.debit_account_id === row.credit_account_id)) {
        status.textContent = '借貸科目必須選擇且不可相同';
        return;
      }
      saving = true;
      dialog.querySelectorAll('button, select').forEach(control => { control.disabled = true; });
      status.textContent = '儲存中...';
      let committed = false;
      try {
        const { error } = await client.rpc('update_manual_transaction_accounts', { p_transaction_id: transactionId, p_entries: payload });
        if (error) throw error;
        committed = true;
        await onSaved();
        dismiss();
      } catch (error) {
        status.textContent = committed ? `科目已儲存，但畫面更新失敗：${error.message}` : error.message;
        if (committed) form.remove();
      } finally {
        saving = false;
        dialog.querySelectorAll('button, select').forEach(control => { control.disabled = false; });
      }
    });
  } catch (error) {
    if (dialog.isConnected) status.textContent = error.message;
  }
}
