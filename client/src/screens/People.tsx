import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Back, Loading } from '../ui';

type Person = {
  id: number;
  name: string;
  phone: string;
  role: 'admin' | 'reviewer';
  catalog: 'prod' | 'test';
  active: boolean;
  locked: boolean;
};

type Form = { name: string; phone: string; role: 'admin' | 'reviewer'; catalog: 'prod' | 'test'; pin: string };
const blank: Form = { name: '', phone: '', role: 'reviewer', catalog: 'prod', pin: '' };

export default function People() {
  const nav = useNavigate();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () => api<Person[]>('/api/people').then(setPeople).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (!people) return error ? <div className="screen body"><p className="error">{error}</p></div> : <Loading />;

  async function save(p: Person, body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/api/people/${p.id}`, { method: 'PUT', body });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function resetPin(p: Person) {
    const pin = window.prompt(`New PIN for ${p.name} (4 to 8 digits)`);
    if (pin) save(p, { pin });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/people', { body: form });
      setForm(blank);
      setAdding(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="screen">
      <div className="header plain">
        <div className="topbar">
          <Back to="/" label="Back" />
          <span className="muted">People</span>
          <span style={{ width: 44 }} />
        </div>
        <h1>Who can sign in</h1>
        <p className="muted">Each person has their own PIN. Deactivating someone signs them out straight away.</p>
      </div>
      <div className="body">
        {people.map((p) => (
          <div key={p.id} className="card" style={{ marginTop: 12, opacity: p.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong>{p.name}</strong>
              <span className="muted small">{p.phone}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
              <span className={`tag ${p.role === 'admin' ? 'info' : 'plain'}`}>{p.role === 'admin' ? 'Admin' : 'Reviewer'}</span>
              <span className="tag plain">{p.catalog === 'test' ? 'Testing' : 'Khalsa Gurmat School'}</span>
              {!p.active && <span className="tag low">Inactive</span>}
              {p.locked && <span className="tag low">Locked</span>}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14 }}>
              <button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => save(p, { role: p.role === 'admin' ? 'reviewer' : 'admin' })}>
                Make {p.role === 'admin' ? 'reviewer' : 'admin'}
              </button>
              <button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => resetPin(p)}>Reset PIN</button>
              {p.locked && (
                <button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => save(p, { unlock: true })}>Unlock</button>
              )}
              <button type="button" className="link-btn" style={{ padding: 0, color: p.active ? 'var(--danger)' : 'inherit' }} onClick={() => save(p, { active: !p.active })}>
                {p.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}

        {adding ? (
          <form onSubmit={add} className="card" style={{ marginTop: 16 }}>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="pn">Name</label>
              <input id="pn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="field">
              <label htmlFor="pp">Mobile number</label>
              <input id="pp" className="input" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="202-555-0100" />
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="pr">Role</label>
                <select id="pr" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'reviewer' })}>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="pc">Catalog</label>
                <select id="pc" className="input" value={form.catalog} onChange={(e) => setForm({ ...form, catalog: e.target.value as 'prod' | 'test' })}>
                  <option value="prod">Khalsa Gurmat School</option>
                  <option value="test">Testing</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ppin">Personal PIN (4 to 8 digits)</label>
              <input id="ppin" className="input" type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn">Add person</button>
              <button type="button" className="btn secondary" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>Add a person</button>
        )}
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        <button type="button" className="link-btn" style={{ marginTop: 16 }} onClick={() => nav('/')}>Done</button>
      </div>
    </div>
  );
}
