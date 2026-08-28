import { supabase } from './supabase';

export interface SymbolRow {
  id: string;
  name: string;
  image_path: string;
  weight: number;
  is_wild: boolean;
  is_scatter: boolean;
  scatter_free_spins: number;
  is_active: boolean;
  created_at: string;
}

export interface CombinationRow {
  id: string;
  name: string;
  bonus: number;
  is_active: boolean;
  symbol_count: number;
  /** 'distinct' for 5+ member groups, 'repeatable' for 1-4. */
  match_rule: 'distinct' | 'repeatable';
  symbols: { id: string; name: string; image_path: string }[];
}

function client() {
  if (!supabase) throw new Error('The site is not connected to its database.');
  return supabase;
}

/** Symbol art lives in a public bucket, so the board can load it straight from the CDN. */
export function symbolUrl(path: string): string {
  if (!path) return '';
  return client().storage.from('symbols').getPublicUrl(path).data.publicUrl;
}

export async function fetchSymbols(): Promise<SymbolRow[]> {
  const { data, error } = await client()
    .from('game_symbols')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data as SymbolRow[];
}

export async function fetchCombinations(): Promise<CombinationRow[]> {
  const { data, error } = await client()
    .from('winning_combinations')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data as CombinationRow[];
}

/** Uploads the image first, then records the symbol. The stored value is the object
 *  path, not a URL, so moving buckets later doesn't invalidate every row. */
export async function uploadSymbolImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const safe = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
  const path = `${safe || 'symbol'}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const { error } = await client().storage.from('symbols').upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export interface SymbolInput {
  id?: string | null;
  name: string;
  image_path: string;
  weight: number;
  kind: 'normal' | 'wild' | 'scatter';
  scatter_free_spins: number;
}

export async function saveSymbol(s: SymbolInput): Promise<string> {
  const { data, error } = await client().rpc('save_symbol', {
    p_id: s.id ?? null,
    p_name: s.name,
    p_image_path: s.image_path,
    p_weight: s.weight,
    p_is_wild: s.kind === 'wild',
    p_is_scatter: s.kind === 'scatter',
    p_scatter_free_spins: s.kind === 'scatter' ? s.scatter_free_spins : 0,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function archiveSymbol(id: string): Promise<void> {
  const { error } = await client().rpc('archive_symbol', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function saveCombination(
  id: string | null, name: string, bonus: number, symbolIds: string[],
): Promise<string> {
  const { data, error } = await client().rpc('save_combination', {
    p_id: id, p_name: name, p_bonus: bonus, p_symbol_ids: symbolIds,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function archiveCombination(id: string): Promise<void> {
  const { error } = await client().rpc('archive_combination', { p_id: id });
  if (error) throw new Error(error.message);
}

/** The special multipliers the spec allows, and nothing else. */
export const BONUS_OPTIONS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5] as const;

// ---------------------------------------------------------------- players
export interface PlayerRow {
  id: string;
  email: string;
  display_name: string | null;
  role: 'system_admin' | 'deputy_admin' | 'line_manager' | 'player';
  is_active: boolean;
  first_login_at: string | null;
  free_points: number;
  points: number;
}

export async function fetchPlayers(): Promise<PlayerRow[]> {
  const { data, error } = await client().from('players').select('*').order('email');
  if (error) throw new Error(error.message);
  return data as PlayerRow[];
}

/** Deltas, not absolutes: the ledger records the change and who made it, and the
 *  database refuses anything that would push a balance below zero. */
export async function adjustPoints(
  target: string, freeDelta: number, pointsDelta: number, note: string,
): Promise<{ free_points: number; points: number }> {
  const { data, error } = await client().rpc('adjust_points', {
    p_target: target, p_free_delta: freeDelta, p_points_delta: pointsDelta, p_note: note || null,
  });
  if (error) throw new Error(error.message);
  return data as { free_points: number; points: number };
}

export async function registerPlayer(email: string, displayName: string): Promise<string> {
  const { data, error } = await client().rpc('register_player', {
    p_email: email, p_display_name: displayName || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setRole(target: string, role: PlayerRow['role']): Promise<void> {
  const { error } = await client().rpc('set_role', { p_target: target, p_role: role });
  if (error) throw new Error(error.message);
}
