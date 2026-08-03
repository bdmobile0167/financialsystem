import { USER_KEY } from './state.js';
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
  const role = user.role || user.user_metadata?.role || 'employee';
  return {
    username: email,
    name: user.user_metadata?.full_name || user.email || 'Vercel 使用者',
    role: role
  };
}

export function isAdminUser(role) {
  return role === 'admin';
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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('getSession error', sessionError);
    return null;
  }
  if (!sessionData?.session) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionData.session.user.id)
    .single();

  if (profileError) {
    console.error('fetch profile error', profileError);
    return null;
  }
  if (!profile) return null;
  if (profile.active === false) {
    await supabase.auth.signOut();
    return { blocked: true };
  }

  return {
    id: sessionData.session.user.id,
    username: profile.email,
    name: profile.full_name,
    role: profile.role || 'employee',
    department_id: profile.department_id, // 修正：將 key 名稱改為 department_id
    mustChangePassword: profile.must_change_password
  };
}

export async function signInWithSupabase(email, password) {
  // 1. 執行登入，直接從回傳結果取得 user 物件，避免依賴後續的 getSession 同步時差
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('signInWithPassword error', error);
    const message = (error.message === 'Invalid login credentials' || /invalid/i.test(error.message)) ? '帳號或密碼錯誤。' : error.message;
    return { ok: false, message };
  }

  const userId = data.user?.id;
  if (!userId) {
    console.error('signIn: no user id in response', data);
    return { ok: false, message: '登入成功但找不到使用者資料，請聯絡管理員。' };
  }

  // 2. 直接以取得的 userId 查詢對應的 profile 資料
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('fetch profile after signIn error', profileError);
    return { ok: false, message: '登入成功但無法讀取個人資料，請聯絡管理員。' };
  }

  if (!profile) {
    console.error('fetch profile after signIn: profile is null', userId);
    return { ok: false, message: '登入成功但找不到使用者資料，請聯絡管理員。' };
  }

  if (profile.active === false) {
    await supabase.auth.signOut();
    return { ok: false, message: '這個帳號已被停用，請聯絡管理員。' };
  }

  // 在回傳 user 的地方加上 company_id
  const user = {
    id: userId,
    username: profile.email,
    name: profile.full_name,
    role: profile.role || 'employee', // 'employee', 'admin', 或是 'super_admin'
    department_id: profile.department_id,
    company_id: profile.company_id, // 💡 新增這行
    mustChangePassword: profile.must_change_password
  };

  // 若是 super_admin 登入，預設先幫他選定一家公司，並存入 localStorage
  if (profile.role === 'super_admin') {
    if (!localStorage.getItem('current_company_id')) {
      // 預設先看他自己原本歸屬的公司，或者系統預設第一家
      localStorage.setItem('current_company_id', profile.company_id); 
    }
  } else {
    // 一般員工，永遠綁定自己的公司
    localStorage.setItem('current_company_id', profile.company_id);
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
  // 👉 修正：登出時必須同步清除本地端儲存的使用者狀態鍵值
  localStorage.removeItem(USER_KEY);
}