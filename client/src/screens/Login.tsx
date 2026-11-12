import { FormEvent, useState } from 'react';
import { api } from '../api';

export default function Login({ onSignedIn }: { onSignedIn: (name: string) => void }) {
  const [name, setName] = useState(() => localStorage.getItem('reviewerName') || '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name.');
    if (!pin) return setError('Enter the reviewer PIN.');
    setBusy(true);
    setError('');
    try {
      const r = await api<{ name: string }>('/api/login', { body: { name: name.trim(), pin } });
      localStorage.setItem('reviewerName', r.name);
      onSignedIn(r.name);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="screen" onSubmit={submit} style={{ padding: '72px 28px 32px', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" />
            <path d="M2 11h20" />
            <path d="M9 7c0-1 1-1.5 1-2.5" />
            <path d="M13 7c0-1 1-1.5 1-2.5" />
          </svg>
        </div>
        <h1 style={{ fontSize: 34 }}>Langar Pantry</h1>
        <p className="muted" style={{ fontSize: 16, lineHeight: 1.5 }}>Know what's on the shelves before anyone goes shopping.</p>
        <div>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Harpreet" />
          </div>
          <div className="field">
            <label htmlFor="pin">Reviewer PIN</label>
            <input id="pin" className="input" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => { setPin(e.target.value); setError(''); }} />
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted center">Only reviewers sign in. Sewa families get a link to their list each week.</p>
      </div>
    </form>
  );
}
