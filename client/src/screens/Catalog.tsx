import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Item, LOCATIONS } from '../api';
import { Back, CameraIcon, Chevron, Loading } from '../ui';

export default function Catalog() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Item[]>('/api/items').then(setItems).catch((e) => setError(e.message));
  }, []);
  if (!items) return error ? <div className="screen body"><p className="error">{error}</p></div> : <Loading />;

  const shown = items.filter(
    (i) => (filter === 'All' || i.location === filter) && i.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="screen">
      <div className="header">
        <div className="topbar">
          <Back />
          <Link to="/scan" className="btn small" style={{ textDecoration: 'none' }}>
            <CameraIcon /> Add by photo
          </Link>
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
          <Link key={it.id} to={`/catalog/${it.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="grow">
              <span className="name">
                {it.name}
                {it.needsSetup && <span className="tag low">Set min/target</span>}
                {it.overBought && <span className="tag plain">Over-bought</span>}
              </span>
              <span className="muted small">
                {it.location} · {it.mode === 'lvl' ? 'level' : `${it.unit || 'units'}${it.min != null ? ` · min ${it.min}` : ''}${it.target != null ? ` · target ${it.target}` : ''}`}
                {it.expiryDate ? ' · expiry' : ''}
              </span>
            </span>
            <Chevron />
          </Link>
        ))}
      </div>
      <div className="footer">
        <Link to="/catalog/new" className="btn">Add item</Link>
      </div>
    </div>
  );
}
