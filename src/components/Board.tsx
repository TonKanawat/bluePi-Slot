import { useMemo } from 'react';
import { Reel } from './Reel';
import { PAYLINE_BY_ID } from '../game/paylines';
import type { WinningLine } from '../game/types';

interface Props {
  grid: string[][];              // [row][col]
  spinToken: number;
  winningLines: WinningLine[];
  highlighted: number | null;    // payline id being previewed, or null for all
  onAllSettled?: () => void;
}

export function Board({ grid, spinToken, winningLines, highlighted, onAllSettled }: Props) {
  // Which cells are lit, grouped by column so each Reel gets only its own rows.
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
    () => [0, 1, 2, 3, 4].map((col) => grid.map((row) => row[col])),
    [grid],
  );

  return (
    <div className="board">
      <div className="board-inner">
        {columns.map((final, col) => (
          <Reel
            key={col}
            final={final}
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
