import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOCAL_FALLBACK_CONFIG = {
  supabaseUrl: 'https://imlmclalgbfxhhnpsyam.supabase.co',
  supabaseAnonKey: 'sb_publishable__kSnn2khITxrH5iYh6J72g_zxRDbfHU',
  source: 'local-fallback'
};

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
    console.warn('Using local Supabase fallback config:', error.message);
    return LOCAL_FALLBACK_CONFIG;
  }
}

export const supabasePublicConfig = await loadPublicConfig();
export const supabase = createClient(
  supabasePublicConfig.supabaseUrl,
  supabasePublicConfig.supabaseAnonKey
);
