import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'setup';

const MIN_PW = 8;
const MAX_PW = 10;   // the spec caps password length at 10 characters

export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setNotice(null);

    if (mode === 'setup' && (password.length < MIN_PW || password.length > MAX_PW)) {
      setError(`Choose a password between ${MIN_PW} and ${MAX_PW} characters.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'setup') {
        const { error } = await supabase.auth.signUp({ email, password });
        // Deliberately vague: the spec says never to reveal the address rule.
        if (error) throw new Error('Registration failed. Check with your system admin.');
        setNotice('Account created. Signing you in…');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error('That email and password did not match.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">bluePi Slot</span>
        </div>

        <h1 className="auth-title">
          {mode === 'signin' ? 'Sign in' : 'Set up your password'}
        </h1>
        <p className="auth-sub">
          {mode === 'signin'
            ? 'Use your work email address.'
            : 'First time here? Choose a password of 8 to 10 characters.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email" value={email} autoComplete="username" required
              onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
              placeholder="you@example.com"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password" value={password} required
              maxLength={MAX_PW}
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}

          <button className="spin auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create my account'}
          </button>
        </form>

        <button
          type="button" className="linkish"
          onClick={() => { setMode(mode === 'signin' ? 'setup' : 'signin'); setError(null); }}
        >
          {mode === 'signin' ? 'First time here? Set up your password' : 'I already have a password'}
        </button>
      </div>
    </div>
  );
}
