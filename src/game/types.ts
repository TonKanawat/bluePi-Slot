/** Shapes shared with the Postgres engine. Keep in step with the migrations. */

export type Cell = readonly [row: number, col: number];

export interface Payline {
  id: number;
  family: 'straight' | 'diagonal' | 'corner' | 'zigzag' | 'hill' | 'vertical';
  cells: readonly Cell[];
}

export interface GameSymbol {
  id: string;
  name: string;
  imageUrl: string | null;
  isWild: boolean;
  isScatter: boolean;
  scatterFreeSpins: number;
}

/** One winning line, as returned by slot.evaluate_grid(). */
export interface WinningLine {
  payline: number;
  family: Payline['family'];
  combination: string;
  bonus: number;
}

/** The full result of one spin. Mirrors the jsonb from slot.evaluate_grid(). */
export interface SpinResult {
  grid: string[][];          // 5x5 of symbol ids, row-major
  lines: WinningLine[];
  lineCount: number;
  normalLines: number;
  bonusSum: number;
  base: number;
  multiplier: number;
  freeSpins: number;
  payout: number;
}

export const BET_OPTIONS = [25, 50, 75, 100, 125, 150] as const;
export type Bet = (typeof BET_OPTIONS)[number];
