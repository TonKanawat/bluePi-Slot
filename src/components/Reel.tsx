import { useEffect, useState } from 'react';
import { SymbolTile } from './Symbol';
import { PLACEHOLDER_SYMBOLS } from '../game/placeholder';

const BLUR_LENGTH = 16; // filler symbols that whip past before the reel settles

interface Props {
  /** The five symbols this reel lands on, top to bottom. */
  final: string[];
  /** Increments once per spin. Changing it starts this reel rolling. */
  spinToken: number;
  /** Reels settle left to right; this is the extra wait for this one. */
  delayMs: number;
  onSettled?: () => void;
  /** Rows (0-4) on this reel that are part of a winning line. */
  litRows: Set<number>;
  dimUnlit: boolean;
}

function randomFiller() {
  return Array.from(
    { length: BLUR_LENGTH },
    () => PLACEHOLDER_SYMBOLS[Math.floor(Math.random() * PLACEHOLDER_SYMBOLS.length)].id,
  );
}

export function Reel({ final, spinToken, delayMs, onSettled, litRows, dimUnlit }: Props) {
  const [strip, setStrip] = useState<string[]>(final);
  const [shiftPct, setShiftPct] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (spinToken === 0) return;

    // 1. Stack filler above the final symbols and jump to the top with no transition.
    const next = [...randomFiller(), ...final];
    setStrip(next);
    setDuration(0);
    setShiftPct(0);
    setRolling(true);

    // 2. After the browser has painted that reset, travel down to the last five.
    const travel = ((next.length - 5) / next.length) * 100;
    const spinMs = 620 + delayMs;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setDuration(spinMs);
        setShiftPct(-travel);
      }),
    );

    // 3. Collapse back to just the five landed symbols so the DOM stays small.
    const done = window.setTimeout(() => {
      setDuration(0);
      setStrip(final);
      setShiftPct(0);
      setRolling(false);
      onSettled?.();
    }, spinMs + 40);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
    // onSettled is intentionally excluded: it changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken, delayMs, final]);

  return (
    <div className="reel">
      <div
        className="reel-strip"
        style={{
          transform: `translate3d(0, ${shiftPct}%, 0)`,
          transitionDuration: `${duration}ms`,
        }}
      >
        {strip.map((id, i) => {
          const visibleRow = i - (strip.length - 5);
          const lit = !rolling && visibleRow >= 0 && litRows.has(visibleRow);
          return (
            <div className="reel-cell" key={`${i}-${id}`} data-lit={lit ? 'true' : undefined}>
              <SymbolTile id={id} dim={dimUnlit && !lit && !rolling} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
