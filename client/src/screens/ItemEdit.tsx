import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Item, LOCATIONS } from '../api';
import { Back, CameraIcon, Loading, Switch } from '../ui';
import { toJpeg } from '../photo';

type Form = {
  name: string;
  location: string;
  store: string;
  brand: string;
  unit: string;
  mode: 'num' | 'lvl';
  min: string;
  target: string;
  trackExpiry: boolean;
  expiryDate: string;
};

type Identified = { demo: boolean; name: string | null; unit: string; confidence: 'high' | 'low' };

const empty: Form = { name: '', location: 'Shelves', store: '', brand: '', unit: '', mode: 'num', min: '', target: '', trackExpiry: false, expiryDate: '' };

export default function ItemEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id;
  const [f, setF] = useState<Form | null>(isNew ? empty : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Photo state. For a new item the photo waits in `pending` until the item is saved.
  const [hasPhoto, setHasPhoto] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState('');

  useEffect(() => {
    if (isNew) return;
    api<Item[]>('/api/items').then((items) => {
      const it = items.find((i) => String(i.id) === id);
      if (!it) return setError('Item not found.');
      setHasPhoto(it.hasPhoto);
      setF({
        name: it.name,
        location: it.location,
        store: it.store ?? '',
        brand: it.brand ?? '',
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

  const shownPhoto = pending ?? (hasPhoto && !isNew ? `/api/items/${id}/photo?v=${photoVersion}` : null);

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPhotoNote('');
    setPhotoBusy(true);
    try {
      const image = await toJpeg(file, 1024);
      if (isNew) {
        setPending(image);
      } else {
        await api(`/api/items/${id}/photo`, { method: 'PUT', body: { image } });
        setHasPhoto(true);
        setPhotoVersion((v) => v + 1);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPending(null);
    if (!isNew) {
      await api(`/api/items/${id}/photo`, { method: 'DELETE' });
      setHasPhoto(false);
    }
  }

  async function suggestName() {
    setPhotoNote('');
    setPhotoBusy(true);
    try {
      const body = pending ? { image: pending } : { itemId: Number(id) };
      const r = await api<Identified>('/api/identify', { body });
      if (r.demo) return setPhotoNote('Demo mode: add an Anthropic key to .env to read photos.');
      if (!r.name) return setPhotoNote("Couldn't tell what this is. Type the name instead.");
      setF((cur) => cur && { ...cur, name: r.name!, unit: cur.unit || r.unit });
      setPhotoNote(`Suggested “${r.name}”${r.confidence === 'low' ? ', not sure' : ''}. Check it before saving.`);
    } catch (err: any) {
      setPhotoNote(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f!.name.trim()) return setError('Enter a name.');
    if (f!.mode === 'num' && f!.min !== '' && f!.target !== '' && Number(f!.target) < Number(f!.min)) {
      return setError('Target should be at least the minimum.');
    }
    setBusy(true);
    const body = { ...f!, expiryDate: f!.trackExpiry ? f!.expiryDate : '' };
    try {
      if (isNew) {
        const created = await api<Item>('/api/items', { body });
        if (pending) await api(`/api/items/${created.id}/photo`, { method: 'PUT', body: { image: pending } });
      } else {
        await api(`/api/items/${id}`, { method: 'PUT', body });
      }
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
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 4 }}>
          {shownPhoto ? (
            <img src={shownPhoto} alt="Product" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 14, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: 14, background: 'var(--chip)', color: 'var(--muted)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              No photo
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, alignItems: 'flex-start' }}>
            <label className="btn small" style={{ cursor: photoBusy ? 'default' : 'pointer', opacity: photoBusy ? 0.6 : 1 }}>
              <CameraIcon /> {shownPhoto ? 'Retake photo' : 'Take photo'}
              <input type="file" accept="image/*" capture="environment" onChange={onPhoto} disabled={photoBusy} className="sr-only" />
            </label>
            <button type="button" className="link-btn" style={{ padding: 0 }} onClick={suggestName} disabled={!shownPhoto || photoBusy}>
              {photoBusy ? 'Working…' : 'Suggest name from photo'}
            </button>
            {shownPhoto && (
              <button type="button" className="link-btn" style={{ padding: 0, color: 'var(--danger)' }} onClick={removePhoto}>Remove photo</button>
            )}
          </div>
        </div>
        {photoNote && <p className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>{photoNote}</p>}

        <div className="field">
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
          <label htmlFor="store">Where to buy</label>
          <input id="store" className="input" list="stores" value={f.store} onChange={(e) => set({ store: e.target.value })} placeholder="Costco" />
          <datalist id="stores">
            <option value="Costco" />
            <option value="Punjab Trading" />
            <option value="US Chef Store" />
            <option value="Indian Store" />
            <option value="Restaurant Depot" />
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="brand">Preferred brand</label>
          <input id="brand" className="input" value={f.brand} onChange={(e) => set({ brand: e.target.value })} />
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
