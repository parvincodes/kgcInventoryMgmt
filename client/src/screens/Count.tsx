import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, expirySoon, Item, LEVELS, LOCATIONS, Week } from '../api';
import { Back, LangToggle, Loading, Stepper } from '../ui';
import { productName, useLang } from '../lang';

export default function Count() {
  const nav = useNavigate();
  const lang = useLang();
  const [items, setItems] = useState<Item[] | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    api<{ items: Item[]; week: Week }>('/api/count')
      .then((r) => {
        setItems(r.items);
        setWeek(r.week);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(id: number, body: Record<string, unknown>, optimistic: Partial<Item>) {
    setItems((xs) => xs!.map((x) => (x.id === id ? { ...x, ...optimistic } : x)));
    setSaving((n) => n + 1);
    try {
      const fresh = await api<Item>(`/api/count/item/${id}`, { body });
      setItems((xs) => xs!.map((x) => (x.id === id ? fresh : x)));
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving((n) => n - 1);
    }
  }

  const groups = useMemo(() => {
    if (!items) return [];
    return LOCATIONS.map((loc) => ({ loc, items: items.filter((i) => i.location === loc) })).filter((g) => g.items.length);
  }, [items]);

  if (!items) return error ? <div className="screen body"><p className="error">{error}</p></div> : <Loading />;

  const done = items.filter((i) => i.counted).length;
  const low = items.filter((i) => i.belowMin).length;

  // Once the list is drafted, counts stay editable and each change updates the draft.
  const drafted = week?.status === 'drafted';
  const sent = week?.status === 'sent';

  async function finish() {
    setFinishing(true);
    try {
      await api('/api/count/finish', { body: {} });
      nav('/list');
    } catch (e: any) {
      setError(e.message);
      setFinishing(false);
    }
  }

  return (
    <div className="screen">
      <div className="header">
        <div className="topbar">
          <Back />
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="muted" style={{ color: saving ? 'var(--muted)' : 'var(--green)' }}>{saving ? 'Saving…' : '✓ Saved'}</span><LangToggle lang={lang} /></span>
        </div>
        <h1>Weekly count</h1>
        <div className="progress"><div style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 0}%` }} /></div>
        <p className="muted">{done} of {items.length} counted · {low} below minimum</p>
      </div>
      <div className="body">
        {items.length === 0 && (
          <div className="empty">
            <p className="muted">No items yet. Add some to the catalog first.</p>
            <button className="btn secondary" onClick={() => nav('/scan')}>Add items by photo</button>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.loc}>
            <p className="section">{g.loc}</p>
            {g.items.map((it) => {
              const exp = expirySoon(it.expiryDate);
              return (
                <div key={it.id} className="row">
                  <button
                    type="button"
                    className={`check${it.counted ? ' on' : ''}`}
                    aria-label={it.counted ? `${it.name} counted. Tap to undo` : `Mark ${it.name} counted, unchanged`}
                    onClick={() => save(it.id, { counted: !it.counted }, { counted: !it.counted })}
                  >
                    {it.counted ? '✓' : ''}
                  </button>
                  <div className="grow">
                    <span className="name">
                      {productName(it, lang)}
                      {it.belowMin && <span className="tag low">Below min</span>}
                      {it.needsSetup && <span className="tag plain">No min set</span>}
                      {exp && <span className="tag info">{exp}</span>}
                    </span>
                    <span className="muted small">
                      {it.mode === 'lvl' ? 'Level' : `${it.unit || 'units'}${it.min != null ? ` · min ${it.min}` : ''}`}
                    </span>
                  </div>
                  {it.mode === 'num' ? (
                    <Stepper label={it.name} value={it.currentNum} onChange={(v) => save(it.id, { value: v }, { currentNum: v, counted: true })} />
                  ) : (
                    <div className="levels">
                      {LEVELS.map((l) => (
                        <button key={l} type="button" className={it.currentLevel === l ? 'on' : ''} onClick={() => save(it.id, { level: l }, { currentLevel: l, counted: true })}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {error && <p className="error">{error}</p>}
      </div>
      {items.length > 0 && (
        <div className="footer">
          {drafted || sent ? (
            <>
              <button className="btn" onClick={() => nav('/list')}>View list</button>
              <p className="muted small center">
                {drafted
                  ? 'Still a draft. Counts can still change, and the list updates with them until you send it.'
                  : 'The list is already sent. Count changes here won’t change it.'}
              </p>
            </>
          ) : (
            <>
              <button className="btn" onClick={finish} disabled={finishing}>{finishing ? 'Drafting…' : `Finish and draft list (${low})`}</button>
              <p className="muted small center">Stop anytime. You or the other reviewer can pick up where you left off.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
