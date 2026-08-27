import { useCallback, useEffect, useState } from 'react';
import { Board } from './components/Board';
import { BetSelector } from './components/BetSelector';
import { Wallets } from './components/Wallets';
import { SignIn } from './components/SignIn';
import { Notice } from './components/Notice';
import { AdminPanel } from './components/AdminPanel';
import { localDrawGrid } from './game/placeholder';
import { supabase } from './lib/supabase';
import { useSession } from './lib/session';
import { fetchReadiness, type Readiness } from './lib/api';
import type { Bet, WinningLine } from './game/types';
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

/** The playable board. Still on a local draw until the spin call is wired up next. */
function Game({ onSignOut, email, isAdmin, onOpenAdmin }: {
  onSignOut: () => void; email: string; isAdmin: boolean; onOpenAdmin: () => void;
}) {
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
    const fromFree = Math.min(freePoints, bet);
    setFreePoints((f) => f - fromFree);
    setPoints((p) => p - (bet - fromFree));
    setGrid(localDrawGrid());
    setSpinToken((t) => t + 1);
    setSpinning(true);
  }, [spinning, bet, affordable, freePoints]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">bluePi Slot</span>
        </div>
        <Wallets freePoints={freePoints} points={points} />
        <div className="who">
          <span className="who-email">{email}</span>
          {isAdmin && <button className="linkish" onClick={onOpenAdmin}>Back office</button>}
          <button className="linkish" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="stage">
        <Board
          grid={grid} spinToken={spinToken} winningLines={lines}
          highlighted={null} onAllSettled={() => setSpinning(false)}
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
      </main>
    </div>
  );
}
