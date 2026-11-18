import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Back } from '../ui';

export default function ChangePin() {
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!current) return setError('Enter your current PIN.');
    if (!/^\d{4,8}$/.test(next)) return setError('Your new PIN must be 4 to 8 digits.');
    if (next !== confirm) return setError("The new PINs don't match.");
    setBusy(true);
    try {
      await api('/api/me/pin', { body: { currentPin: current, newPin: next } });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="screen" onSubmit={submit}>
      <div className="header plain">
        <div className="topbar">
          <Back to="/" label="Back" />
          <span className="muted">Change PIN</span>
          <span style={{ width: 44 }} />
        </div>
        <h1>Change my PIN</h1>
        <p className="muted">Enter your current PIN, then choose a new one of 4 to 8 digits.</p>
      </div>
      <div className="body">
        <div className="field">
          <label htmlFor="cur">Current PIN</label>
          <input id="cur" className="input" type="password" inputMode="numeric" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new">New PIN</label>
          <input id="new" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="conf">Type the new PIN again</label>
          <input id="conf" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        {done && <p className="banner ok" style={{ marginTop: 12 }}>Your PIN is changed. Use the new one next time you sign in.</p>}
      </div>
      <div className="footer">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change PIN'}</button>
        <button type="button" className="link-btn" onClick={() => nav('/')}>Done</button>
      </div>
    </form>
  );
}
