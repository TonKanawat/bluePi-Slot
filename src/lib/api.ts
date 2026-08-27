import { supabase } from './supabase';
import type { SpinResult } from '../game/types';

export interface Readiness {
  ready: boolean;
  missing: string[];
  symbols: number;
  groups: number;
  wilds: number;
  scatters: number;
}

function client() {
  if (!supabase) throw new Error('The site is not connected to its database.');
  return supabase;
}

export async function fetchReadiness(): Promise<Readiness> {
  const { data, error } = await client().rpc('game_ready');
  if (error) throw new Error(error.message);
  return data as Readiness;
}

/** The caller's own balances. Goes through a public wrapper because PostgREST only
 *  serves schemas listed as exposed, and `slot` deliberately is not one of them. */
export async function fetchWallet() {
  const { data, error } = await client().rpc('my_wallet');
  if (error) throw new Error(error.message);
  const row = (data as { free_points: number; points: number }[])?.[0];
  return row ?? { free_points: 0, points: 0 };
}

/** The only way to spin. The grid, the win and the wallet write all happen server-side. */
export async function play(bet: number): Promise<SpinResult> {
  const { data, error } = await client().rpc('play', { p_bet: bet });
  if (error) throw new Error(error.message);
  return data as SpinResult;
}
