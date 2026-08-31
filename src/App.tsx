import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board';
import { BetSelector } from './components/BetSelector';
import { Wallets } from './components/Wallets';
import { SignIn } from './components/SignIn';
import { Notice } from './components/Notice';
import { WhyPanel } from './components/WhyPanel';
import { AdminPanel } from './components/AdminPanel';
import { supabase } from './lib/supabase';
import { useSession } from './lib/session';
import {
  fetchActiveSymbols, fetchFreeSpins, fetchReadiness, fetchWallet, play,
  NO_FREE_SPINS,
  type FreeSpins, type Readiness, type SpinResult, type Wallet,
} from './lib/api';
import type { SymbolRow } from './lib/admin';
import type { Bet } from './game/types';
import './styles/app.css';

export default function App() {
  const { loading, session, profile, rejected, claimError, signOut } = useSession();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!profile) return;
    fetchReadiness()
      .then(setReadiness)
      .catch((e: Error) => setReadinessError(e.message));
  }, [profile]);

  if (!supabase) {
    return (
      <Notice title="Not connected" tone="warn">
        <p>
          This deployment has no database configuration. Add{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in the
          hosting environment, then redeploy.
        </p>
      </Notice>
    );
  }

  if (loading) {
    return <Notice title="Loading…" />;
  }

  if (!session) {
    return <SignIn />;
  }

  // Signed in with Supabase, but the address was never registered for the game.
  if (rejected || !profile) {
    return (
      <Notice
        title="Registration failed"
        tone="warn"
        action={<button className="linkish" onClick={signOut}>Sign out</button>}
      >
        <p>This account cannot be used. Please contact your system admin.</p>
        {claimError && <p className="detail">Details: <code>{claimError}</code></p>}
      </Notice>
    );
  }

  if (readinessError) {
    return (
      <Notice title="Something went wrong" tone="warn"
        action={<button className="linkish" onClick={signOut}>Sign out</button>}>
        <p>{readinessError}</p>
      </Notice>
    );
  }

  const isAdmin = profile.role === 'system_admin' || profile.role === 'deputy_admin';

  // An admin who opens the back office, or who has no choice because the game is
  // not configured yet. Everyone else just gets told to wait.
  if (isAdmin && (showAdmin || (readiness && !readiness.ready))) {
    return (
      <AdminPanel
        email={profile.email}
        onSignOut={signOut}
        onReadinessChange={setReadiness}
        onPlay={() => setShowAdmin(false)}
      />
    );
  }

  if (readiness && !readiness.ready) {
    return (
      <Notice
        title="The slot isn't ready yet"
        action={<button className="linkish" onClick={signOut}>Sign out</button>}
      >
        <p>An admin still needs to finish setting up the game:</p>
        <ul className="missing">
          {readiness.missing.map((m) => <li key={m}>{m}</li>)}
        </ul>
      </Notice>
    );
  }

  return (
    <Game
      onSignOut={signOut}
      email={profile.email}
      isAdmin={isAdmin}
      onOpenAdmin={() => setShowAdmin(true)}
    />
  );
}

/** The playable board. Every spin is decided by the server: the grid, the win and
 *  the wallet all come back from one call, and the browser only animates them. */
function Game({ onSignOut, email, isAdmin, onOpenAdmin }: {
  onSignOut: () => void; email: string; isAdmin: boolean; onOpenAdmin: () => void;
}) {
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [grid, setGrid] = useState<string[][]>([]);
  const [spinToken, setSpinToken] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [bet, setBet] = useState<Bet>(25);
  const [wallet, setWallet] = useState<Wallet>({ free_points: 0, points: 0 });
  const [result, setResult] = useState<SpinResult | null>(null);
  // Server-held, so it survives a refresh. Never derived from the last spin alone.
  const [freeSpins, setFreeSpins] = useState<FreeSpins>(NO_FREE_SPINS);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const byId = useMemo(() => new Map(symbols.map((s) => [s.id, s])), [symbols]);
  const affordable = wallet.free_points + wallet.points;
  const freeSpinsLeft = freeSpins.remaining;

  // Load the real symbols and the real balance before anything is shown.
  useEffect(() => {
    let alive = true;
    Promise.all([fetchActiveSymbols(), fetchWallet(), fetchFreeSpins()])
      .then(([syms, w, fs]) => {
        if (!alive) return;
        setSymbols(syms);
        setWallet(w);
        setFreeSpins(fs);
        // A resting board, drawn from the real symbol set, before the first spin.
        setGrid(Array.from({ length: 5 }, () =>
          Array.from({ length: 5 }, () => syms[Math.floor(Math.random() * syms.length)]?.id ?? '')));
        setLoading(false);
      })
      .catch((e: Error) => { if (alive) { setMessage(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const spin = useCallback(async () => {
    if (spinning) return;
    if (freeSpinsLeft === 0 && bet > affordable) {
      setMessage("You don't have enough points for that bet.");
      return;
    }
    setMessage(null);
    setSpinning(true);
    try {
      const r = await play(bet);
      setResult(r);
      setGrid(r.grid);
      setWallet({ free_points: r.free_points, points: r.points });
      setFreeSpins((prev) => ({
        remaining:     r.free_spins_left,
        round:         r.free_spin_round,
        rounds_max:    prev.rounds_max,
        stake:         r.free_spins_left > 0 ? r.bet : null,
        ban_bets_left: r.ban_bets_left,
      }));
      setSpinToken((t) => t + 1);
    } catch (err) {
      setSpinning(false);
      setMessage(err instanceof Error ? err.message : 'That spin could not be played.');
    }
  }, [spinning, bet, affordable, freeSpinsLeft]);

  if (loading) return <Notice title="Loading…" />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">bluePi Slot</span>
        </div>
        <Wallets freePoints={wallet.free_points} points={wallet.points} />
        <div className="who">
          <span className="who-email">{email}</span>
          {isAdmin && <button className="linkish" onClick={onOpenAdmin}>Back office</button>}
          <button className="linkish" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="stage">
        <Board
          grid={grid} byId={byId} pool={symbols} spinToken={spinToken}
          winningLines={result?.lines ?? []} highlighted={null}
          onAllSettled={() => setSpinning(false)}
        />

        {/* Read from the server, not from the last spin, so refreshing the page or
            coming back to the tab cannot appear to swallow the chain. */}
        {freeSpinsLeft > 0 && (
          <p className="freespins standalone" role="status">
            <b>{freeSpinsLeft} free {freeSpinsLeft === 1 ? 'spin' : 'spins'} left</b>
            {' · '}round {freeSpins.round} of {freeSpins.rounds_max}
            {freeSpins.stake !== null && <>{' · '}playing at {freeSpins.stake} points</>}
          </p>
        )}

        {result && !spinning && (
          <div className="outcome" data-win={result.payout > 0 ? 'true' : undefined}>
            {result.line_count > 0 ? (
              <p>
                <b>{result.line_count} winning {result.line_count === 1 ? 'line' : 'lines'}</b>
                {' · '}×{result.multiplier}
                {' · '}<b>+{result.payout.toLocaleString()} points</b>
                {result.was_free_spin && <span className="tag rule">free spin</span>}
              </p>
            ) : (
              <p>No winning lines this time.{result.was_free_spin && <span className="tag rule">free spin</span>}</p>
            )}
            <WhyPanel grid={result.grid} />
            {result.yellow_card && (
              <p className="yellow">
                Yellow card — no more free spins for {result.ban_bets_left} more bets.
              </p>
            )}
          </div>
        )}

        <div className="controls">
          <div className="control-row">
            <span className="control-label">Bet</span>
            <BetSelector value={bet} onChange={setBet}
                         disabled={spinning || freeSpinsLeft > 0} affordable={affordable} />
          </div>
          <button className="spin" onClick={spin} disabled={spinning}>
            {spinning ? 'Spinning…' : freeSpinsLeft > 0 ? `Free spin (${freeSpinsLeft})` : 'Spin'}
          </button>
        </div>

        {message && <p className="message" role="status">{message}</p>}
      </main>
    </div>
  );
}
