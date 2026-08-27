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

export async function fetchWallet(userId: string) {
  const { data, error } = await client()
    .schema('slot')
    .from('wallet')
    .select('free_points, points')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data as { free_points: number; points: number };
}

/** The only way to spin. The grid, the win and the wallet write all happen server-side. */
export async function play(bet: number): Promise<SpinResult> {
  const { data, error } = await client().rpc('play', { p_bet: bet });
  if (error) throw new Error(error.message);
  return data as SpinResult;
}
