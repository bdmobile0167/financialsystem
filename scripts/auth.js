import { USER_KEY } from './state.js';
import { ADMIN_USERNAME } from './config.js';
import { requestApproval, isEmailApproved } from './approval.js';

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

export function isLocalTestMode() {
  return window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.protocol === 'file:';
}

export function formatUser(user) {
  const email = normalizeEmail(user.email || user.user_metadata?.email || '');
  return {
    username: email,
    name: user.user_metadata?.full_name || user.email || 'Netlify 使用者',
    role: isAdminUser(email) ? 'admin' : 'member'
  };
}

export function isAdminUser(email) {
  return normalizeEmail(email) === normalizeEmail(ADMIN_USERNAME);
}

export function saveCurrentUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isIdentityEnabled() {
  return !!(window.netlifyIdentity && typeof window.netlifyIdentity.open === 'function');
}

export async function checkIdentityEndpoint() {
  if (!isIdentityEnabled()) return false;
  try {
    const response = await fetch('/.netlify/identity/settings', { method: 'GET', headers: { Accept: 'application/json' } });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export function signInWithGoogle() {
  if (isIdentityEnabled()) {
    window.netlifyIdentity.open('login');
    return;
  }
  throw new Error('Google 登入目前僅支援 Netlify Identity。請使用 netlify dev 或部署後再試。');
}

export function handleNetlifyIdentity(onUser) {
  if (!window.netlifyIdentity) return;
  window.netlifyIdentity.init({ locale: 'zh-TW' });

  window.netlifyIdentity.on('init', user => {
    if (user) {
      const payload = formatUser(user);
      saveCurrentUser(payload);
      onUser(payload);
    }
  });

  window.netlifyIdentity.on('login', user => {
    const payload = formatUser(user);
    saveCurrentUser(payload);
    onUser(payload);
  });

  window.netlifyIdentity.on('logout', () => {
    localStorage.removeItem(USER_KEY);
    window.location.reload();
  });
}

export function handleLoginApproval(subject) {
  const email = normalizeEmail(typeof subject === 'string' ? subject : subject?.username || subject?.email);
  if (!email) {
    return { approved: false, message: '登入失敗，未取得使用者資料。' };
  }
  if (isAdminUser(email)) {
    return { approved: true, message: '管理者登入成功。' };
  }
  if (isEmailApproved(email)) {
    return { approved: true, message: '該帳號已通過核准。' };
  }
  requestApproval(email);
  return { approved: false, message: '尚未核准，已送出申請，請管理者登入後核准。' };
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return Array.from(new Uint8Array(data)).map(item => item.toString(16).padStart(2, '0')).join('');
}

export function loadPasswordStore() {
  return JSON.parse(localStorage.getItem('passwordStore') || '{}');
}

export function savePasswordStore(store) {
  localStorage.setItem('passwordStore', JSON.stringify(store));
}

export async function setPasswordForUser(email, password) {
  const store = loadPasswordStore();
  store[normalizeEmail(email)] = await hashPassword(password);
  savePasswordStore(store);
}

export async function verifyPassword(email, password) {
  const store = loadPasswordStore();
  const hashed = store[normalizeEmail(email)];
  if (!hashed) {
    return false;
  }
  return hashed === await hashPassword(password);
}

export async function loginWithEmailPassword(email, password) {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    return { ok: false, message: '請輸入 email 與密碼。' };
  }

  if (isLocalTestMode()) {
    return { ok: true, user: { username: normalized, name: normalized, role: isAdminUser(normalized) ? 'admin' : 'member' } };
  }

  if (isAdminUser(normalized)) {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalized, password })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        return { ok: true, user: { username: normalized, name: '管理者', role: 'admin' } };
      }
      if (data?.message) {
        return { ok: false, message: data.message };
      }
    } catch (error) {
      // fallback to local password store
    }
  }

  const hasPassword = await verifyPassword(normalized, password);
  if (!hasPassword) {
    return { ok: false, message: '密碼錯誤，或尚未設定密碼。' };
  }
  if (!isAdminUser(normalized) && !isEmailApproved(normalized)) {
    requestApproval(normalized);
    return { ok: false, message: '尚未核准，已送出申請，請管理者核准後再登入。' };
  }
  return { ok: true, user: { username: normalized, name: normalized, role: isAdminUser(normalized) ? 'admin' : 'member' } };
}
import { supabase } from './supabaseClient.js';

export async function getCurrentSessionUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionData.session.user.id)
    .single();

  if (!profile) return null;

  return {
    id: sessionData.session.user.id,
    username: profile.email,
    name: profile.full_name,
    role: profile.role,
    department: profile.department,
    mustChangePassword: profile.must_change_password
  };
}

export async function signInWithSupabase(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.message === 'Invalid login credentials' ? '帳號或密碼錯誤。' : error.message;
    return { ok: false, message };
  }
  const user = await getCurrentSessionUser();
  if (!user) {
    return { ok: false, message: '登入成功但找不到使用者資料，請聯絡管理員。' };
  }
  return { ok: true, user };
}

export async function changeMyPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: error.message };

  const { data: sessionData } = await supabase.auth.getSession();
  await supabase.from('profiles').update({ must_change_password: false }).eq('id', sessionData.session.user.id);
  return { ok: true };
}

export async function signOutSupabase() {
  await supabase.auth.signOut();
}