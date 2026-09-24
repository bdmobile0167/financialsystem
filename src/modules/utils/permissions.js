export function isAccountingOrAdminUser(user) {
  return ['accounting', 'admin', 'super_admin'].includes(user?.role);
}

const ADMIN_ONLY = new Set(['canManageUsers', 'canManageSettings']);
const FINANCE_ONLY = new Set([
  'canViewFinancials', 'canViewBankAccounts',
  'canReconcileBank', 'canViewReports',
  ...ADMIN_ONLY
]);

export function userHasPermission(user, permissionKey) {
  if (!user) return false;
  if (ADMIN_ONLY.has(permissionKey)) return ['admin', 'super_admin'].includes(user.role);
  if (FINANCE_ONLY.has(permissionKey)) return isAccountingOrAdminUser(user);
  if (isAccountingOrAdminUser(user)) return true;
  return user.permissions?.[permissionKey] === true;
}
