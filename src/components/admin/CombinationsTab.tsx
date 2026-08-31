import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  archiveCombination, BONUS_OPTIONS, saveCombination, symbolUrl,
  type CombinationRow, type SymbolRow,
} from '../../lib/admin';

interface Props {
  symbols: SymbolRow[];
  combinations: CombinationRow[];
  onChanged: () => void;
}

const PER_PAGE = 10;

/** Order-independent identity of a group's membership, so two groups holding the
 *  same symbols in a different order still compare equal. */
function memberKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

export function CombinationsTab({ symbols, combinations, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bonus, setBonus] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [page, setPage] = useState(1);

  function reset() {
    setEditing(null); setName(''); setBonus(0); setPicked(new Set());
    setQuery(''); setError(null); setOverride(false);
  }

  function load(c: CombinationRow) {
    setEditing(c.id);
    setName(c.name);
    setBonus(Number(c.bonus));
    setPicked(new Set(c.symbols.map((s) => s.id)));
    setQuery(''); setError(null); setOverride(false);
  }

  function toggle(id: string) {
    setOverride(false);
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ---------------------------------------------------------------- duplicates
  // Two groups with identical membership are not an error the database can catch:
  // the second one is simply dead weight, because a line matching both pays once at
  // the better bonus. Worth naming before it is saved rather than after.
  const duplicateOf = useMemo(() => {
    if (picked.size === 0) return null;
    const key = memberKey([...picked]);
    return combinations.find(
      (c) => c.id !== editing && c.is_active && memberKey(c.symbols.map((s) => s.id)) === key,
    ) ?? null;
  }, [picked, combinations, editing]);

  const nameClashOf = useMemo(() => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return combinations.find((c) => c.id !== editing && c.name.toLowerCase() === n) ?? null;
  }, [name, combinations, editing]);

  const blocked = (duplicateOf !== null || nameClashOf !== null) && !override;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (picked.size === 0) { setError('Pick at least one symbol.'); return; }
    if (blocked) { setOverride(true); return; }   // first click acknowledges the warning
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

  // ---------------------------------------------------------------- picker
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? symbols.filter((s) => s.name.toLowerCase().includes(q)) : symbols;
  }, [symbols, query]);

  // Picked symbols the search has hidden — otherwise a filtered view looks as if
  // members had been dropped.
  const hiddenPicked = symbols.filter((s) => picked.has(s.id) && !shown.includes(s));

  const rule = picked.size >= 5
    ? 'Five or more members: the line needs five different symbols from this group.'
    : picked.size > 0
      ? 'One to four members: any of them, in any order, repeats allowed.'
      : null;

  // ---------------------------------------------------------------- list paging
  const pages = Math.max(1, Math.ceil(combinations.length / PER_PAGE));
  useEffect(() => { if (page > pages) setPage(pages); }, [pages, page]);
  const slice = combinations.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="admin-pane">
      <form className="card form" onSubmit={submit}>
        <h3>{editing ? 'Edit group' : 'New winning combination'}</h3>

        <div className="row2">
          <label className="field">
            <span>Group name</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setOverride(false); }}
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
                        onClick={() => setPicked((p) => {
                          const next = new Set(p);
                          shown.forEach((s) => next.add(s.id));
                          return next;
                        })}>
                  {query ? `Select these ${shown.length}` : 'Select all'}
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
            <>
              <input
                className="picksearch" type="search" value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${symbols.length} symbols by name…`}
                aria-label="Search symbols by name"
              />
              {query && (
                <p className="hint">
                  {shown.length === 0
                    ? `No symbol matches “${query}”.`
                    : `${shown.length} of ${symbols.length} shown.`}
                  {hiddenPicked.length > 0 &&
                    ` ${hiddenPicked.length} selected ${hiddenPicked.length === 1 ? 'symbol is' : 'symbols are'} hidden by the search.`}
                </p>
              )}
              <div className="pick-grid">
                {shown.map((s) => (
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
            </>
          )}
        </div>

        {rule && <p className="hint">{rule}</p>}
        {picked.size > 0 && picked.size < symbols.length && (
          <p className="hint">
            Not included: {symbols.filter((s) => !picked.has(s.id)).map((s) => s.name).join(', ')}.
            A line loses if even one of its five cells is a symbol this group leaves out.
          </p>
        )}

        {duplicateOf && (
          <p className="notice-line" role="status">
            <b>“{duplicateOf.name}” already holds exactly these {picked.size} symbols.</b>{' '}
            A line matching both pays once, at the better multiplier, so a second copy
            changes nothing unless its multiplier is higher
            {Number(duplicateOf.bonus) > 0
              ? ` (that group is +${duplicateOf.bonus}).`
              : ' (that group has no multiplier).'}
          </p>
        )}
        {nameClashOf && (
          <p className="notice-line" role="status">
            <b>“{nameClashOf.name}” already exists.</b> Group names must be unique, so
            saving under this name will be refused by the database.
          </p>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="form-actions">
          <button className="spin" disabled={busy}>
            {busy ? 'Saving…'
              : blocked ? 'Review the warning above'
              : override ? 'Save anyway'
              : editing ? 'Save changes' : 'Create group'}
          </button>
          {editing && <button type="button" className="linkish" onClick={reset}>Cancel</button>}
        </div>
      </form>

      <div className="card">
        <h3>
          Winning combinations <span className="count">{combinations.length}</span>
          {pages > 1 && <span className="infopill">page {page} of {pages}</span>}
        </h3>
        {combinations.length === 0 ? (
          <p className="empty">None yet. The slot stays locked until there is at least one.</p>
        ) : (
          <>
            <ul className="combo-list">
              {slice.map((c) => (
                <li key={c.id} className="combo">
                  <div className="combo-head">
                    <b>{c.name}</b>
                    {Number(c.bonus) > 0 && <em className="tag bonus">+{c.bonus}</em>}
                    <em className="tag rule">{c.match_rule}</em>
                    <span className="count">{c.symbols.length}</span>
                  </div>
                  <div className="combo-syms">
                    {c.symbols.map((s) => (
                      <figure className="combo-sym" key={s.id}>
                        <img src={symbolUrl(s.image_path)} alt="" />
                        <figcaption>{s.name}</figcaption>
                      </figure>
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

            {pages > 1 && (
              <nav className="pager" aria-label="Winning combination pages">
                <button className="linkish" disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}>← Previous</button>
                <span className="pager-now">
                  {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, combinations.length)}
                  {' of '}{combinations.length}
                </span>
                <button className="linkish" disabled={page === pages}
                        onClick={() => setPage((p) => p + 1)}>Next →</button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
