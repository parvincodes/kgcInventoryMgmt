import { ChangeEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, LOCATIONS } from '../api';
import { Back, CameraIcon, Stepper } from '../ui';

type Result = { name: string; unit: string; count: number; confidence: 'high' | 'low'; matchId: number | null; matchName: string | null };
type Row = Result & { keep: boolean };

/** Shrink the photo in the browser so uploads are quick on mobile data. */
async function toJpeg(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That photo couldn't be opened. Try taking it again."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Scan() {
  const nav = useNavigate();
  const [step, setStep] = useState<'pick' | 'reading' | 'review' | 'done'>('pick');
  const [location, setLocation] = useState<string>('Shelves');
  const [rows, setRows] = useState<Row[]>([]);
  const [demo, setDemo] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState({ added: 0, updated: 0 });

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setStep('reading');
    try {
      const image = await toJpeg(file);
      setPreview(image);
      const r = await api<{ demo: boolean; results: Result[] }>('/api/scan', { body: { location, image } });
      setDemo(r.demo);
      // New items are ticked; low-confidence ones and items already in the catalog start unticked.
      setRows(r.results.map((x) => ({ ...x, keep: x.confidence === 'high' && !x.matchId })));
      setStep('review');
    } catch (err: any) {
      setError(err.message);
      setStep('pick');
    }
  }

  async function save() {
    const items = rows.filter((r) => r.keep && r.name.trim());
    const r = await api<{ added: number; updated: number }>('/api/scan/save', { body: { location, items } });
    setSaved(r);
    setStep('done');
  }

  const camera = (
    <label className="btn" style={{ cursor: 'pointer' }}>
      <CameraIcon /> {step === 'review' ? 'Retake photo' : 'Open camera'}
      <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="sr-only" />
    </label>
  );

  if (step === 'reading') {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }}>
        {preview && <img src={preview} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 16, opacity: 0.6 }} />}
        <div className="spinner" />
        <h2>Reading the photo…</h2>
        <p className="muted">Matching against your catalog</p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="screen" style={{ justifyContent: 'space-between' }}>
        <div className="body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, flex: 1 }}>
          <h1>{saved.added} added{saved.updated ? `, ${saved.updated} updated` : ''}</h1>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>New items need a minimum and target before the first count. You can set those in the catalog.</p>
        </div>
        <div className="footer">
          <button className="btn" onClick={() => { setRows([]); setPreview(''); setStep('pick'); }}>Photograph the next shelf</button>
          <button className="btn secondary" onClick={() => nav('/catalog')}>Set minimums and targets</button>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    const keepN = rows.filter((r) => r.keep).length;
    return (
      <div className="screen">
        <div className="header">
          <div className="topbar"><Back to="/catalog" label="Back to catalog" /></div>
          <h1>Found {rows.length} item{rows.length === 1 ? '' : 's'}</h1>
          <p className="muted">{location} · counts are estimates, adjust if needed</p>
        </div>
        <div className="body">
          {demo && <div className="banner info" style={{ marginTop: 14 }}>Demo results. Add an ANTHROPIC_API_KEY to .env to read real photos.</div>}
          {preview && <img src={preview} alt="Your photo" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, marginTop: 14 }} />}
          {rows.length === 0 && <p className="muted" style={{ padding: '16px 0' }}>Nothing recognisable. Try closer, with labels facing out.</p>}
          {rows.map((r, i) => {
            const set = (patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="row" style={{ alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }}>
                <button type="button" className={`check square navy${r.keep ? ' on' : ''}`} aria-label={r.keep ? `Skip ${r.name}` : `Include ${r.name}`} onClick={() => set({ keep: !r.keep })}>
                  {r.keep ? '✓' : ''}
                </button>
                <div className="grow">
                  <label className="sr-only" htmlFor={`n${i}`}>Name</label>
                  <input id={`n${i}`} className="input" style={{ minHeight: 40, fontWeight: 500 }} value={r.name} onChange={(e) => set({ name: e.target.value })} />
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.matchId ? <span className="tag info">In catalog · tick to update count</span> : r.confidence === 'low' ? <span className="tag low">Not sure · check it</span> : <span className="tag ok">New item</span>}
                    <span className="muted small">{r.unit}</span>
                  </span>
                </div>
                <Stepper label={r.name} value={r.count} onChange={(v) => set({ count: v })} />
              </div>
            );
          })}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="footer">
          <button className="btn" onClick={save} disabled={keepN === 0}>Save {keepN} item{keepN === 1 ? '' : 's'}</button>
          <label className="btn secondary" style={{ cursor: 'pointer' }}>
            Retake photo
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="sr-only" />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="header plain">
        <div className="topbar"><Back to="/catalog" label="Back to catalog" /></div>
        <h1>Add items by photo</h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Take a photo of one shelf or section. The app lists what it sees, and you confirm before anything is saved.</p>
      </div>
      <div className="body">
        <p className="section">Where are you?</p>
        <div className="grid2">
          {LOCATIONS.map((l) => (
            <button key={l} type="button" className={`choice${location === l ? ' on' : ''}`} onClick={() => setLocation(l)}>{l}</button>
          ))}
        </div>
        <div className="card" style={{ marginTop: 18 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>For the best results</p>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>One shelf per photo · labels facing out · good light · rough counts are fine, you'll fix them</p>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="footer">{camera}</div>
    </div>
  );
}
