import type { GameSymbol } from './types';

/** Stand-in reel symbols so the board is playable before the admin uploads images.
 *  Once slot.symbol has rows with image_path, these are replaced by the real set. */
const SWATCHES = [
  ['#9FA1FF', 'PIG'], ['#B5BAFF', 'BENZ'], ['#AEE2FF', 'VIEW'], ['#D9F9DF', 'AKE'],
  ['#C4B5FD', 'BENCH'], ['#A5F3E0', 'GOT'], ['#FDE68A', 'HOPE'], ['#FBCFE8', 'PONG'],
  ['#BFDBFE', 'POM'], ['#FCD9B6', 'NON'],
] as const;

export const PLACEHOLDER_SYMBOLS: GameSymbol[] = [
  ...SWATCHES.map(([, name], i) => ({
    id: `ph-${i}`,
    name,
    imageUrl: null,
    isWild: false,
    isScatter: false,
    scatterFreeSpins: 0,
  })),
  { id: 'ph-wild', name: 'WILD', imageUrl: null, isWild: true, isScatter: false, scatterFreeSpins: 0 },
  { id: 'ph-scatter', name: 'SCAT', imageUrl: null, isWild: false, isScatter: true, scatterFreeSpins: 5 },
];

export const SWATCH_FOR: Record<string, string> = {
  ...Object.fromEntries(SWATCHES.map(([hex], i) => [`ph-${i}`, hex])),
  'ph-wild': '#4B4EC4',
  'ph-scatter': '#B23A2C',
};

export const SYMBOL_BY_ID = new Map(PLACEHOLDER_SYMBOLS.map((s) => [s.id, s]));

/** Local draw, used only until the server spin endpoint is wired up.
 *  The real grid always comes from slot.draw_grid() — never from the browser. */
export function localDrawGrid(): string[][] {
  const pool = PLACEHOLDER_SYMBOLS;
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => pool[Math.floor(Math.random() * pool.length)].id),
  );
}
