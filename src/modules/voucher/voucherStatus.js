export const VOUCHER_STATUS = {
  PENDING_REVIEW: 'pending_review',
  MANAGER_REJECTED: 'manager_rejected',
  PENDING_ACCOUNTING: 'pending_accounting',
  ACCOUNTING_REJECTED: 'accounting_rejected',
  APPROVED: 'approved',
  CLOSED: 'closed',
  PAID: 'paid',
  VOIDED: 'voided',
  CANCELLED: 'cancelled'
};

export const STATUS_LABELS = {
  [VOUCHER_STATUS.PENDING_REVIEW]: '\u5f85\u4e3b\u7ba1\u5be9\u6838',
  [VOUCHER_STATUS.MANAGER_REJECTED]: '\u4e3b\u7ba1\u9000\u56de',
  [VOUCHER_STATUS.PENDING_ACCOUNTING]: '\u5f85\u6703\u8a08\u6838\u51c6',
  [VOUCHER_STATUS.ACCOUNTING_REJECTED]: '\u6703\u8a08\u9000\u56de',
  [VOUCHER_STATUS.APPROVED]: '\u5f85\u4ed8\u6b3e',
  [VOUCHER_STATUS.CLOSED]: '\u5df2\u92b7\u5e33',
  [VOUCHER_STATUS.PAID]: '\u5df2\u4ed8\u6b3e',
  [VOUCHER_STATUS.VOIDED]: '\u5df2\u4f5c\u5ee2',
  [VOUCHER_STATUS.CANCELLED]: '\u5df2\u64a4\u92b7'
};

export function getAllowedActions(role, status) {
  const actions = [];
  const financeRoles = ['accounting', 'admin', 'super_admin'];
  const managerRoles = ['manager', 'admin', 'super_admin'];

  if (role === 'employee') {
    if (status === VOUCHER_STATUS.PENDING_REVIEW) actions.push('cancel');
    if ([VOUCHER_STATUS.MANAGER_REJECTED, VOUCHER_STATUS.ACCOUNTING_REJECTED].includes(status)) {
      actions.push('resubmit');
    }
  }

  if (managerRoles.includes(role) && status === VOUCHER_STATUS.PENDING_REVIEW) {
    actions.push('manager_approve', 'manager_reject');
  }

  if (financeRoles.includes(role) && status === VOUCHER_STATUS.PENDING_ACCOUNTING) {
    actions.push('accounting_approve', 'accounting_reject');
  }

  if (financeRoles.includes(role) && status === VOUCHER_STATUS.APPROVED) {
    actions.push('close');
  }

  if (financeRoles.includes(role) && ![VOUCHER_STATUS.VOIDED, VOUCHER_STATUS.CANCELLED].includes(status)) {
    actions.push('void');
  }

  return actions;
}
