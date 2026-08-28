import { useState, type FormEvent } from 'react';
import {
  archiveCombination, BONUS_OPTIONS, saveCombination, symbolUrl,
  type CombinationRow, type SymbolRow,
} from '../../lib/admin';

interface Props {
  symbols: SymbolRow[];
  combinations: CombinationRow[];
  onChanged: () => void;
}

export function CombinationsTab({ symbols, combinations, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bonus, setBonus] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEditing(null); setName(''); setBonus(0); setPicked(new Set()); setError(null);
  }

  function load(c: CombinationRow) {
    setEditing(c.id);
    setName(c.name);
    setBonus(Number(c.bonus));
    setPicked(new Set(c.symbols.map((s) => s.id)));
    setError(null);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (picked.size === 0) { setError('Pick at least one symbol.'); return; }
    setBusy(true);
    try {
      await saveCombination(editing, name, bonus, [...picked]);
      reset();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that group.');
    } finally {
      setBusy(false);
    }
  }

  // The rule that governs how this group matches a line, shown live as you pick.
  const rule = picked.size >= 5
    ? 'Five or more members: the line needs five different symbols from this group.'
    : picked.size > 0
      ? 'One to four members: any of them, in any order, repeats allowed.'
      : null;

  return (
    <div className="admin-pane">
      <form className="card form" onSubmit={submit}>
        <h3>{editing ? 'Edit group' : 'New winning combination'}</h3>

        <div className="row2">
          <label className="field">
            <span>Group name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. PIG Team" required maxLength={60} />
          </label>
          <label className="field">
            <span>Special multiplier</span>
            <select value={bonus} onChange={(e) => setBonus(Number(e.target.value))}>
              {BONUS_OPTIONS.map((b) => (
                <option key={b} value={b}>{b === 0 ? 'None (ordinary group)' : `+${b}`}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span>
            Members <b className="count">{picked.size} of {symbols.length}</b>
            {symbols.length > 0 && (
              <span className="pickall">
                <button type="button" className="linkish"
                        onClick={() => setPicked(new Set(symbols.map((s) => s.id)))}>
                  Select all
                </button>
                <button type="button" className="linkish"
                        onClick={() => setPicked(new Set())}>
                  Clear
                </button>
              </span>
            )}
          </span>
          {symbols.length === 0 ? (
            <p className="empty">Upload some symbols first.</p>
          ) : (
            <div className="pick-grid">
              {symbols.map((s) => (
                <button
                  type="button" key={s.id} className="pick"
                  data-on={picked.has(s.id) ? 'true' : undefined}
                  onClick={() => toggle(s.id)}
                  aria-pressed={picked.has(s.id)}
                >
                  <img src={symbolUrl(s.image_path)} alt="" />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {rule && <p className="hint">{rule}</p>}
        {picked.size > 0 && picked.size < symbols.length && (
          <p className="hint">
            Not included: {symbols.filter((s) => !picked.has(s.id)).map((s) => s.name).join(', ')}.
            A line loses if even one of its five cells is a symbol this group leaves out.
          </p>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="form-actions">
          <button className="spin" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create group'}
          </button>
          {editing && <button type="button" className="linkish" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <h3>Winning combinations <span className="count">{combinations.length}</span></h3>
        {combinations.length === 0 ? (
          <p className="empty">None yet. The slot stays locked until there is at least one.</p>
        ) : (
          <ul className="combo-list">
            {combinations.map((c) => (
              <li key={c.id} className="combo">
                <div className="combo-head">
                  <b>{c.name}</b>
                  {Number(c.bonus) > 0 && <em className="tag bonus">+{c.bonus}</em>}
                  <em className="tag rule">{c.match_rule}</em>
                </div>
                <div className="combo-syms">
                  {c.symbols.map((s) => (
                    <img key={s.id} src={symbolUrl(s.image_path)} alt={s.name} title={s.name} />
                  ))}
                </div>
                <div className="combo-actions">
                  <button className="linkish" onClick={() => load(c)}>Edit</button>
                  <button className="linkish danger"
                          onClick={() => archiveCombination(c.id).then(onChanged)}>Archive</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
