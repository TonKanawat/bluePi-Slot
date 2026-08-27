import { useRef, useState, type FormEvent } from 'react';
import {
  archiveSymbol, saveSymbol, symbolUrl, uploadSymbolImage,
  type SymbolRow,
} from '../../lib/admin';

interface Props {
  symbols: SymbolRow[];
  onChanged: () => void;
}

type Kind = 'normal' | 'wild' | 'scatter';

export function SymbolsTab({ symbols, onChanged }: Props) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState(100);
  const [kind, setKind] = useState<Kind>('normal');
  const [rounds, setRounds] = useState(5);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Choose an image first.'); return; }
    if (file.size > 300 * 1024) { setError('That image is over 300 KB.'); return; }

    setBusy(true);
    try {
      const path = await uploadSymbolImage(file);
      await saveSymbol({ name, image_path: path, weight, kind, scatter_free_spins: rounds });
      setName(''); setWeight(100); setKind('normal'); setRounds(5); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that symbol.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: SymbolRow) {
    setError(null);
    try {
      await archiveSymbol(s.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive that symbol.');
    }
  }

  const scatterCount = symbols.filter((s) => s.is_scatter).length;

  return (
    <div className="admin-pane">
      <form className="card form" onSubmit={add}>
        <h3>Add a symbol</h3>

        <label className="field">
          <span>Image — square PNG or WebP, under 300 KB</span>
          <input
            ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} required
          />
        </label>

        <div className="row2">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. Ake" required maxLength={40} />
          </label>
          <label className="field">
            <span>Reel weight</span>
            <input type="number" min={1} max={10000} value={weight}
                   onChange={(e) => setWeight(Number(e.target.value))} required />
          </label>
        </div>

        <label className="field">
          <span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="normal">Normal</option>
            <option value="wild">Wild — substitutes for any symbol</option>
            <option value="scatter">Scatter — grants free spins</option>
          </select>
        </label>

        {kind === 'scatter' && (
          <label className="field">
            <span>Free spins this scatter grants (max 5)</span>
            <input type="number" min={1} max={5} value={rounds}
                   onChange={(e) => setRounds(Number(e.target.value))} />
          </label>
        )}

        <p className="hint">
          {kind === 'scatter'
            ? 'Scatters drive almost the whole payout rate. A weight near 3, against 100 for a normal symbol, lands about 119% return.'
            : 'Weight is relative. Leave normal symbols at 100 and they all appear equally often.'}
        </p>

        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="spin" disabled={busy}>{busy ? 'Saving…' : 'Add symbol'}</button>
      </form>

      <div className="card">
        <h3>
          Symbols <span className="count">{symbols.length}</span>
          {symbols.length < 5 && <span className="warnpill">need at least 5</span>}
          {scatterCount === 0 && <span className="infopill">no scatter yet — free spins are off</span>}
        </h3>

        {symbols.length === 0 ? (
          <p className="empty">Nothing uploaded yet.</p>
        ) : (
          <div className="sym-grid">
            {symbols.map((s) => (
              <figure key={s.id} className="sym-card">
                <div className="sym-img">
                  <img src={symbolUrl(s.image_path)} alt={s.name} loading="lazy" />
                </div>
                <figcaption>
                  <b>{s.name}</b>
                  <span className="sym-meta">
                    weight {s.weight}
                    {s.is_wild && <em className="tag wild">wild</em>}
                    {s.is_scatter && <em className="tag scatter">scatter · {s.scatter_free_spins}</em>}
                  </span>
                </figcaption>
                <button className="linkish danger" onClick={() => remove(s)}>Archive</button>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
