import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://imlmclalgbfxhhnpsyam.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__kSnn2khITxrH5iYh6J72g_zxRDbfHU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
