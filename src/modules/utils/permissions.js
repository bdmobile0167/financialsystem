export function isAccountingOrAdminUser(user) {
  return ['accounting', 'admin', 'super_admin'].includes(user?.role)
    || user?.department === '財務部'
    || user?.department_name === '財務部';
}

export function userHasPermission(user, permissionKey) {
  if (!user) return false;
  if (isAccountingOrAdminUser(user)) return true;
  return user.permissions?.[permissionKey] === true;
}

