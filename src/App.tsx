import { useCallback, useState } from 'react';
import { Board } from './components/Board';
import { BetSelector } from './components/BetSelector';
import { Wallets } from './components/Wallets';
import { localDrawGrid } from './game/placeholder';
import { isConnected } from './lib/supabase';
import type { Bet, WinningLine } from './game/types';
import './styles/app.css';

export default function App() {
  const [grid, setGrid] = useState<string[][]>(() => localDrawGrid());
  const [spinToken, setSpinToken] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [bet, setBet] = useState<Bet>(25);
  const [freePoints, setFreePoints] = useState(500);
  const [points, setPoints] = useState(0);
  const [lines] = useState<WinningLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const affordable = freePoints + points;

  const spin = useCallback(() => {
    if (spinning) return;
    if (bet > affordable) {
      setMessage("You don't have enough points for that bet.");
      return;
    }
    setMessage(null);

    // Free points are spent before the prize wallet.
    const fromFree = Math.min(freePoints, bet);
    setFreePoints((f) => f - fromFree);
    setPoints((p) => p - (bet - fromFree));

    setGrid(localDrawGrid());
    setSpinToken((t) => t + 1);
    setSpinning(true);
  }, [spinning, bet, affordable, freePoints]);

  const onSettled = useCallback(() => setSpinning(false), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">bluePi Slot</span>
        </div>
        <Wallets freePoints={freePoints} points={points} />
      </header>

      <main className="stage">
        <Board
          grid={grid}
          spinToken={spinToken}
          winningLines={lines}
          highlighted={null}
          onAllSettled={onSettled}
        />

        <div className="controls">
          <div className="control-row">
            <span className="control-label">Bet</span>
            <BetSelector value={bet} onChange={setBet} disabled={spinning} affordable={affordable} />
          </div>
          <button className="spin" onClick={spin} disabled={spinning}>
            {spinning ? 'Spinning…' : 'Spin'}
          </button>
        </div>

        {message && <p className="message" role="status">{message}</p>}

        {!isConnected() && (
          <p className="devnote">
            Running on placeholder symbols with a local draw. Spins become
            server-authoritative once <code>.env.local</code> is filled in and the spin
            endpoint lands.
          </p>
        )}
      </main>
    </div>
  );
}
