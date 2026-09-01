import { useCallback, useEffect, useState } from 'react';
import {
  fetchLadder, fetchRules, saveLadderRung, saveRules, simulateLines,
  type GameRules, type LadderRung, type LineSim,
} from '../../lib/rules';

export function RulesTab({ onChanged }: { onChanged?: () => void }) {
  const [ladder, setLadder] = useState<LadderRung[]>([]);
  const [rules, setRules] = useState<GameRules | null>(null);
  const [maxLines, setMaxLines] = useState(20);
  const [ceiling, setCeiling] = useState(6);
  const [capOn, setCapOn] = useState(true);
  const [sim, setSim] = useState<LineSim | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, r] = await Promise.all([fetchLadder(), fetchRules()]);
      setLadder(l);
      setRules(r);
      setMaxLines(r.max_paylines);
      setCeiling(r.max_multiplier);
      setCapOn(r.cap_final);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the payout rules.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function commitRung(lines: number, multiplier: number) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await saveLadderRung(lines, multiplier);
      await load(); onChanged?.();
      setNotice(`${lines} line${lines === 1 ? '' : 's'} now pays ×${multiplier}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that rung.');
      await load();
    } finally { setBusy(false); }
  }

  async function commitRules() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await saveRules(maxLines, ceiling, capOn);
      setRules(r);
      setNotice('Rules saved. They apply from the next spin.');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the rules.');
    } finally { setBusy(false); }
  }

  async function run() {
    setRunning(true); setError(null);
    try {
      setSim(await simulateLines(500));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the simulation.');
    } finally { setRunning(false); }
  }

  const top = ladder.length ? ladder[ladder.length - 1].lines : 0;
  const missingRung = maxLines > top;
  const ceilingBites = capOn && rules !== null
    && ladder.some((r) => r.lines <= maxLines && r.multiplier >= ceiling);

  const peak = sim ? Math.max(...sim.distribution.map((d) => d.pct)) : 1;

  return (
    <div className="admin-pane">
      <div className="card form">
        <h3>Round limits</h3>
        <p className="hint">
          The maximum caps the <b>ladder</b>, not the win. Every winning line is still
          found and every special multiplier still adds on top — the base multiplier
          simply stops climbing past this many ordinary lines.
        </p>

        <div className="row2">
          <label className="field">
            <span>Maximum paylines per round</span>
            <input type="number" min={1} max={29} value={maxLines}
                   onChange={(e) => setMaxLines(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Ceiling on the finished multiplier</span>
            <input type="number" min={1} max={99} step={0.25} value={ceiling}
                   disabled={!capOn}
                   onChange={(e) => setCeiling(Number(e.target.value))} />
          </label>
        </div>

        <label className="checkline">
          <input type="checkbox" checked={capOn} onChange={(e) => setCapOn(e.target.checked)} />
          <span>Hold the finished multiplier at the ceiling</span>
        </label>

        {missingRung && (
          <p className="notice-line" role="status">
            <b>The ladder stops at {top} lines.</b> With a maximum of {maxLines}, spins
            between {top + 1} and {maxLines} lines fall back to rung {top}. Add the
            missing rungs below if you want them to pay more.
          </p>
        )}
        {ceilingBites && (
          <p className="hint">
            Note: a rung at or above ×{ceiling} already exists, so the ceiling is doing
            the deciding for large wins. Raise it if you want the top rungs to be felt.
          </p>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}

        <div className="form-actions">
          <button className="spin" disabled={busy} onClick={commitRules}>
            {busy ? 'Saving…' : 'Save round limits'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>
          How many lines does a spin win?
          <span className="count">{sim ? `${sim.spins} spins` : 'not run yet'}</span>
        </h3>
        <p className="hint">
          Real spins through the real engine, using the symbols, weights and groups
          configured right now. Nothing is staked and nothing is recorded — this is the
          evidence for choosing the maximum above.
        </p>

        <div className="form-actions">
          <button className="spin small" disabled={running} onClick={run}>
            {running ? 'Simulating…' : sim ? 'Run again' : 'Run simulation'}
          </button>
        </div>

        {sim && (
          <>
            <div className="simstats">
              <Stat label="Most likely" value={`${sim.most_likely} lines`}
                    note={`${sim.most_likely_pct}% of spins`} />
              <Stat label="Median" value={`${sim.median_lines} lines`}
                    note="half of spins win fewer" />
              <Stat label="95th percentile" value={`${sim.p95_lines} lines`}
                    note="only 5% win more" />
              <Stat label="At the maximum" value={`${sim.at_cap_pct}%`}
                    note={`spins already pinned at ${sim.max_paylines}`} />
              <Stat label="Average multiplier" value={`×${sim.mean_multiplier}`}
                    note={`${sim.return_pct}% returned per point staked`} />
              <Stat label="Free spins" value={sim.mean_free_spins.toFixed(2)}
                    note="awarded per spin on average" />
            </div>

            <p className="hint">
              {sim.at_cap_pct >= 50
                ? `A maximum of ${sim.max_paylines} binds on ${sim.at_cap_pct}% of spins — most wins are already at the top rung, so raising it would change most payouts.`
                : sim.at_cap_pct < 5
                  ? `A maximum of ${sim.max_paylines} almost never binds (${sim.at_cap_pct}% of spins), so lowering it would change payouts before raising it ever could.`
                  : `A maximum of ${sim.max_paylines} binds on ${sim.at_cap_pct}% of spins.`}
            </p>

            <div className="simbars">
              {sim.distribution.map((d) => (
                <div className="simbar" key={d.lines}
                     data-over={d.lines > sim.max_paylines ? 'true' : undefined}>
                  <span className="simbar-n">{d.lines}</span>
                  <span className="simbar-track">
                    <span className="simbar-fill" style={{ width: `${(d.pct / peak) * 100}%` }} />
                  </span>
                  <span className="simbar-pct">{d.pct}%</span>
                </div>
              ))}
            </div>
            <p className="hint">
              Winning lines per spin, left to right as a share of {sim.spins} spins.
              Rows past {sim.max_paylines} are the ones the maximum is holding back.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3>Payout ladder <span className="count">{ladder.length} rungs</span></h3>
        <p className="hint">
          What the base multiplier pays for each number of <b>ordinary</b> winning
          lines. Special combinations add their bonus on top of whichever rung applies.
          Edit a value and click away to save it.
        </p>
        <div className="tw">
          <table className="ptable ladder">
            <thead>
              <tr>
                <th scope="col" className="num">Lines</th>
                <th scope="col" className="num">Multiplier</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((r) => (
                <tr key={r.lines} data-off={r.lines > maxLines ? 'true' : undefined}>
                  <td className="num">{r.lines}</td>
                  <td className="num">
                    <input
                      type="number" min={0} max={99} step={0.05}
                      defaultValue={r.multiplier} disabled={busy}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 0 && v !== r.multiplier) void commitRung(r.lines, v);
                      }}
                    />
                  </td>
                  <td className="rungnote">
                    {r.lines > maxLines ? 'above the maximum — never reached' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddRung existing={ladder.map((r) => r.lines)} onAdd={commitRung} busy={busy} />
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function AddRung({ existing, onAdd, busy }: {
  existing: number[]; onAdd: (lines: number, mult: number) => void; busy: boolean;
}) {
  const free = Array.from({ length: 29 }, (_, i) => i + 1).filter((n) => !existing.includes(n));
  const [lines, setLines] = useState(free[0] ?? 1);
  const [mult, setMult] = useState(6.25);
  if (free.length === 0) return null;
  return (
    <div className="adjust">
      <label className="field">
        <span>Add a rung for</span>
        <select value={lines} onChange={(e) => setLines(Number(e.target.value))}>
          {free.map((n) => <option key={n} value={n}>{n} lines</option>)}
        </select>
      </label>
      <label className="field">
        <span>Multiplier</span>
        <input type="number" min={0} max={99} step={0.05} value={mult}
               onChange={(e) => setMult(Number(e.target.value))} />
      </label>
      <button className="spin small" disabled={busy} onClick={() => onAdd(lines, mult)}>
        Add rung
      </button>
    </div>
  );
}
