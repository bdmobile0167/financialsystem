const MAX_SPLITS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currencyDecimals(currencies, currency) {
  return Number(currencies?.find(item => item.code === currency)?.decimal_places ?? 2);
}

function roundCurrency(value, currencies, currency) {
  const decimals = currencyDecimals(currencies, currency);
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function formatMoney(value, currency = 'TWD', currencies = []) {
  const decimals = currencyDecimals(currencies, currency);
  return `${currency} ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function recipientLabel(recipient) {
  const bank = [recipient?.bank_name, recipient?.bank_branch].filter(Boolean).join(' ');
  const account = recipient?.account_number ? `｜${recipient.account_number}` : '';
  return `${recipient?.display_name || '未命名'}｜${recipient?.identifier || '-'}${bank ? `｜${bank}` : ''}${account}`;
}

function recipientSearchText(recipient) {
  return [
    recipient?.display_name,
    recipient?.identifier,
    recipient?.bank_name,
    recipient?.bank_branch,
    recipient?.account_name,
    recipient?.account_number
  ].filter(Boolean).join(' ').toLowerCase();
}

function activeRecipients(recipients) {
  return (recipients || []).filter(recipient => recipient.active !== false);
}

function selectRecipientForLine(line, voucher, recipients) {
  const available = activeRecipients(recipients);
  return available.find(recipient => line?.payee_identifier && recipient.identifier === line.payee_identifier)
    || available.find(recipient => recipient.id === voucher.payment_recipient_id)
    || available[0]
    || null;
}

function selectBankForVoucher(voucher, banks) {
  const available = banks || [];
  return available.find(bank => bank.id === voucher.payment_bank_account_id)
    || available.find(bank => bank.id === voucher.project?.default_bank_account_id)
    || available.find(bank => (bank.currency || 'TWD') === (voucher.currency || 'TWD'))
    || available[0]
    || null;
}

function normalizeSplit(split) {
  return {
    ...split,
    amount: Number(split.amount || 0),
    voucher_exchange_rate: Number(split.voucher_exchange_rate || 0),
    voucher_amount_base: Number(split.voucher_amount_base || 0),
    settlement_amount: split.settlement_amount == null ? null : Number(split.settlement_amount),
    settlement_exchange_rate: split.settlement_exchange_rate == null ? null : Number(split.settlement_exchange_rate),
    settlement_amount_base: split.settlement_amount_base == null ? null : Number(split.settlement_amount_base),
    realized_fx_base: split.realized_fx_base == null ? null : Number(split.realized_fx_base),
    settlementManual: split.payment_status === 'assigned'
      && split.settlement_amount != null
      && split.settlement_currency !== split.currency,
    payment_status: split.payment_status || 'assigned',
    recipient: normalizeRelation(split.recipient),
    bank: normalizeRelation(split.bank),
    payment: normalizeRelation(split.payment)
  };
}

function createDefaultSplits(voucher, recipients, banks) {
  const bank = selectBankForVoucher(voucher, banks);
  const lines = voucher.voucher_lines || [];
  if (lines.length) {
    return lines.map(line => ({
      id: crypto.randomUUID(),
      voucher_id: voucher.id,
      voucher_line_id: line.id,
      payment_recipient_id: selectRecipientForLine(line, voucher, recipients)?.id || '',
      bank_account_id: bank?.id || '',
      amount: Number(line.amount || 0),
      settlement_amount: bank && (bank.currency || 'TWD') === (voucher.currency || 'TWD') ? Number(line.amount || 0) : null,
      settlement_currency: bank?.currency || null,
      settlementManual: false,
      payment_status: 'assigned'
    }));
  }
  return [{
    id: crypto.randomUUID(),
    voucher_id: voucher.id,
    voucher_line_id: null,
    payment_recipient_id: activeRecipients(recipients).find(item => item.id === voucher.payment_recipient_id)?.id || activeRecipients(recipients)[0]?.id || '',
    bank_account_id: bank?.id || '',
    debit_account_id: voucher.accounting_account_id || null,
    amount: Number(voucher.total_amount || 0),
    settlement_amount: bank && (bank.currency || 'TWD') === (voucher.currency || 'TWD') ? Number(voucher.total_amount || 0) : null,
    settlement_currency: bank?.currency || null,
    settlementManual: false,
    payment_status: 'assigned'
  }];
}

export async function fetchVoucherPaymentSplits(client, voucherId) {
  const { data, error } = await client
    .from('voucher_payment_splits')
    .select('id, voucher_id, voucher_line_id, payment_recipient_id, bank_account_id, debit_account_id, amount, payment_status, payment_no, payment_sequence_no, recipient_snapshot, currency, exchange_rate, amount_base, voucher_exchange_rate, voucher_amount_base, settlement_amount, settlement_currency, settlement_exchange_rate, settlement_amount_base, realized_fx_base, paid_at, reversal_date, reversal_reason, revision, recipient:payment_recipients(display_name, identifier, bank_name, bank_branch, account_name, account_number, active), bank:bank_accounts(bank_name, nickname, account_number, currency), payment:voucher_payments(payment_no, payment_sequence_no, status, paid_at, reversal_date, reversal_reason, settlement_amount, settlement_currency, settlement_exchange_rate, settlement_amount_base, realized_fx_base)')
    .eq('voucher_id', voucherId)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return (data || []).map(normalizeSplit);
}

function renderRecipientOptions(recipients, selectedId, query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const all = activeRecipients(recipients);
  const filtered = normalizedQuery
    ? all.filter(recipient => recipientSearchText(recipient).includes(normalizedQuery))
    : all;
  const selected = all.find(recipient => recipient.id === selectedId);
  const visible = selected && !filtered.some(recipient => recipient.id === selected.id)
    ? [selected, ...filtered]
    : filtered;
  return [
    '<option value="">請選擇收款人</option>',
    ...visible.map(recipient => `<option value="${recipient.id}" ${recipient.id === selectedId ? 'selected' : ''}>${escapeHtml(recipientLabel(recipient))}</option>`)
  ].join('');
}

function renderBankOptions(banks, selectedId) {
  const available = banks || [];
  return [
    '<option value="">請選擇公司出款銀行</option>',
    ...available.map(bank => `<option value="${bank.id}" ${bank.id === selectedId ? 'selected' : ''}>${escapeHtml(bank.nickname || bank.bank_name)}｜${escapeHtml(bank.account_number)}｜${escapeHtml(bank.currency || 'TWD')}</option>`)
  ].join('');
}

function bankForSplit(split, banks) {
  return (banks || []).find(bank => bank.id === split.bank_account_id) || null;
}

export function buildPaymentFxPreview({
  voucherAmount,
  voucherCurrency,
  voucherRate,
  settlementAmount,
  settlementCurrency,
  settlementRate,
  currencies = []
}) {
  const obligationBase = Number(voucherAmount || 0) * Number(voucherRate || 0);
  const cashBase = Number(settlementAmount || 0) * Number(settlementRate || 0);
  if (!(Number(voucherRate) > 0) || !(Number(settlementRate) > 0) || !(Number(settlementAmount) > 0)) {
    return settlementCurrency && settlementCurrency !== voucherCurrency
      ? '付款日尚無可用匯率'
      : '';
  }
  const difference = Math.round((cashBase - obligationBase + Number.EPSILON) * 100) / 100;
  const comparison = difference > 0
    ? `預估兌換損失 ${formatMoney(difference, 'TWD', currencies)}`
    : difference < 0
      ? `預估兌換利益 ${formatMoney(Math.abs(difference), 'TWD', currencies)}`
      : '預估無匯兌差額';
  return `單據基礎 ${formatMoney(obligationBase, 'TWD', currencies)}｜銀行基礎 ${formatMoney(cashBase, 'TWD', currencies)}｜${comparison}`;
}

export function groupSettlementTotals(splits = [], banks = [], currencies = []) {
  const totals = new Map();
  splits.forEach(split => {
    const bank = bankForSplit(split, banks);
    const currency = split.settlement_currency || bank?.currency || 'TWD';
    totals.set(currency, (totals.get(currency) || 0) + Number(split.settlement_amount || 0));
  });
  return [...totals.entries()].map(([currency, amount]) => formatMoney(amount, currency, currencies));
}

function lineKey(lineId) {
  return lineId || '__voucher__';
}

function groupDefinitions(voucher) {
  const lines = voucher.voucher_lines || [];
  if (lines.length) {
    return lines.map((line, index) => ({
      key: lineKey(line.id),
      lineId: line.id,
      index,
      description: line.description || `明細 ${index + 1}`,
      accountCode: line.account_code || '',
      expectedAmount: Number(line.amount || 0),
      originalPayee: [line.payee_name, line.payee_identifier].filter(Boolean).join('｜')
    }));
  }
  return [{
    key: '__voucher__',
    lineId: null,
    index: 0,
    description: voucher.summary || '整張單據',
    accountCode: voucher.accounting_account?.code || '',
    expectedAmount: Number(voucher.total_amount || 0),
    originalPayee: ''
  }];
}

function splitStatusLabel(split) {
  if (split.payment_status === 'paid') return `已付款 ${split.paid_at || ''}`;
  if (split.payment_status === 'voided') return `已作廢 ${split.reversal_date || ''}`;
  return '待付款';
}

function renderReadOnlySplit(split, recipients, banks, voucher, currencies) {
  const recipient = split.recipient
    || recipients.find(item => item.id === split.payment_recipient_id)
    || split.recipient_snapshot
    || {};
  const bank = split.bank || banks.find(item => item.id === split.bank_account_id) || {};
  const statusClass = split.payment_status === 'paid' ? 'success' : 'wait';
  const voucherCurrency = voucher.currency || 'TWD';
  const settlementCurrency = split.settlement_currency || bank.currency || voucherCurrency;
  const fxLabel = Number(split.realized_fx_base || 0) > 0
    ? `兌換損失 ${formatMoney(split.realized_fx_base, 'TWD', currencies)}`
    : Number(split.realized_fx_base || 0) < 0
      ? `兌換利益 ${formatMoney(Math.abs(split.realized_fx_base), 'TWD', currencies)}`
      : '無匯兌差額';
  return `<div class="payment-split-row payment-split-readonly" data-split-id="${split.id}" data-status="${split.payment_status}">
    <div><span class="badge ${statusClass}">${escapeHtml(splitStatusLabel(split))}</span>${split.payment_no ? `<br><strong>${escapeHtml(split.payment_no)}</strong>` : ''}</div>
    <div><strong>${escapeHtml(recipient.display_name || '未命名')}</strong><br><span class="muted">${escapeHtml(recipient.bank_name || '')}｜${escapeHtml(recipient.account_name || '')}｜${escapeHtml(recipient.account_number || '')}</span></div>
    <div><strong>單據 ${formatMoney(split.amount, voucherCurrency, currencies)}</strong><br><span>實付 ${formatMoney(split.settlement_amount, settlementCurrency, currencies)}</span><br><span class="muted">${escapeHtml(bank.nickname || bank.bank_name || '')}｜${escapeHtml(fxLabel)}</span></div>
  </div>`;
}

function renderEditableSplit(split, recipients, banks, voucher, currencies, paymentRates) {
  const voucherCurrency = voucher.currency || 'TWD';
  const bank = bankForSplit(split, banks);
  const settlementCurrency = bank?.currency || split.settlement_currency || voucherCurrency;
  const settlementRate = paymentRates[settlementCurrency];
  const preview = buildPaymentFxPreview({
    voucherAmount: split.amount,
    voucherCurrency,
    voucherRate: voucher.exchange_rate,
    settlementAmount: split.settlement_amount,
    settlementCurrency,
    settlementRate,
    currencies
  });
  return `<div class="payment-split-row payment-split-editable" data-split-id="${split.id}" data-status="assigned" data-line-id="${escapeHtml(split.voucher_line_id || '')}">
    <label class="payment-split-check"><input type="checkbox" data-pay-now checked aria-label="本次付款">本次付款</label>
    <label>單據金額（${escapeHtml(voucherCurrency)}）<input type="number" min="0.01" step="0.01" data-split-amount value="${escapeHtml(split.amount)}"></label>
    <label>搜尋收款人<input type="search" data-recipient-search placeholder="姓名、身分證／統編、銀行或帳號"></label>
    <label>收款人<select data-recipient-id>${renderRecipientOptions(recipients, split.payment_recipient_id)}</select></label>
    <label>公司出款銀行<select data-bank-id>${renderBankOptions(banks, split.bank_account_id)}</select></label>
    <label>銀行實付（${escapeHtml(settlementCurrency)}）<input type="number" min="0.01" step="${currencyDecimals(currencies, settlementCurrency) === 0 ? '1' : '0.01'}" data-settlement-amount data-manual="${split.settlementManual ? '1' : '0'}" value="${escapeHtml(split.settlement_amount ?? '')}"><span class="payment-fx-preview muted">${escapeHtml(preview)}</span></label>
    <button type="button" class="icon-btn payment-split-remove" data-remove-split title="移除此拆分" aria-label="移除此拆分">&times;</button>
  </div>`;
}

function renderEditor(container, state) {
  const { voucher, recipients, banks, splits, currencies, paymentRates } = state;
  const currency = voucher.currency || 'TWD';
  const groups = groupDefinitions(voucher);
  const paymentDate = state.paymentDate || localDateValue();
  const note = state.note ?? voucher.accounting_note ?? '';
  const paidTotal = splits.filter(split => split.payment_status === 'paid').reduce((sum, split) => sum + split.amount, 0);
  const assignedTotal = splits.filter(split => split.payment_status === 'assigned').reduce((sum, split) => sum + split.amount, 0);

  container.innerHTML = `
    <div class="payment-split-editor">
      <header class="payment-split-editor-header">
        <div><h3>付款設定 - ${escapeHtml(voucher.request_voucher_no || voucher.voucher_no || '')}</h3><p class="muted">${escapeHtml(voucher.summary || '')}</p></div>
        <span class="badge ${voucher.status === 'partially_paid' ? 'warning' : 'wait'}">${voucher.status === 'partially_paid' ? '部分付款' : '待付款'}</span>
      </header>
      <div class="payment-split-totals">
        <div><span>單據總額</span><strong>${formatMoney(voucher.total_amount, currency, currencies)}</strong></div>
        <div><span>已付款</span><strong>${formatMoney(paidTotal, currency, currencies)}</strong></div>
        <div><span>待付款</span><strong data-assigned-total>${formatMoney(assignedTotal, currency, currencies)}</strong></div>
      </div>
      <p class="muted">每個項目可拆給不同收款人與公司出款銀行；勾選的待付款列才會在本次產生付款憑證、銀行流水與分錄。</p>
      <div class="payment-split-groups">
        ${groups.map(group => {
          const rows = splits.filter(split => lineKey(split.voucher_line_id) === group.key);
          const paid = rows.filter(split => split.payment_status === 'paid').reduce((sum, split) => sum + split.amount, 0);
          const assigned = rows.filter(split => split.payment_status === 'assigned').reduce((sum, split) => sum + split.amount, 0);
          return `<section class="payment-split-group" data-line-key="${escapeHtml(group.key)}" data-expected-amount="${escapeHtml(group.expectedAmount)}">
            <div class="payment-split-group-header">
              <div><strong>#${group.index + 1} ${escapeHtml(group.description)}</strong><span>${escapeHtml(group.accountCode || '未指定科目')}${group.originalPayee ? `｜原填：${escapeHtml(group.originalPayee)}` : ''}</span></div>
              <div><strong>${formatMoney(group.expectedAmount, currency, currencies)}</strong><span data-line-total>已付 ${formatMoney(paid, currency, currencies)}｜待付 ${formatMoney(assigned, currency, currencies)}</span></div>
            </div>
            <div class="payment-split-rows">
              ${rows.map(split => split.payment_status === 'assigned'
                ? renderEditableSplit(split, recipients, banks, voucher, currencies, paymentRates)
                : renderReadOnlySplit(split, recipients, banks, voucher, currencies)).join('')}
            </div>
            ${rows.some(split => split.payment_status === 'assigned') ? '<button type="button" class="secondary payment-split-add" data-add-split>新增另一位收款人</button>' : ''}
          </section>`;
        }).join('')}
      </div>
      <div class="payment-split-footer-fields">
        <label>付款日期<input type="date" data-payment-date value="${escapeHtml(paymentDate)}"></label>
        <label>會計備註<textarea rows="3" data-accounting-note data-manual="${state.noteManual ? '1' : '0'}">${escapeHtml(note)}</textarea></label>
      </div>
      <p class="message" data-editor-message hidden></p>
      <div class="button-row">
        <button type="button" class="secondary" data-save-splits>儲存付款設定</button>
        <button type="button" class="primary-btn" data-pay-splits>確認勾選付款</button>
        <button type="button" class="secondary" data-cancel>關閉</button>
      </div>
    </div>`;
}

async function fetchPaymentRate(client, currency, paymentDate) {
  if (!currency || currency === 'TWD') return 1;
  const { data, error } = await client.rpc('get_exchange_rate', {
    p_currency_code: currency,
    p_date: paymentDate
  });
  if (error) throw error;
  const rate = Number(data);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

async function refreshPaymentRates(client, state) {
  const currencyCodes = [...new Set(state.splits
    .filter(split => split.payment_status === 'assigned')
    .map(split => bankForSplit(split, state.banks)?.currency || split.settlement_currency)
    .filter(Boolean))];
  const entries = await Promise.all(currencyCodes.map(async currency => [
    currency,
    await fetchPaymentRate(client, currency, state.paymentDate)
  ]));
  state.paymentRates = Object.fromEntries(entries);
}

function applySettlementDefaults(state) {
  const voucherCurrency = state.voucher.currency || 'TWD';
  const voucherRate = Number(state.voucher.exchange_rate || (voucherCurrency === 'TWD' ? 1 : 0));
  state.splits.filter(split => split.payment_status === 'assigned').forEach(split => {
    const bank = bankForSplit(split, state.banks);
    const settlementCurrency = bank?.currency || split.settlement_currency || voucherCurrency;
    split.settlement_currency = settlementCurrency;
    if (settlementCurrency === voucherCurrency) {
      split.settlement_amount = split.amount;
      split.settlementManual = false;
      return;
    }
    if (split.settlementManual && Number(split.settlement_amount) > 0) return;
    const paymentRate = Number(state.paymentRates[settlementCurrency]);
    split.settlement_amount = voucherRate > 0 && paymentRate > 0
      ? roundCurrency(split.amount * voucherRate / paymentRate, state.currencies, settlementCurrency)
      : null;
  });
}

function updateStateFromInputs(container, state) {
  container.querySelectorAll('.payment-split-editable').forEach(row => {
    const split = state.splits.find(item => item.id === row.dataset.splitId);
    if (!split) return;
    split.amount = Number(row.querySelector('[data-split-amount]')?.value || 0);
    split.payment_recipient_id = row.querySelector('[data-recipient-id]')?.value || '';
    split.bank_account_id = row.querySelector('[data-bank-id]')?.value || '';
    const settlementInput = row.querySelector('[data-settlement-amount]');
    split.settlement_amount = settlementInput?.value === '' ? null : Number(settlementInput?.value);
    split.settlementManual = settlementInput?.dataset.manual === '1';
    split.settlement_currency = bankForSplit(split, state.banks)?.currency || null;
    split.payNow = row.querySelector('[data-pay-now]')?.checked !== false;
  });
  state.paymentDate = container.querySelector('[data-payment-date]')?.value || '';
  state.note = container.querySelector('[data-accounting-note]')?.value || '';
  state.noteManual = container.querySelector('[data-accounting-note]')?.dataset.manual === '1';
}

function validateState(state, { requireSelection = false, requireRate = false } = {}) {
  const { voucher, recipients, banks, splits } = state;
  const currency = voucher.currency || 'TWD';
  const assigned = splits.filter(split => split.payment_status === 'assigned');
  if (!assigned.length) throw new Error('此單據沒有待付款拆分。');
  if (splits.length > MAX_SPLITS) throw new Error(`每張單據最多 ${MAX_SPLITS} 筆付款拆分。`);
  for (const split of assigned) {
    if (!UUID_PATTERN.test(split.id)) throw new Error('付款拆分編號無效，請重新開啟付款設定。');
    if (!Number.isFinite(split.amount) || split.amount <= 0) throw new Error('每筆付款金額必須大於 0。');
    const recipient = recipients.find(item => item.id === split.payment_recipient_id && item.active !== false);
    if (!recipient) throw new Error('每筆付款都必須選擇有效收款人。');
    if (![recipient.bank_name, recipient.account_name, recipient.account_number].every(value => String(value || '').trim())) {
      throw new Error(`${recipient.display_name || '收款人'} 的銀行、戶名或帳號不完整。`);
    }
    const bank = banks.find(item => item.id === split.bank_account_id);
    if (!bank) throw new Error('每筆付款都必須選擇公司出款銀行。');
    const settlementCurrency = bank.currency || 'TWD';
    if (!Number.isFinite(split.settlement_amount) || split.settlement_amount <= 0) {
      throw new Error(`請填寫 ${settlementCurrency} 銀行實付金額。`);
    }
    const roundedSettlement = roundCurrency(split.settlement_amount, state.currencies, settlementCurrency);
    if (roundedSettlement !== split.settlement_amount) {
      throw new Error(`${settlementCurrency} 銀行實付金額的小數位數不正確。`);
    }
    if (settlementCurrency === currency && Math.abs(split.settlement_amount - split.amount) > 0.005) {
      throw new Error('同幣別付款的銀行實付金額必須等於單據金額。');
    }
    if (requireRate && !(Number(state.paymentRates[settlementCurrency]) > 0)) {
      throw new Error(`付款日期找不到 ${settlementCurrency} 對 TWD 的有效匯率。`);
    }
  }
  for (const group of groupDefinitions(voucher)) {
    const total = splits
      .filter(split => split.payment_status !== 'voided' && lineKey(split.voucher_line_id) === group.key)
      .reduce((sum, split) => sum + split.amount, 0);
    if (Math.abs(total - group.expectedAmount) > 0.005) {
      throw new Error(`#${group.index + 1} 的付款拆分合計必須等於 ${formatMoney(group.expectedAmount, currency, state.currencies)}。`);
    }
  }
  const total = splits.filter(split => split.payment_status !== 'voided').reduce((sum, split) => sum + split.amount, 0);
  if (Math.abs(total - Number(voucher.total_amount || 0)) > 0.005) {
    throw new Error('全部付款拆分合計必須等於單據總額。');
  }
  const selectedIds = assigned.filter(split => split.payNow !== false).map(split => split.id);
  if (requireSelection && !selectedIds.length) throw new Error('請至少勾選一筆本次付款。');
  if (!state.paymentDate) throw new Error('請選擇付款日期。');
  return { assigned, selectedIds };
}

function assignedPayload(splits) {
  return splits.filter(split => split.payment_status === 'assigned').map(split => ({
    id: split.id,
    voucher_line_id: split.voucher_line_id || null,
    payment_recipient_id: split.payment_recipient_id,
    bank_account_id: split.bank_account_id,
    debit_account_id: split.debit_account_id || null,
    amount: split.amount,
    settlement_amount: split.settlement_amount
  }));
}

function showEditorMessage(container, text, type = '') {
  const message = container.querySelector('[data-editor-message]');
  if (!message) return;
  message.hidden = !text;
  message.className = `message${type ? ` ${type}` : ''}`;
  message.textContent = text || '';
}

function setBusy(container, busy, text = '') {
  container.querySelectorAll('button, input, select, textarea').forEach(control => {
    control.disabled = busy;
  });
  if (text) showEditorMessage(container, text);
}

function lockCommittedEditor(container, message) {
  container.querySelectorAll('button, input, select, textarea').forEach(control => {
    control.disabled = !control.matches('[data-cancel]');
  });
  showEditorMessage(container, message, 'warning');
}

function buildDefaultNote(paymentDate, voucher) {
  const compactDate = String(paymentDate || localDateValue()).slice(5).replace('-', '');
  const base = String(voucher.summary || voucher.request_voucher_no || voucher.voucher_no || '付款')
    .replace(/\s+/g, '_')
    .slice(0, 30);
  return `${compactDate}_${base}`;
}

export async function mountVoucherPaymentSplitEditor({
  client,
  container,
  voucher,
  recipients,
  banks,
  currencies = [],
  confirmAction = message => window.confirm(message),
  onSaved = async () => {},
  onPaid = async () => {},
  onCancel = () => {}
}) {
  let storedSplits = await fetchVoucherPaymentSplits(client, voucher.id);
  let paymentInFlight = false;
  const state = {
    voucher: { ...voucher },
    recipients: activeRecipients(recipients),
    banks,
    currencies,
    splits: storedSplits.length ? storedSplits : createDefaultSplits(voucher, recipients, banks),
    paymentDate: localDateValue(),
    paymentRates: {},
    note: voucher.accounting_note || '',
    noteManual: Boolean(voucher.accounting_note)
  };
  if (!state.note) state.note = buildDefaultNote(state.paymentDate, voucher);
  await refreshPaymentRates(client, state);
  applySettlementDefaults(state);

  const renderAndWire = () => {
    renderEditor(container, state);

    container.querySelectorAll('[data-recipient-search]').forEach(input => {
      input.addEventListener('input', () => {
        const row = input.closest('.payment-split-editable');
        const select = row?.querySelector('[data-recipient-id]');
        if (!select) return;
        const selectedId = select.value;
        select.innerHTML = renderRecipientOptions(state.recipients, selectedId, input.value);
      });
    });

    container.querySelectorAll('[data-bank-id]').forEach(select => {
      select.addEventListener('change', async () => {
        updateStateFromInputs(container, state);
        const row = select.closest('.payment-split-editable');
        const split = state.splits.find(item => item.id === row?.dataset.splitId);
        if (split) split.settlementManual = false;
        try {
          await refreshPaymentRates(client, state);
          applySettlementDefaults(state);
          renderAndWire();
        } catch (error) {
          showEditorMessage(container, error.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-settlement-amount]').forEach(input => {
      input.addEventListener('input', () => {
        input.dataset.manual = '1';
        const row = input.closest('.payment-split-editable');
        const split = state.splits.find(item => item.id === row?.dataset.splitId);
        if (!split) return;
        split.settlement_amount = input.value === '' ? null : Number(input.value);
        split.settlementManual = true;
        const preview = row.querySelector('.payment-fx-preview');
        const bank = bankForSplit(split, state.banks);
        if (preview) preview.textContent = buildPaymentFxPreview({
          voucherAmount: Number(row.querySelector('[data-split-amount]')?.value || split.amount),
          voucherCurrency: state.voucher.currency || 'TWD',
          voucherRate: state.voucher.exchange_rate,
          settlementAmount: split.settlement_amount,
          settlementCurrency: bank?.currency || split.settlement_currency || 'TWD',
          settlementRate: state.paymentRates[bank?.currency || split.settlement_currency || 'TWD'],
          currencies: state.currencies
        });
      });
    });

    container.querySelectorAll('[data-split-amount]').forEach(input => {
      input.addEventListener('change', () => {
        updateStateFromInputs(container, state);
        applySettlementDefaults(state);
        renderAndWire();
      });
    });

    container.querySelectorAll('[data-add-split]').forEach(button => {
      button.addEventListener('click', () => {
        updateStateFromInputs(container, state);
        if (state.splits.length >= MAX_SPLITS) return showEditorMessage(container, `每張單據最多 ${MAX_SPLITS} 筆付款拆分。`, 'error');
        const group = button.closest('.payment-split-group');
        const key = group?.dataset.lineKey;
        const candidates = state.splits.filter(split => split.payment_status === 'assigned' && lineKey(split.voucher_line_id) === key);
        const source = candidates.sort((a, b) => b.amount - a.amount)[0];
        if (!source || source.amount <= 0.01) return showEditorMessage(container, '此項目沒有足夠金額可再拆分。', 'error');
        const sourceAmountBefore = source.amount;
        const sourceSettlementBefore = Number(source.settlement_amount || 0);
        const secondAmount = Math.round((source.amount / 2) * 100) / 100;
        source.amount = Math.round((source.amount - secondAmount) * 100) / 100;
        const settlementCurrency = bankForSplit(source, state.banks)?.currency || source.settlement_currency || state.voucher.currency || 'TWD';
        const secondSettlement = sourceSettlementBefore > 0
          ? roundCurrency(sourceSettlementBefore * secondAmount / sourceAmountBefore, state.currencies, settlementCurrency)
          : null;
        source.settlement_amount = sourceSettlementBefore > 0
          ? roundCurrency(sourceSettlementBefore - secondSettlement, state.currencies, settlementCurrency)
          : null;
        state.splits.push({
          ...source,
          id: crypto.randomUUID(),
          amount: secondAmount,
          settlement_amount: secondSettlement,
          payment_recipient_id: '',
          payment_status: 'assigned',
          payNow: true
        });
        renderAndWire();
      });
    });

    container.querySelectorAll('[data-remove-split]').forEach(button => {
      button.addEventListener('click', () => {
        updateStateFromInputs(container, state);
        const row = button.closest('.payment-split-editable');
        const split = state.splits.find(item => item.id === row?.dataset.splitId);
        if (!split) return;
        const siblings = state.splits.filter(item => item.payment_status === 'assigned'
          && item.id !== split.id && lineKey(item.voucher_line_id) === lineKey(split.voucher_line_id));
        if (!siblings.length) return showEditorMessage(container, '每個未付款項目至少需要一筆拆分。', 'error');
        const sibling = siblings[0];
        sibling.amount = Math.round((sibling.amount + split.amount) * 100) / 100;
        const siblingCurrency = bankForSplit(sibling, state.banks)?.currency || sibling.settlement_currency;
        const removedCurrency = bankForSplit(split, state.banks)?.currency || split.settlement_currency;
        if (siblingCurrency && siblingCurrency === removedCurrency
          && Number.isFinite(sibling.settlement_amount) && Number.isFinite(split.settlement_amount)) {
          sibling.settlement_amount = roundCurrency(
            sibling.settlement_amount + split.settlement_amount,
            state.currencies,
            siblingCurrency
          );
        } else {
          sibling.settlementManual = false;
        }
        state.splits = state.splits.filter(item => item.id !== split.id);
        applySettlementDefaults(state);
        renderAndWire();
      });
    });

    container.querySelector('[data-payment-date]')?.addEventListener('change', async event => {
      updateStateFromInputs(container, state);
      if (!state.noteManual) state.note = buildDefaultNote(event.target.value, voucher);
      try {
        await refreshPaymentRates(client, state);
        applySettlementDefaults(state);
        renderAndWire();
      } catch (error) {
        showEditorMessage(container, error.message, 'error');
      }
    });
    container.querySelector('[data-accounting-note]')?.addEventListener('input', event => {
      event.target.dataset.manual = '1';
      state.noteManual = true;
    });
    container.querySelector('[data-cancel]')?.addEventListener('click', onCancel);

    container.querySelector('[data-save-splits]')?.addEventListener('click', async () => {
      try {
        updateStateFromInputs(container, state);
        applySettlementDefaults(state);
        validateState(state);
        setBusy(container, true, '儲存付款設定中...');
        const { data, error } = await client.rpc('save_voucher_payment_splits', {
          p_voucher_id: voucher.id,
          p_expected_revision: Number(state.voucher.payment_assignment_revision || 0),
          p_splits: assignedPayload(state.splits),
          p_accounting_note: state.note.trim() || null
        });
        if (error) throw error;
        state.voucher.payment_assignment_revision = data.revision;
        state.voucher.accounting_note = state.note.trim() || null;
        storedSplits = await fetchVoucherPaymentSplits(client, voucher.id);
        state.splits = storedSplits;
        await refreshPaymentRates(client, state);
        applySettlementDefaults(state);
        await onSaved(data);
        renderAndWire();
        showEditorMessage(container, '付款設定已儲存。', 'success');
      } catch (error) {
        setBusy(container, false);
        showEditorMessage(container, error.message, 'error');
      }
    });

    container.querySelector('[data-pay-splits]')?.addEventListener('click', async () => {
      if (paymentInFlight) return;
      paymentInFlight = true;
      try {
        updateStateFromInputs(container, state);
        await refreshPaymentRates(client, state);
        applySettlementDefaults(state);
        const { selectedIds } = validateState(state, { requireSelection: true, requireRate: true });
        const selectedSplits = state.splits.filter(split => selectedIds.includes(split.id));
        const voucherTotal = selectedSplits.reduce((sum, split) => sum + split.amount, 0);
        const bankTotals = groupSettlementTotals(selectedSplits, state.banks, state.currencies).join('、');
        const confirmed = await confirmAction(
          `確認本次沖銷 ${formatMoney(voucherTotal, voucher.currency || 'TWD', state.currencies)}，公司銀行實際付出 ${bankTotals}？`
        );
        if (!confirmed) {
          paymentInFlight = false;
          return;
        }
        setBusy(container, true, '付款處理中...');
        const saveResponse = await client.rpc('save_voucher_payment_splits', {
          p_voucher_id: voucher.id,
          p_expected_revision: Number(state.voucher.payment_assignment_revision || 0),
          p_splits: assignedPayload(state.splits),
          p_accounting_note: state.note.trim() || null
        });
        if (saveResponse.error) throw saveResponse.error;
        state.voucher.payment_assignment_revision = saveResponse.data.revision;

        const payResponse = await client.rpc('pay_voucher_splits', {
          p_voucher_id: voucher.id,
          p_expected_revision: saveResponse.data.revision,
          p_payment_date: state.paymentDate,
          p_split_ids: selectedIds
        });
        if (payResponse.error) throw payResponse.error;
        try {
          await onPaid(payResponse.data);
        } catch (refreshError) {
          console.error('付款已完成，但畫面更新失敗:', refreshError);
          lockCommittedEditor(container, '付款已完成，但畫面更新失敗。請關閉視窗並重新整理；請勿重複付款。');
        }
      } catch (error) {
        paymentInFlight = false;
        setBusy(container, false);
        showEditorMessage(container, error.message, 'error');
      }
    });
  };

  renderAndWire();
  return { state };
}
