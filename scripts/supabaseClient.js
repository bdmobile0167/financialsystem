import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function loadPublicConfig() {
  try {
    const response = await fetch('/api/public-config', { cache: 'no-store' });
    if (!response.ok) throw new Error(`public-config ${response.status}`);
    const config = await response.json();
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      throw new Error('public-config missing Supabase URL or anon key');
    }
    return { ...config, source: config.source || 'api' };
  } catch (error) {
    const message = document.getElementById('loginMessage');
    if (message) {
      message.className = 'message error';
      message.textContent = '系統連線設定未就緒，請聯絡管理員。';
    }
    throw new Error(`Supabase public config unavailable: ${error.message}`);
  }
}

export const supabasePublicConfig = await loadPublicConfig();
export const supabase = createClient(
  supabasePublicConfig.supabaseUrl,
  supabasePublicConfig.supabaseAnonKey
);
