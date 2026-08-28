import { useMemo, useState } from 'react';
import { symbolUrl, type SymbolRow } from '../../lib/admin';

export type SortKey = 'name-asc' | 'name-desc' | 'weight-desc' | 'weight-asc' | 'newest';
export type Category = 'all' | 'normal' | 'wild' | 'scatter';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name-asc',    label: 'Name A → Z' },
  { key: 'name-desc',   label: 'Name Z → A' },
  { key: 'weight-desc', label: 'Most common first' },
  { key: 'weight-asc',  label: 'Rarest first' },
  { key: 'newest',      label: 'Recently added' },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'normal',  label: 'Normal' },
  { key: 'wild',    label: 'Wild' },
  { key: 'scatter', label: 'Scatter' },
];

export function categoryOf(s: SymbolRow): Exclude<Category, 'all'> {
  return s.is_wild ? 'wild' : s.is_scatter ? 'scatter' : 'normal';
}

function sortBy(rows: SymbolRow[], key: SortKey): SymbolRow[] {
  const out = [...rows];
  switch (key) {
    case 'name-asc':    return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':   return out.sort((a, b) => b.name.localeCompare(a.name));
    case 'weight-desc': return out.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
    case 'weight-asc':  return out.sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name));
    case 'newest':      return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

interface CardProps {
  symbol: SymbolRow;
  editingId: string | null;
  /** True when this symbol is in no active winning combination. */
  orphan: boolean;
  onEdit: (s: SymbolRow) => void;
  onArchive: (s: SymbolRow) => void;
}

function SymbolCard({ symbol: s, editingId, orphan, onEdit, onArchive }: CardProps) {
  return (
    <figure className="sym-card" data-editing={editingId === s.id ? 'true' : undefined}>
      <div className="sym-img">
        <img src={symbolUrl(s.image_path)} alt={s.name} loading="lazy" />
      </div>
      <figcaption>
        <b>{s.name}</b>
        <span className="sym-meta">
          weight {s.weight}
          {s.is_wild && <em className="tag wild">wild</em>}
          {s.is_scatter && <em className="tag scatter">scatter · {s.scatter_free_spins}</em>}
          {orphan && (
            <em className="tag orphan" title="Any payline containing this symbol loses, because no winning combination includes it.">
              in no group
            </em>
          )}
        </span>
      </figcaption>
      <div className="sym-actions">
        <button className="linkish" onClick={() => onEdit(s)}>Edit</button>
        <button className="linkish danger" onClick={() => onArchive(s)}>Archive</button>
      </div>
    </figure>
  );
}

interface Props {
  symbols: SymbolRow[];
  editingId: string | null;
  /** Ids of symbols that belong to no active winning combination. */
  ungrouped: Set<string>;
  onEdit: (s: SymbolRow) => void;
  onArchive: (s: SymbolRow) => void;
}

const SECTION_NOTE: Record<Exclude<Category, 'all'>, string> = {
  normal:  'Ordinary reel symbols. These are what winning combinations are built from.',
  wild:    'Substitutes for any symbol a line needs. Two per line at most, one on the Corner payline.',
  scatter: 'Grant free spins wherever they land. Their weight sets almost the whole payout rate.',
};

export function SymbolList({ symbols, editingId, ungrouped, onEdit, onArchive }: Props) {
  const [sort, setSort] = useState<SortKey>('name-asc');
  const [category, setCategory] = useState<Category>('all');

  const counts = useMemo(() => {
    const c = { all: symbols.length, normal: 0, wild: 0, scatter: 0 };
    for (const s of symbols) c[categoryOf(s)] += 1;
    return c;
  }, [symbols]);

  const sorted = useMemo(() => sortBy(symbols, sort), [symbols, sort]);
  const filtered = useMemo(
    () => (category === 'all' ? sorted : sorted.filter((s) => categoryOf(s) === category)),
    [sorted, category],
  );

  const sections: Exclude<Category, 'all'>[] =
    category === 'all' ? ['normal', 'wild', 'scatter'] : [category];

  return (
    <div className="card">
      <h3>
        Symbols <span className="count">{symbols.length}</span>
        {symbols.length < 5 && <span className="warnpill">need at least 5</span>}
        {counts.scatter === 0 && <span className="infopill">no scatter yet — free spins are off</span>}
        {ungrouped.size > 0 && (
          <span className="warnpill">{ungrouped.size} in no group</span>
        )}
      </h3>

      {ungrouped.size > 0 && (
        <p className="notice-line" role="status">
          <b>{[...ungrouped].length} symbol{ungrouped.size === 1 ? '' : 's'} belong to no winning
          combination.</b> A payline only pays when <em>every</em> cell on it is a member of one
          group, so any line these land on loses, however good it looks. Add them to a group on the
          Winning combinations tab.
        </p>
      )}

      <div className="listbar">
        <div className="chips" role="group" aria-label="Filter by type">
          {CATEGORIES.map((c) => (
            <button
              key={c.key} type="button" className="chip"
              data-on={category === c.key ? 'true' : undefined}
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label} <span className="count">{counts[c.key]}</span>
            </button>
          ))}
        </div>

        <label className="sortby">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {symbols.length === 0 ? (
        <p className="empty">Nothing uploaded yet.</p>
      ) : filtered.length === 0 ? (
        <p className="empty">No {category} symbols yet.</p>
      ) : (
        sections.map((sec) => {
          const rows = filtered.filter((s) => categoryOf(s) === sec);
          if (rows.length === 0) return null;
          return (
            <section className="sym-section" key={sec} data-kind={sec}>
              <h4>
                <span className="sec-name">{sec}</span>
                <span className="count">{rows.length}</span>
                <span className="sec-note">{SECTION_NOTE[sec]}</span>
              </h4>
              <div className="sym-grid">
                {rows.map((s) => (
                  <SymbolCard key={s.id} symbol={s} editingId={editingId}
                              orphan={ungrouped.has(s.id)}
                              onEdit={onEdit} onArchive={onArchive} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
