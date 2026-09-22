import { supabase } from '../../../scripts/supabaseClient.js';

const FINANCE_ROLES = new Set(['admin', 'super_admin', 'accounting']);
const OPENING_SOURCE_TYPES = new Set(['asset', 'liability', 'equity']);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function localDateValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatBaseAmount(value) {
  return `TWD ${Number(value || 0).toLocaleString('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatOriginalAmount(value, currency) {
  return `${currency || 'TWD'} ${Number(value || 0).toLocaleString('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function createBankOpeningRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function loadBankOpeningEntries(client = supabase) {
  const { data: entries, error } = await client
    .from('bank_opening_entries')
    .select('*')
    .order('posted_at', { ascending: false });
  if (error) throw error;
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) return [];

  const { data: lines, error: lineError } = await client
    .from('bank_opening_entry_lines')
    .select('*')
    .in('entry_id', rows.map(entry => entry.id))
    .order('line_no');
  if (lineError) throw lineError;
  const grouped = new Map();
  (lines || []).forEach(line => {
    const list = grouped.get(line.entry_id) || [];
    list.push(line);
    grouped.set(line.entry_id, list);
  });
  return rows.map(entry => ({ ...entry, lines: grouped.get(entry.id) || [] }));
}

export async function postBankOpeningEntry(payload, client = supabase) {
  const { data, error } = await client.rpc('post_bank_opening_entry', {
    p_request_id: payload.requestId,
    p_bank_account_id: payload.bankAccountId,
    p_lines: payload.lines,
    p_memo: payload.memo || null
  });
  if (error) throw error;
  return data;
}

export async function reverseBankOpeningEntry(payload, client = supabase) {
  const { data, error } = await client.rpc('reverse_bank_opening_entry', {
    p_entry_id: payload.entryId,
    p_expected_revision: payload.expectedRevision,
    p_request_id: payload.requestId,
    p_reversal_date: payload.reversalDate,
    p_reason: payload.reason
  });
  if (error) throw error;
  return data;
}

export function validateBankOpeningLines(lines, expectedBaseAmount) {
  if (!Array.isArray(lines) || !lines.length) return '至少需要一筆來源科目。';
  const accountIds = new Set();
  let total = 0;
  for (const line of lines) {
    if (!line.sourceAccountId) return '每一列都必須選擇來源科目。';
    if (accountIds.has(line.sourceAccountId)) return '同一來源科目只能使用一次。';
    accountIds.add(line.sourceAccountId);
    const amount = Number(line.amountBase);
    if (!Number.isFinite(amount) || amount <= 0) return '來源金額必須大於 0。';
    total += amount;
  }
  if (Math.abs(total - Math.abs(Number(expectedBaseAmount || 0))) >= 0.005) {
    return `來源合計必須等於 ${formatBaseAmount(Math.abs(expectedBaseAmount || 0))}。`;
  }
  return '';
}

function sourceAccountsFor(bank, accounts) {
  const ledgerId = bank.ledger_account_id || bank.accounting_account_id;
  return (accounts || [])
    .filter(account => OPENING_SOURCE_TYPES.has(account.type) && account.id !== ledgerId)
    .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
}

function renderLineBreakdown(entry, accountById) {
  return (entry.lines || []).map(line => {
    const account = accountById.get(line.source_account_id);
    const label = account ? `${account.code} ${account.name}` : '未知科目';
    return `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatBaseAmount(line.amount_base))}</strong></li>`;
  }).join('');
}

function renderSummary(root, banks, activeByBank) {
  const summary = root.querySelector('[data-bank-opening-summary]');
  if (!summary) return;
  const nonZero = banks.filter(bank => Math.abs(Number(bank.opening_balance_base || 0)) >= 0.005);
  const reconciled = nonZero.filter(bank => activeByBank.has(bank.id));
  const pending = nonZero.length - reconciled.length;
  summary.innerHTML = `
    <div><span>需勾稽帳戶</span><strong>${nonZero.length}</strong></div>
    <div><span>已建立分錄</span><strong>${reconciled.length}</strong></div>
    <div><span>待處理</span><strong class="${pending ? 'bank-opening-warning' : ''}">${pending}</strong></div>
    <div><span>期初餘額合計</span><strong>${escapeHtml(formatBaseAmount(nonZero.reduce((sum, bank) => sum + Number(bank.opening_balance_base || 0), 0)))}</strong></div>
  `;
}

function renderCards(root, banks, entries, accounts, state) {
  const list = root.querySelector('[data-bank-opening-list]');
  if (!list) return;
  const accountById = new Map((accounts || []).map(account => [account.id, account]));
  const activeByBank = new Map(entries.filter(entry => entry.status === 'posted').map(entry => [entry.bank_account_id, entry]));
  const historyCount = new Map();
  entries.filter(entry => entry.status === 'reversed').forEach(entry => {
    historyCount.set(entry.bank_account_id, (historyCount.get(entry.bank_account_id) || 0) + 1);
  });
  renderSummary(root, banks, activeByBank);

  if (!banks.length) {
    list.innerHTML = '<p class="muted">尚未設定銀行帳戶。</p>';
    return;
  }
  list.innerHTML = banks.map(bank => {
    const active = activeByBank.get(bank.id);
    const base = Number(bank.opening_balance_base || 0);
    const zero = Math.abs(base) < 0.005;
    const ledger = accountById.get(bank.ledger_account_id || bank.accounting_account_id);
    const tail = bank.account_number ? String(bank.account_number).slice(-5) : '-';
    const direction = base >= 0 ? '借記銀行' : '貸記銀行';
    let statusClass = 'neutral';
    let statusText = '無需開帳';
    if (!zero && active) {
      statusClass = 'success';
      statusText = '已勾稽';
    } else if (!zero) {
      statusClass = 'warning';
      statusText = '待建立分錄';
    }
    const reversalOpen = active && state.reversalEntryId === active.id;
    return `
      <article class="bank-opening-card">
        <div class="bank-opening-card-header">
          <div>
            <strong>${escapeHtml(bank.nickname || bank.bank_name || '未命名帳戶')}</strong>
            <span>${escapeHtml(bank.bank_name || '')} / 末碼 ${escapeHtml(tail)}</span>
          </div>
          <span class="bank-opening-status ${statusClass}">${statusText}</span>
        </div>
        <dl class="bank-opening-facts">
          <div><dt>期初日</dt><dd>${escapeHtml(bank.opening_balance_date || '-')}</dd></div>
          <div><dt>原幣餘額</dt><dd>${escapeHtml(formatOriginalAmount(bank.opening_balance, bank.currency))}</dd></div>
          <div><dt>TWD 基準額</dt><dd>${escapeHtml(formatBaseAmount(base))}</dd></div>
          <div><dt>總帳科目</dt><dd>${ledger ? `${escapeHtml(ledger.code)} ${escapeHtml(ledger.name)}` : '未綁定'}</dd></div>
        </dl>
        ${active ? `
          <div class="bank-opening-posted">
            <span>${direction}，來源分配如下：</span>
            <ul>${renderLineBreakdown(active, accountById)}</ul>
            <small>入帳：${escapeHtml(active.posted_at ? new Date(active.posted_at).toLocaleString('zh-TW') : '-')} / 修訂 ${Number(active.revision || 1)}${historyCount.get(bank.id) ? ` / 過往沖回 ${historyCount.get(bank.id)} 次` : ''}</small>
          </div>
        ` : ''}
        <div class="bank-opening-actions">
          ${zero ? '<span class="muted">期初餘額為 0，不產生分錄。</span>' : active
            ? `<button type="button" class="danger" data-bank-opening-action="show-reversal" data-entry-id="${active.id}">沖回開帳分錄</button>`
            : `<button type="button" class="primary-btn" data-bank-opening-action="edit" data-bank-id="${bank.id}">設定來源科目</button>`}
        </div>
        ${reversalOpen ? `
          <form class="bank-opening-reversal" data-bank-opening-reversal-form data-entry-id="${active.id}">
            <label>沖回日期<input type="date" name="reversalDate" value="${localDateValue()}" max="${localDateValue()}" required></label>
            <label>沖回原因<textarea name="reason" minlength="2" maxlength="500" required placeholder="例如：來源科目選擇錯誤，沖回後重建"></textarea></label>
            <div class="button-row">
              <button type="submit" class="danger">確認沖回</button>
              <button type="button" class="secondary" data-bank-opening-action="cancel-reversal">取消</button>
            </div>
          </form>
        ` : ''}
      </article>
    `;
  }).join('');
}

function renderEditor(root, bank, accounts, state) {
  const editor = root.querySelector('[data-bank-opening-editor]');
  if (!editor) return;
  if (!bank) {
    editor.hidden = true;
    editor.replaceChildren();
    return;
  }
  const options = sourceAccountsFor(bank, accounts);
  const expected = Math.abs(Number(bank.opening_balance_base || 0));
  editor.hidden = false;
  editor.innerHTML = `
    <form data-bank-opening-form>
      <div class="panel-header">
        <div>
          <h4>${escapeHtml(bank.nickname || bank.bank_name)}期初來源</h4>
          <p class="muted">分配 ${escapeHtml(formatBaseAmount(expected))}；正餘額借記銀行，負餘額貸記銀行。來源不可使用收入或費用科目。</p>
        </div>
        <button type="button" class="secondary" data-bank-opening-action="cancel-edit">取消</button>
      </div>
      <div class="bank-opening-line-list">
        ${state.lines.map((line, index) => `
          <div class="bank-opening-line" data-line-index="${index}">
            <label>來源科目
              <select name="sourceAccountId" required>
                <option value="">請選擇</option>
                ${options.map(account => `<option value="${account.id}" ${line.sourceAccountId === account.id ? 'selected' : ''}>${escapeHtml(account.code)} ${escapeHtml(account.name)}</option>`).join('')}
              </select>
            </label>
            <label>金額（TWD）<input name="amountBase" type="number" min="0.01" step="0.01" value="${escapeHtml(line.amountBase)}" required></label>
            <label>列摘要<input name="lineMemo" maxlength="200" value="${escapeHtml(line.memo || '')}" placeholder="選填"></label>
            <button type="button" class="icon-button danger" title="移除此來源" aria-label="移除此來源" data-bank-opening-action="remove-line" data-line-index="${index}">×</button>
          </div>
        `).join('')}
      </div>
      <div class="bank-opening-editor-footer">
        <button type="button" class="secondary" data-bank-opening-action="add-line">新增來源</button>
        <div data-bank-opening-difference></div>
      </div>
      <label>整筆摘要<input name="memo" maxlength="500" placeholder="例如：115 年 1 月銀行期初開帳"></label>
      <button type="submit" class="primary-btn">建立開帳分錄</button>
    </form>
  `;
  updateEditorDifference(root, expected, state.lines);
}

function updateEditorDifference(root, expected, lines) {
  const output = root.querySelector('[data-bank-opening-difference]');
  if (!output) return;
  const total = lines.reduce((sum, line) => sum + (Number(line.amountBase) || 0), 0);
  const difference = expected - total;
  output.className = Math.abs(difference) < 0.005 ? 'bank-opening-balanced' : 'bank-opening-unbalanced';
  output.textContent = `來源合計 ${formatBaseAmount(total)} / 差額 ${formatBaseAmount(difference)}`;
}

function setStatus(root, message, isError = false) {
  const status = root.querySelector('[data-bank-opening-message]');
  if (!status) return;
  status.textContent = message || '';
  status.className = isError ? 'message error' : 'muted';
}

export async function mountBankOpeningReconciliation(root, {
  client = supabase,
  currentRole,
  bankAccounts = [],
  accounts = [],
  loadEntries = () => loadBankOpeningEntries(client),
  postEntry = payload => postBankOpeningEntry(payload, client),
  reverseEntry = payload => reverseBankOpeningEntry(payload, client),
  onChanged = async () => {},
  showMessage = () => {}
} = {}) {
  if (!root) return null;
  const role = typeof currentRole === 'function' ? currentRole() : currentRole;
  const allowed = FINANCE_ROLES.has(role);
  root.hidden = !allowed;
  if (!allowed) return null;

  root.innerHTML = `
    <div class="panel-header">
      <div>
        <h3>銀行期初餘額勾稽</h3>
        <p class="muted">期初餘額必須指定股本、負債或其他開帳來源。更正時保留原分錄並沖回，不會新增銀行流水。</p>
      </div>
      <button type="button" class="secondary" data-bank-opening-action="refresh">重新整理</button>
    </div>
    <div class="bank-opening-summary" data-bank-opening-summary></div>
    <div class="bank-opening-list" data-bank-opening-list><p class="muted">載入中...</p></div>
    <div class="bank-opening-editor" data-bank-opening-editor hidden></div>
    <p class="muted" role="status" aria-live="polite" data-bank-opening-message></p>
  `;

  const state = {
    entries: [],
    editingBankId: null,
    reversalEntryId: null,
    lines: [],
    busy: false
  };
  const banks = Array.isArray(bankAccounts) ? bankAccounts : [];
  const ledgerAccounts = Array.isArray(accounts) ? accounts : [];

  const refresh = async () => {
    state.entries = await loadEntries();
    renderCards(root, banks, state.entries, ledgerAccounts, state);
    const bank = banks.find(item => item.id === state.editingBankId);
    renderEditor(root, bank, ledgerAccounts, state);
  };

  root.onclick = async event => {
    const button = event.target.closest('[data-bank-opening-action]');
    if (!button || state.busy) return;
    const action = button.dataset.bankOpeningAction;
    if (action === 'refresh') {
      state.busy = true;
      try {
        await refresh();
        setStatus(root, '期初餘額勾稽資料已更新。');
      } catch (error) {
        setStatus(root, `載入失敗：${error.message}`, true);
      } finally {
        state.busy = false;
      }
      return;
    }
    if (action === 'edit') {
      const bank = banks.find(item => item.id === button.dataset.bankId);
      const options = sourceAccountsFor(bank || {}, ledgerAccounts);
      if (!bank || !options.length) {
        setStatus(root, '沒有可用的資產、負債或權益來源科目。', true);
        return;
      }
      const defaultAccount = options.find(account => account.code === '3110') || options[0];
      state.editingBankId = bank.id;
      state.reversalEntryId = null;
      state.lines = [{ sourceAccountId: defaultAccount.id, amountBase: Math.abs(Number(bank.opening_balance_base || 0)), memo: '' }];
      renderCards(root, banks, state.entries, ledgerAccounts, state);
      renderEditor(root, bank, ledgerAccounts, state);
      root.querySelector('[data-bank-opening-editor]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'cancel-edit') {
      state.editingBankId = null;
      state.lines = [];
      renderEditor(root, null, ledgerAccounts, state);
      return;
    }
    if (action === 'add-line') {
      const bank = banks.find(item => item.id === state.editingBankId);
      const options = sourceAccountsFor(bank || {}, ledgerAccounts);
      const used = new Set(state.lines.map(line => line.sourceAccountId));
      const next = options.find(account => !used.has(account.id));
      if (!next) {
        setStatus(root, '沒有其他可加入的來源科目。', true);
        return;
      }
      const expected = Math.abs(Number(bank?.opening_balance_base || 0));
      const current = state.lines.reduce((sum, line) => sum + (Number(line.amountBase) || 0), 0);
      state.lines.push({ sourceAccountId: next.id, amountBase: Math.max(expected - current, 0), memo: '' });
      renderEditor(root, bank, ledgerAccounts, state);
      return;
    }
    if (action === 'remove-line') {
      if (state.lines.length === 1) {
        setStatus(root, '至少需要保留一筆來源科目。', true);
        return;
      }
      state.lines.splice(Number(button.dataset.lineIndex), 1);
      renderEditor(root, banks.find(item => item.id === state.editingBankId), ledgerAccounts, state);
      return;
    }
    if (action === 'show-reversal') {
      state.reversalEntryId = button.dataset.entryId;
      state.editingBankId = null;
      renderCards(root, banks, state.entries, ledgerAccounts, state);
      renderEditor(root, null, ledgerAccounts, state);
      return;
    }
    if (action === 'cancel-reversal') {
      state.reversalEntryId = null;
      renderCards(root, banks, state.entries, ledgerAccounts, state);
    }
  };

  root.oninput = event => {
    const row = event.target.closest('[data-line-index]');
    if (!row) return;
    const index = Number(row.dataset.lineIndex);
    const line = state.lines[index];
    if (!line) return;
    if (event.target.name === 'sourceAccountId') line.sourceAccountId = event.target.value;
    if (event.target.name === 'amountBase') line.amountBase = event.target.value;
    if (event.target.name === 'lineMemo') line.memo = event.target.value;
    const bank = banks.find(item => item.id === state.editingBankId);
    updateEditorDifference(root, Math.abs(Number(bank?.opening_balance_base || 0)), state.lines);
  };

  root.onsubmit = async event => {
    event.preventDefault();
    if (state.busy) return;
    const openingForm = event.target.closest('[data-bank-opening-form]');
    const reversalForm = event.target.closest('[data-bank-opening-reversal-form]');
    if (!openingForm && !reversalForm) return;
    state.busy = true;
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    try {
      if (openingForm) {
        const bank = banks.find(item => item.id === state.editingBankId);
        if (!bank) throw new Error('找不到要勾稽的銀行帳戶。');
        const validation = validateBankOpeningLines(state.lines, bank.opening_balance_base);
        if (validation) throw new Error(validation);
        const formData = new FormData(openingForm);
        await postEntry({
          requestId: createBankOpeningRequestId(),
          bankAccountId: bank.id,
          lines: state.lines.map(line => ({
            source_account_id: line.sourceAccountId,
            amount_base: Number(line.amountBase),
            memo: line.memo?.trim() || null
          })),
          memo: String(formData.get('memo') || '').trim()
        });
        showMessage('銀行期初開帳分錄已建立。');
      } else {
        const entry = state.entries.find(item => item.id === reversalForm.dataset.entryId);
        if (!entry) throw new Error('找不到要沖回的開帳分錄。');
        const formData = new FormData(reversalForm);
        await reverseEntry({
          entryId: entry.id,
          expectedRevision: Number(entry.revision),
          requestId: createBankOpeningRequestId(),
          reversalDate: String(formData.get('reversalDate') || ''),
          reason: String(formData.get('reason') || '').trim()
        });
        showMessage('銀行期初開帳分錄已沖回，可修改帳戶後重新勾稽。');
      }
      state.editingBankId = null;
      state.reversalEntryId = null;
      state.lines = [];
      await onChanged();
    } catch (error) {
      setStatus(root, `操作失敗：${error.message}`, true);
    } finally {
      state.busy = false;
      if (submitButton?.isConnected) submitButton.disabled = false;
    }
  };

  try {
    await refresh();
    setStatus(root, '僅會計與管理員可建立或沖回銀行期初分錄。');
  } catch (error) {
    setStatus(root, `載入失敗：${error.message}`, true);
  }
  return { refresh };
}
