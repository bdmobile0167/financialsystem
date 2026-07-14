import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://imlmclalgbfxhhnpsyam.supabase.co';
const SUPABASE_ANON_KEY = '貼上你真正的 Publishable key（不是 xxxxxx 那組占位符）';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);