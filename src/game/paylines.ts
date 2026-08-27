import type { Payline } from './types';

/** The 29 paylines, recovered from the requirements doc's cell highlighting.
 *  Mirrors slot.payline in 0002_seed_paylines.sql — change both together. */
export const PAYLINES: readonly Payline[] = [
  { id:  1, family: 'straight', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id:  2, family: 'straight', cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
  { id:  3, family: 'straight', cells: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]] },
  { id:  4, family: 'straight', cells: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]] },
  { id:  5, family: 'straight', cells: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]] },
  { id:  6, family: 'diagonal', cells: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]] },
  { id:  7, family: 'diagonal', cells: [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]] },
  { id:  8, family: 'corner', cells: [[0, 0], [0, 4], [4, 0], [4, 4]] },
  { id:  9, family: 'zigzag', cells: [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]] },
  { id: 10, family: 'zigzag', cells: [[1, 0], [2, 1], [1, 2], [2, 3], [1, 4]] },
  { id: 11, family: 'zigzag', cells: [[2, 0], [3, 1], [2, 2], [3, 3], [2, 4]] },
  { id: 12, family: 'zigzag', cells: [[3, 0], [4, 1], [3, 2], [4, 3], [3, 4]] },
  { id: 13, family: 'zigzag', cells: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]] },
  { id: 14, family: 'zigzag', cells: [[0, 1], [1, 2], [2, 1], [3, 2], [4, 1]] },
  { id: 15, family: 'zigzag', cells: [[0, 2], [1, 3], [2, 2], [3, 3], [4, 2]] },
  { id: 16, family: 'zigzag', cells: [[0, 3], [1, 4], [2, 3], [3, 4], [4, 3]] },
  { id: 17, family: 'hill', cells: [[4, 0], [4, 1], [3, 2], [4, 3], [4, 4]] },
  { id: 18, family: 'hill', cells: [[3, 0], [3, 1], [2, 2], [3, 3], [3, 4]] },
  { id: 19, family: 'hill', cells: [[2, 0], [2, 1], [1, 2], [2, 3], [2, 4]] },
  { id: 20, family: 'hill', cells: [[1, 0], [1, 1], [0, 2], [1, 3], [1, 4]] },
  { id: 21, family: 'hill', cells: [[4, 0], [3, 1], [3, 2], [3, 3], [4, 4]] },
  { id: 22, family: 'hill', cells: [[3, 0], [2, 1], [2, 2], [2, 3], [3, 4]] },
  { id: 23, family: 'hill', cells: [[2, 0], [1, 1], [1, 2], [1, 3], [2, 4]] },
  { id: 24, family: 'hill', cells: [[1, 0], [0, 1], [0, 2], [0, 3], [1, 4]] },
  { id: 25, family: 'vertical', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: 26, family: 'vertical', cells: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]] },
  { id: 27, family: 'vertical', cells: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]] },
  { id: 28, family: 'vertical', cells: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]] },
  { id: 29, family: 'vertical', cells: [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]] },
] as const;

export const PAYLINE_BY_ID = new Map(PAYLINES.map((p) => [p.id, p]));
