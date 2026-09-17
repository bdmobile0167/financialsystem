const MAX_EMPLOYEES = 200;
const MAX_AMOUNT = 999999999.99;

function asAmount(value, label) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw new Error(`${label}必須是 0 到 ${MAX_AMOUNT.toLocaleString()} 之間的數字`);
  }
  if (Math.round(amount * 100) !== amount * 100) {
    throw new Error(`${label}最多只能有兩位小數`);
  }
  return amount;
}

export function calculatePayrollAmounts(values = {}) {
  const gross = asAmount(values.gross_salary ?? values.gross, '薪資');
  const labor = asAmount(values.labor_insurance ?? values.labor, '勞保');
  const health = asAmount(values.health_insurance ?? values.health, '健保');
  const pension = asAmount(values.pension, '勞退');
  const net = Math.round((gross - labor - health) * 100) / 100;
  if (net <= 0 && gross > 0) throw new Error('勞保與健保合計必須低於薪資');
  return { gross, labor, health, pension, net };
}

export function validatePayrollItems(items = []) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_EMPLOYEES) {
    throw new Error(`請勾選 1 到 ${MAX_EMPLOYEES} 位員工`);
  }
  const seen = new Set();
  return items.map(item => {
    if (!item?.payee_id || seen.has(item.payee_id)) throw new Error('同一位員工不可重複加入薪資批次');
    seen.add(item.payee_id);
    const amounts = calculatePayrollAmounts(item);
    if (amounts.gross <= 0) throw new Error('每位員工的薪資必須大於 0');
    return {
      payee_id: item.payee_id,
      gross_salary: amounts.gross,
      labor_insurance: amounts.labor,
      health_insurance: amounts.health,
      pension: amounts.pension
    };
  });
}

export function summarizePayrollItems(items = []) {
  return validatePayrollItems(items).reduce((totals, item) => {
    const amounts = calculatePayrollAmounts(item);
    totals.gross += amounts.gross;
    totals.labor += amounts.labor;
    totals.health += amounts.health;
    totals.pension += amounts.pension;
    totals.net += amounts.net;
    totals.cashOut += amounts.net + amounts.labor + amounts.health + amounts.pension;
    return totals;
  }, { gross: 0, labor: 0, health: 0, pension: 0, net: 0, cashOut: 0 });
}

export function formatPayrollMoney(value, currency = 'TWD') {
  return `${currency || 'TWD'} ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function getPayrollAgencySetupIssues(mappings = [], payees = []) {
  return (mappings || []).filter(mapping => {
    const payee = (payees || []).find(item => item.is_active !== false && item.identifier === mapping.payee_identifier);
    if (!payee) return true;
    const activeRecipients = (payee.payment_recipients || []).filter(recipient => recipient.active !== false);
    if (activeRecipients.length) {
      return !activeRecipients.some(recipient =>
        String(recipient.display_name || '').trim()
        && String(recipient.bank_name || '').trim()
        && String(recipient.account_name || '').trim()
        && String(recipient.account_number || '').trim()
      );
    }
    return !(
      String(payee.name || '').trim()
      && String(payee.bank_name || '').trim()
      && String(payee.account_name || payee.name || '').trim()
      && String(payee.account_number || payee.bank_account || '').trim()
    );
  });
}

export function createPayrollRequestTracker(randomUUID = () => crypto.randomUUID()) {
  let requestId = null;
  return {
    current() {
      requestId ||= randomUUID();
      return requestId;
    },
    reset() {
      requestId = null;
    }
  };
}
