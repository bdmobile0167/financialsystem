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
  if (profile.active === false) {
    await supabase.auth.signOut();
    return { blocked: true };
  }

  return {
    id: sessionData.session.user.id,
    username: profile.email,
    name: profile.full_name,
    role: profile.role,
    department_id: profile.department_id, // 修正：將 key 名稱改為 department_id
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
    return { ok: false, message: '登入成功但找不到使用者資料，請聯絡管理員。' };
  }
  if (user.blocked) {
    return { ok: false, message: '這個帳號已被停用，請聯絡管理員。' };
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