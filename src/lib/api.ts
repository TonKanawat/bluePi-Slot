import { supabase } from './supabase';
import type { SymbolRow } from './admin';

export interface Readiness {
  ready: boolean;
  missing: string[];
  symbols: number;
  groups: number;
  wilds: number;
  scatters: number;
}

export interface WinningLine {
  payline: number;
  family: string;
  combination: string;
  bonus: number;
}

/** Exactly what public.play() hands back. The grid is authoritative: the browser
 *  renders it, it does not generate it. */
export interface SpinResult {
  grid: string[][];
  lines: WinningLine[];
  line_count: number;
  normal_lines: number;
  base: number;
  multiplier: number;
  payout: number;
  bet: number;
  was_free_spin: boolean;
  paid_from_free: number;
  paid_from_wallet: number;
  free_points: number;
  points: number;
  free_spins: number;
  free_spins_left: number;
  free_spin_round: number;
  chain_ended: boolean;
  yellow_card: boolean;
  ban_bets_left: number;
}

export interface Wallet { free_points: number; points: number; }

function client() {
  if (!supabase) throw new Error('The site is not connected to its database.');
  return supabase;
}

export async function fetchReadiness(): Promise<Readiness> {
  const { data, error } = await client().rpc('game_ready');
  if (error) throw new Error(error.message);
  return data as Readiness;
}

export async function fetchWallet(): Promise<Wallet> {
  const { data, error } = await client().rpc('my_wallet');
  if (error) throw new Error(error.message);
  return (data as Wallet[])?.[0] ?? { free_points: 0, points: 0 };
}

/** The reel symbols, so the board can draw the admin's uploaded artwork. */
export async function fetchActiveSymbols(): Promise<SymbolRow[]> {
  const { data, error } = await client()
    .from('game_symbols').select('*').eq('is_active', true).order('name');
  if (error) throw new Error(error.message);
  return data as SymbolRow[];
}

/** The only way to spin. Grid, win and wallet are all decided server-side. */
export async function play(bet: number): Promise<SpinResult> {
  const { data, error } = await client().rpc('play', { p_bet: bet });
  if (error) throw new Error(error.message);
  return data as SpinResult;
}

export interface LineExplanation {
  payline: number;
  family: string;
  symbols: string;
  won: boolean;
  group: string | null;
  reason: string | null;
}

/** Why each payline did or did not win, for the grid just played. */
export async function explainGrid(grid: string[][]): Promise<LineExplanation[]> {
  const { data, error } = await client().rpc('explain_grid', { p_grid: grid });
  if (error) throw new Error(error.message);
  return data as LineExplanation[];
}
