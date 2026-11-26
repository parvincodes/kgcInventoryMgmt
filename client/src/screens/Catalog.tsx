import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Item, LOCATIONS } from '../api';
import { Back, CameraIcon, Chevron, LangToggle, Loading } from '../ui';
import { productName, useLang } from '../lang';

export default function Catalog({ admin }: { admin: boolean }) {
  const lang = useLang();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Item[]>('/api/items').then(setItems).catch((e) => setError(e.message));
  }, []);
  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function endSelecting() {
    setSelecting(false);
    setPicked([]);
  }
  async function removePicked() {
    if (!window.confirm(`Remove ${picked.length} item${picked.length === 1 ? '' : 's'} from the catalog? Their history is kept.`)) return;
    try {
      await api('/api/items/remove', { body: { ids: picked } });
      setItems((xs) => xs!.filter((x) => !picked.includes(x.id)));
      endSelecting();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!items) return error ? <div className="screen body"><p className="error">{error}</p></div> : <Loading />;

  const shown = items.filter(
    (i) => (filter === 'All' || i.location === filter) && i.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="screen">
      <div className="header">
        <div className="topbar">
          <Back />
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LangToggle lang={lang} />
            {admin && (
              <button type="button" className="btn small secondary" onClick={() => (selecting ? endSelecting() : setSelecting(true))}>
                {selecting ? 'Done' : 'Select'}
              </button>
            )}
            <Link to="/scan" className="btn small" style={{ textDecoration: 'none' }}>
              <CameraIcon /> Add by photo
            </Link>
          </span>
        </div>
        <h1>Item catalog</h1>
        <label htmlFor="q" className="sr-only">Search items</label>
        <input id="q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Atta, napkins, haldi" />
        <div className="pills">
          {['All', ...LOCATIONS].map((l) => (
            <button key={l} type="button" className={`pill${filter === l ? ' on' : ''}`} onClick={() => setFilter(l)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="body">
        {items.length === 0 && (
          <div className="empty">
            <h2>Start your catalog</h2>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Photograph one shelf at a time. The app lists what it sees, and you confirm before anything is saved.</p>
            <Link to="/scan" className="btn"><CameraIcon /> Add items by photo</Link>
          </div>
        )}
        {shown.map((it) => (
          <Link
            key={it.id}
            to={`/catalog/${it.id}`}
            className="row"
            style={{ textDecoration: 'none', color: 'inherit' }}
            onClick={(e) => {
              if (selecting) {
                e.preventDefault();
                toggle(it.id);
              }
            }}
          >
            {selecting && (
              <span className={`check square navy${picked.includes(it.id) ? ' on' : ''}`} aria-hidden="true">{picked.includes(it.id) ? '✓' : ''}</span>
            )}
            {it.hasPhoto ? (
              <img src={`/api/items/${it.id}/photo`} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--chip)', flexShrink: 0 }} />
            )}
            <span className="grow">
              <span className="name">
                {productName(it, lang)}
                {it.needsSetup && <span className="tag low">Set min/target</span>}
              </span>
              <span className="muted small">
                {it.location}{it.store ? ` · ${it.store}` : ''}{it.brand ? ` · ${it.brand}` : ''} · {it.mode === 'lvl' ? 'level' : `${it.unit || 'units'}${it.min != null ? ` · min ${it.min}` : ''}${it.target != null ? ` · target ${it.target}` : ''}`}
                {it.expiryDate ? ' · expiry' : ''}
              </span>
            </span>
            <Chevron />
          </Link>
        ))}
      </div>
      <div className="footer">
        {selecting ? (
          <>
            <button type="button" className="btn" style={{ background: 'var(--danger)' }} disabled={picked.length === 0} onClick={removePicked}>
              Remove {picked.length || ''} from catalog
            </button>
            <p className="muted small center">Tap items to choose them. Removed items are hidden, and their history is kept.</p>
          </>
        ) : (
          <Link to="/catalog/new" className="btn">Add item</Link>
        )}
      </div>
    </div>
  );
}
