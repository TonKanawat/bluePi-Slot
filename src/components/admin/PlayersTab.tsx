import { Fragment, useState, type FormEvent } from 'react';
import {
  adjustPoints, registerPlayer, setRole,
  type PlayerRow,
} from '../../lib/admin';

interface Props {
  players: PlayerRow[];
  onChanged: () => void;
}

const ROLES: PlayerRow['role'][] = ['player', 'line_manager', 'deputy_admin'];

export function PlayersTab({ players, onChanged }: Props) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which wallet is open for editing, and the pending amounts.
  const [editing, setEditing] = useState<string | null>(null);
  const [freeDelta, setFreeDelta] = useState(0);
  const [pointsDelta, setPointsDelta] = useState(0);
  const [note, setNote] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerPlayer(email.trim().toLowerCase(), displayName.trim());
      setEmail(''); setDisplayName('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register that address.');
    } finally {
      setBusy(false);
    }
  }

  function openWallet(p: PlayerRow) {
    setEditing(p.id); setFreeDelta(0); setPointsDelta(0); setNote(''); setError(null);
  }

  async function applyAdjustment(p: PlayerRow) {
    if (freeDelta === 0 && pointsDelta === 0) { setEditing(null); return; }
    setError(null);
    setBusy(true);
    try {
      await adjustPoints(p.id, freeDelta, pointsDelta, note);
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply that change.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(p: PlayerRow, role: PlayerRow['role']) {
    setError(null);
    try {
      await setRole(p.id, role);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that role.');
    }
  }

  return (
    <div className="admin-pane">
      <form className="card form" onSubmit={add}>
        <h3>Register an address</h3>
        <p className="hint">
          Nobody can sign in until their address is registered here. They then set
          their own password the first time they log in.
        </p>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} required placeholder="someone@bluepi.co.th"
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Display name (optional)</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="spin" disabled={busy}>{busy ? 'Saving…' : 'Register'}</button>
      </form>

      <div className="card">
        <h3>People <span className="count">{players.length}</span></h3>
        {players.length === 0 ? (
          <p className="empty">Nobody registered yet.</p>
        ) : (
          <div className="tw">
            <table className="ptable">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="num">Free points</th>
                  <th scope="col" className="num">Wallet</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <Fragment key={p.id}>
                    <tr data-open={editing === p.id ? 'true' : undefined}>
                      <td>
                        <b>{p.display_name || p.email.split('@')[0]}</b>
                        <span className="pemail">{p.email}</span>
                        {!p.first_login_at && <em className="tag rule">never signed in</em>}
                      </td>
                      <td>
                        {p.role === 'system_admin' ? (
                          <em className="tag wild">master admin</em>
                        ) : (
                          <select className="rolesel" value={p.role}
                                  onChange={(e) => changeRole(p, e.target.value as PlayerRow['role'])}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r.replace('_', ' ')}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="num">{p.free_points.toLocaleString()}</td>
                      <td className="num">{p.points.toLocaleString()}</td>
                      <td>
                        <button className="linkish" onClick={() => openWallet(p)}>
                          {editing === p.id ? 'Close' : 'Edit points'}
                        </button>
                      </td>
                    </tr>

                    {editing === p.id && (
                      <tr className="adjrow">
                        <td colSpan={5}>
                          <div className="adjust">
                            <label className="field">
                              <span>Free points ±</span>
                              <input type="number" value={freeDelta}
                                     onChange={(e) => setFreeDelta(Number(e.target.value))} />
                            </label>
                            <label className="field">
                              <span>Wallet ±</span>
                              <input type="number" value={pointsDelta}
                                     onChange={(e) => setPointsDelta(Number(e.target.value))} />
                            </label>
                            <label className="field grow">
                              <span>Reason (shown in the play dashboard)</span>
                              <input value={note} maxLength={120}
                                     onChange={(e) => setNote(e.target.value)}
                                     placeholder="e.g. prize correction" />
                            </label>
                            <button className="spin small" disabled={busy}
                                    onClick={() => applyAdjustment(p)}>
                              {busy ? 'Applying…' : 'Apply'}
                            </button>
                          </div>
                          <p className="hint">
                            Enter a change, not a total: <span className="m">+200</span> adds,
                            {' '}<span className="m">-50</span> removes. Becomes{' '}
                            <b>{(p.free_points + freeDelta).toLocaleString()}</b> free and{' '}
                            <b>{(p.points + pointsDelta).toLocaleString()}</b> wallet.
                            Every edit is logged against your name.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
