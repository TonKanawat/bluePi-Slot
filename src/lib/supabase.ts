import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null until .env.local is filled in, so the UI can run standalone during development. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isConnected = () => supabase !== null;
