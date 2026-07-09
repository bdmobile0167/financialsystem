export function loadApprovalRequests() {
  return JSON.parse(localStorage.getItem('approvalRequests') || '[]');
}

export function saveApprovalRequests(requests) {
  localStorage.setItem('approvalRequests', JSON.stringify(requests));
}

export function requestApproval(email) {
  const requests = loadApprovalRequests();
  const normalized = email.trim().toLowerCase();
  if (!requests.some(item => item.email === normalized)) {
    requests.push({ email: normalized, timestamp: new Date().toISOString(), status: 'pending' });
    saveApprovalRequests(requests);
  }
  return requests;
}

export function approveEmail(email) {
  const requests = loadApprovalRequests();
  const updated = requests.map(item => item.email === email ? { ...item, status: 'approved' } : item);
  saveApprovalRequests(updated);
  return updated;
}

export function isEmailApproved(email) {
  const normalized = email.trim().toLowerCase();
  return loadApprovalRequests().some(item => item.email === normalized && item.status === 'approved');
}
