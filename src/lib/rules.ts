import { supabase } from './supabase';

export interface LadderRung { lines: number; multiplier: number }

export interface GameRules {
  max_paylines: number;
  max_multiplier: number;
  cap_final: boolean;
  max_wilds: number;
  rungs: number;
  top_rung: number | null;
}

export interface LineSim {
  spins: number;
  max_paylines: number;
  distribution: { lines: number; spins: number; pct: number }[];
  most_likely: number;
  most_likely_pct: number;
  mean_lines: number;
  median_lines: number;
  p95_lines: number;
  /** Share of spins where the ladder was already pinned at the maximum. */
  at_cap_pct: number;
  mean_multiplier: number;
  /** Points returned per 100 staked, ignoring free spins. */
  return_pct: number;
  mean_free_spins: number;
}

function client() {
  if (!supabase) throw new Error('The site is not connected to its database.');
  return supabase;
}

export async function fetchLadder(): Promise<LadderRung[]> {
  const { data, error } = await client().from('payout_ladder').select('*').order('lines');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ lines: r.lines, multiplier: Number(r.multiplier) }));
}

export async function fetchRules(): Promise<GameRules> {
  const { data, error } = await client().rpc('game_rules');
  if (error) throw new Error(error.message);
  return data as GameRules;
}

export async function saveLadderRung(lines: number, multiplier: number) {
  const { error } = await client().rpc('save_ladder_rung', {
    p_lines: lines, p_multiplier: multiplier,
  });
  if (error) throw new Error(error.message);
}

export async function saveRules(
  maxPaylines: number, maxMultiplier: number, capFinal: boolean,
): Promise<GameRules> {
  const { data, error } = await client().rpc('save_rules', {
    p_max_paylines: maxPaylines,
    p_max_multiplier: maxMultiplier,
    p_cap_final: capFinal,
  });
  if (error) throw new Error(error.message);
  return data as GameRules;
}

/** Runs real spins through the real engine on the server. Nothing is written. */
export async function simulateLines(spins = 500): Promise<LineSim> {
  const { data, error } = await client().rpc('simulate_lines', { p_spins: spins });
  if (error) throw new Error(error.message);
  return data as LineSim;
}
