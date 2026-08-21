export const VOUCHER_STATUS = {
  PENDING_REVIEW: 'pending_review',
  MANAGER_REJECTED: 'manager_rejected',
  PENDING_ACCOUNTING: 'pending_accounting',
  ACCOUNTING_REJECTED: 'accounting_rejected',
  APPROVED: 'approved',       // 主管/會計已核准，待付款
  CLOSED: 'closed',           // 已付款結案
  VOIDED: 'voided',           // 銷案
  CANCELLED: 'cancelled'
};

export const STATUS_LABELS = {
  [VOUCHER_STATUS.PENDING_REVIEW]: '待主管審核',
  [VOUCHER_STATUS.MANAGER_REJECTED]: '主管退回',
  [VOUCHER_STATUS.PENDING_ACCOUNTING]: '待會計核准',
  [VOUCHER_STATUS.ACCOUNTING_REJECTED]: '會計退回',
  [VOUCHER_STATUS.APPROVED]: '已核准待付款',
  [VOUCHER_STATUS.CLOSED]: '已付款結案',
  [VOUCHER_STATUS.VOIDED]: '已銷案',
  [VOUCHER_STATUS.CANCELLED]: '已撤銷'
};

/** 依角色與目前狀態，回傳可執行的動作 */
export function getAllowedActions(role, status) {
  const actions = [];
  if (role === 'employee') {
    if ([VOUCHER_STATUS.PENDING_REVIEW].includes(status)) {
      actions.push('cancel');
    }
    if ([VOUCHER_STATUS.MANAGER_REJECTED, VOUCHER_STATUS.ACCOUNTING_REJECTED].includes(status)) {
      actions.push('resubmit');
    }
  }
  if (['manager', 'admin'].includes(role) && status === VOUCHER_STATUS.PENDING_REVIEW) {
    actions.push('manager_approve', 'manager_reject');
  }
  if (['accounting', 'admin'].includes(role) && status === VOUCHER_STATUS.PENDING_ACCOUNTING) {
    actions.push('accounting_approve', 'accounting_reject');
  }
  if (['accounting', 'admin'].includes(role) && status === VOUCHER_STATUS.APPROVED) {
    actions.push('close'); // 付款結案
  }
  if (['accounting', 'admin'].includes(role) && status !== VOUCHER_STATUS.VOIDED) {
    actions.push('void');
  }
  return actions;
}