import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Runtime/build-time configurable Supabase settings.
// Preferred: set window.__SUPABASE_URL__/window.__SUPABASE_ANON_KEY in HTML
// or provide via Vite/ImportMeta env as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const FALLBACK_SUPABASE_URL = 'https://imlmclalgbfxhhnpsyam.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable__kSnn2khITxrH5iYh6J72g_zxRDbfHU';

const SUPABASE_URL = (typeof window !== 'undefined' && (window.__SUPABASE_URL__ || window.SUPABASE_URL)) ||
	(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
	FALLBACK_SUPABASE_URL;

const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && (window.__SUPABASE_ANON_KEY__ || window.SUPABASE_ANON_KEY)) ||
	(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
	FALLBACK_SUPABASE_ANON_KEY;

if (SUPABASE_URL === FALLBACK_SUPABASE_URL || SUPABASE_ANON_KEY === FALLBACK_SUPABASE_ANON_KEY) {
	console.warn('Supabase client using fallback values; set SUPABASE_URL and SUPABASE_ANON_KEY via build/runtime environment to avoid committed keys.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);