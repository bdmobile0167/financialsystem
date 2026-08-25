// Runtime note:
// The active user-management UI currently lives in scripts/ui.js because the
// production entry chain is index.html -> scripts/main.js -> scripts/ui.js.
//
// Keep this module as a compatibility facade only. Reintroducing another
// top-level renderUserManagementView implementation here, then importing it
// into scripts/ui.js without aliasing, recreates the startup blocker:
// "SyntaxError: Identifier 'renderUserManagementView' has already been declared".

export async function renderUserManagementView() {
  if (typeof window !== 'undefined' && typeof window.renderUserManagementView === 'function') {
    return window.renderUserManagementView();
  }

  const container = typeof document !== 'undefined'
    ? document.getElementById('userManagementContainer')
    : null;

  if (container) {
    container.innerHTML = '<div class="muted">User management is not initialized. Please refresh the page.</div>';
  }

  return null;
}
