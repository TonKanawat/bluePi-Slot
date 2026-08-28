import { useMemo } from 'react';
import { Reel } from './Reel';
import { PAYLINE_BY_ID } from '../game/paylines';
import type { SymbolRow } from '../lib/admin';
import type { WinningLine } from '../lib/api';

interface Props {
  /** [row][col] of symbol ids, exactly as the server drew it. */
  grid: string[][];
  byId: Map<string, SymbolRow>;
  pool: SymbolRow[];
  spinToken: number;
  winningLines: WinningLine[];
  highlighted: number | null;
  onAllSettled?: () => void;
}

export function Board({ grid, byId, pool, spinToken, winningLines, highlighted, onAllSettled }: Props) {
  const litByCol = useMemo(() => {
    const ids = highlighted !== null ? [highlighted] : winningLines.map((l) => l.payline);
    const cols: Set<number>[] = [0, 1, 2, 3, 4].map(() => new Set<number>());
    for (const id of ids) {
      for (const [row, col] of PAYLINE_BY_ID.get(id)?.cells ?? []) cols[col].add(row);
    }
    return cols;
  }, [winningLines, highlighted]);

  const anyLit = litByCol.some((s) => s.size > 0);

  const columns = useMemo(
    () => [0, 1, 2, 3, 4].map((col) => grid.map((row) => byId.get(row?.[col]))),
    [grid, byId],
  );

  return (
    <div className="board">
      <div className="board-inner">
        {columns.map((final, col) => (
          <Reel
            key={col}
            final={final}
            pool={pool}
            spinToken={spinToken}
            delayMs={col * 140}
            litRows={litByCol[col]}
            dimUnlit={anyLit}
            onSettled={col === 4 ? onAllSettled : undefined}
          />
        ))}
      </div>
    </div>
  );
}
