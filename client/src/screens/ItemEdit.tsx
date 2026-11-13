import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Item, LOCATIONS } from '../api';
import { Back, Loading, Switch } from '../ui';

type Form = {
  name: string;
  location: string;
  unit: string;
  mode: 'num' | 'lvl';
  min: string;
  target: string;
  trackExpiry: boolean;
  expiryDate: string;
};

const empty: Form = { name: '', location: 'Shelves', unit: '', mode: 'num', min: '', target: '', trackExpiry: false, expiryDate: '' };

export default function ItemEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id;
  const [f, setF] = useState<Form | null>(isNew ? empty : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api<Item[]>('/api/items').then((items) => {
      const it = items.find((i) => String(i.id) === id);
      if (!it) return setError('Item not found.');
      setF({
        name: it.name,
        location: it.location,
        unit: it.unit,
        mode: it.mode,
        min: it.min == null ? '' : String(it.min),
        target: it.target == null ? '' : String(it.target),
        trackExpiry: !!it.expiryDate,
        expiryDate: it.expiryDate ?? ''
      });
    });
  }, [id, isNew]);

  if (!f) return error ? <div className="screen body"><p className="error">{error}</p></div> : <Loading />;
  const set = (patch: Partial<Form>) => setF({ ...f, ...patch });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f!.name.trim()) return setError('Enter a name.');
    if (f!.mode === 'num' && f!.min !== '' && f!.target !== '' && Number(f!.target) < Number(f!.min)) {
      return setError('Target should be at least the minimum.');
    }
    setBusy(true);
    const body = { ...f!, expiryDate: f!.trackExpiry ? f!.expiryDate : '' };
    try {
      if (isNew) await api('/api/items', { body });
      else await api(`/api/items/${id}`, { method: 'PUT', body });
      nav('/catalog');
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${f!.name} from the catalog?`)) return;
    await api(`/api/items/${id}`, { method: 'DELETE' });
    nav('/catalog');
  }

  return (
    <form className="screen" onSubmit={submit}>
      <div className="header plain">
        <div className="topbar">
          <Back to="/catalog" label="Back to catalog" />
          <span className="muted">{isNew ? 'New item' : 'Edit item'}</span>
          <span style={{ width: 44 }} />
        </div>
      </div>
      <div className="body">
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="name">Name</label>
          <input id="name" className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Atta flour" />
        </div>
        <div className="field">
          <label htmlFor="loc">Location</label>
          <select id="loc" className="input" value={f.location} onChange={(e) => set({ location: e.target.value })}>
            {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">Count by</span>
          <div className="grid2">
            <button type="button" className={`choice${f.mode === 'num' ? ' on' : ''}`} onClick={() => set({ mode: 'num' })}>Number</button>
            <button type="button" className={`choice${f.mode === 'lvl' ? ' on' : ''}`} onClick={() => set({ mode: 'lvl' })}>Level (Full–Out)</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="unit">{f.mode === 'num' ? 'Shelf unit' : 'Unit to buy'}</label>
          <input id="unit" className="input" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder={f.mode === 'num' ? '20 lb bags' : 'packets'} />
        </div>
        {f.mode === 'num' ? (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="min">Minimum</label>
                <input id="min" className="input" type="number" inputMode="decimal" min={0} value={f.min} onChange={(e) => set({ min: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="target">Target</label>
                <input id="target" className="input" type="number" inputMode="decimal" min={0} value={f.target} onChange={(e) => set({ target: e.target.value })} />
              </div>
            </div>
            <p className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>
              {f.min !== '' ? `Below ${f.min}, it goes on the list. The list buys back up to ${f.target || f.min}.` : 'Set a minimum so this item can go on the list.'}
            </p>
          </>
        ) : (
          <p className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>Goes on the list when counted as Low or Out.</p>
        )}
        <div className="card" style={{ padding: 0, marginTop: 18 }}>
          <button type="button" className="toggle-row" onClick={() => set({ trackExpiry: !f.trackExpiry })}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 500 }}>Track expiry date</span>
              <span className="muted small">Shows "use by" during the count</span>
            </span>
            <Switch on={f.trackExpiry} />
          </button>
          {f.trackExpiry && (
            <div style={{ padding: '0 14px 14px' }}>
              <label htmlFor="exp" className="sr-only">Earliest expiry date</label>
              <input id="exp" className="input" type="date" value={f.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} />
            </div>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {!isNew && (
          <button type="button" className="link-btn" style={{ color: 'var(--danger)', marginTop: 16 }} onClick={remove}>Remove from catalog</button>
        )}
      </div>
      <div className="footer">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save item'}</button>
      </div>
    </form>
  );
}
