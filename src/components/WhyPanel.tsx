import { useEffect, useState } from 'react';
import { explainGrid, type LineExplanation } from '../lib/api';

/** Opens on demand and asks the server to account for all 29 paylines. Winners
 *  first, then the near misses, so "why didn't that win?" answers itself. */
export function WhyPanel({ grid }: { grid: string[][] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LineExplanation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setRows(null); setError(null); setOpen(false); }, [grid]);

  async function load() {
    const next = !open;
    setOpen(next);
    if (!next || rows) return;
    try {
      setRows(await explainGrid(grid));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check that spin.');
    }
  }

  const sorted = rows
    ? [...rows].sort((a, b) => Number(b.won) - Number(a.won) || a.payline - b.payline)
    : [];

  return (
    <div className="why">
      <button className="linkish" onClick={load} aria-expanded={open}>
        {open ? 'Hide the line-by-line check' : 'Why did the lines win or lose?'}
      </button>

      {open && (
        error ? <p className="auth-error">{error}</p>
        : !rows ? <p className="hint">Checking all 29 paylines…</p>
        : (
          <div className="tw">
            <table className="whytable">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">What landed</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.payline} data-won={r.won ? 'true' : undefined}>
                    <td className="num">{r.payline}<span className="fam">{r.family}</span></td>
                    <td className="syms">{r.symbols}</td>
                    <td>
                      {r.won ? (
                        <>
                          <b className="wonlbl">Wins — {r.group}</b>
                          {r.wilds > 0 && (
                            <span className="reason">
                              {r.wild_names} stood in as {r.wilds === 1 ? 'a wild' : 'wilds'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="reason">{r.reason ?? 'No group matches these symbols.'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
