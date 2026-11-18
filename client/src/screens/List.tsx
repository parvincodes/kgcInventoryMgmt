import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtQty, Line, Week, weekendLabel } from '../api';
import { Back, LangToggle, Loading, Stepper } from '../ui';
import { productName, useLang } from '../lang';

type ListData = { week: Week; lines: Line[] };
type Alert = { id: number; kind: string; detail: string };

export default function List({ role }: { role: 'admin' | 'reviewer' }) {
  const nav = useNavigate();
  const lang = useLang();
  const [data, setData] = useState<ListData | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [one, setOne] = useState({ name: '', qty: 1, unit: '', reason: '' });
  const [copied, setCopied] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const load = () => {
    api<Alert[]>('/api/alerts').then(setAlerts).catch(() => {});
    return api<ListData>('/api/list')
      .then((d) => {
        setData(d);
        setNote(d.week.note);
      })
      .catch((e) => setError(e.message));
  };
  async function reviewAlert(id: number) {
    try {
      await api(`/api/alerts/${id}/resolve`, { method: 'POST', body: {} });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (!data) return error ? <div className="screen body"><p className="error">{error}</p></div> : <Loading />;
  const { week, lines } = data;

  async function patch(id: number, body: Partial<{ qty: number; removed: boolean }>) {
    setData((d) => d && { ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...body } : l)) });
    try {
      await api(`/api/list/lines/${id}`, { method: 'PUT', body });
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function removeOneOff(id: number) {
    await api(`/api/list/lines/${id}`, { method: 'DELETE' });
    load();
  }
  async function addOneOff(e: FormEvent) {
    e.preventDefault();
    if (!one.name.trim()) return setError('Enter a name for the one-off item.');
    await api('/api/list/lines', { body: one });
    setOne({ name: '', qty: 1, unit: '', reason: '' });
    setAdding(false);
    setError('');
    load();
  }
  async function saveNote() {
    if (note !== week.note) await api('/api/list/note', { method: 'PUT', body: { note } });
  }
  async function approve() {
    await saveNote();
    await api('/api/list/approve', { body: {} });
    load();
  }

  const auto = lines.filter((l) => !l.oneOff);
  const oneOffs = lines.filter((l) => l.oneOff);
  const activeCount = lines.filter((l) => !l.removed).length;
  const sent = week.status === 'sent';
  const familyUrl = `${window.location.origin}/f/${week.shareToken}`;
  const message = `Waheguru ji ka Khalsa, Waheguru ji ki Fateh. Here's your sewa list for ${weekendLabel(week.serviceDate)}: ${activeCount} items. Please check it before you shop: ${familyUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError('Copy failed. Press and hold the link to copy it.');
    }
  }

  return (
    <div className="screen">
      <div className="header">
        <div className="topbar">
          <Back />
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`tag ${sent ? 'ok' : 'low'}`} style={{ fontSize: 12, padding: '4px 10px' }}>{sent ? 'Sent' : 'Draft · due Thu'}</span>
            <LangToggle lang={lang} />
          </span>
        </div>
        <h1>List for {weekendLabel(week.serviceDate).replace('Sat–Sun, ', '')}</h1>
        <p className="muted">
          {week.countedBy ? `Counted by ${week.countedBy}` : 'Not counted yet'} · {activeCount} item{activeCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="body">
        {week.status === 'count_due' || week.status === 'counting' ? (
          <div className="banner warn" style={{ marginTop: 16 }}>
            Finish this week's count first. The list is drafted from it.{' '}
            <button className="link-btn" style={{ minHeight: 0, color: 'inherit', textDecoration: 'underline' }} onClick={() => nav('/count')}>Go to count</button>
          </div>
        ) : null}
        {week.status === 'drafted' && (
          <div className="banner" style={{ marginTop: 16 }}>
            Draft. This list follows the count, so changes you make there show up here.{' '}
            <button className="link-btn" style={{ minHeight: 0, color: 'inherit', textDecoration: 'underline' }} onClick={() => nav('/count')}>Edit count</button>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--saffron-ink)' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Needs review before approval</p>
            {alerts.map((a) => (
              <div key={a.id} style={{ marginTop: 10 }}>
                <p className="small" style={{ margin: 0, lineHeight: 1.5 }}>{a.detail}</p>
                {role === 'admin' ? (
                  <button type="button" className="link-btn" style={{ padding: 0, marginTop: 4 }} onClick={() => reviewAlert(a.id)}>Mark reviewed</button>
                ) : (
                  <p className="muted small" style={{ margin: '4px 0 0' }}>An admin needs to mark this reviewed.</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="section">Below minimum</p>
        {auto.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>Nothing is below minimum.</p>}
        {auto.map((l) => (
          <div key={l.id} className={`row${l.removed ? ' dim' : ''}`}>
            <div className="grow">
              <span className="name">
                {productName(l, lang)}
                {!l.removed && l.qty !== l.suggested && <span className="tag info">Edited</span>}
              </span>
              <span className="muted small">{l.removed ? 'Removed from this week' : `${l.reason} · suggested ${fmtQty(l.suggested)}`}</span>
            </div>
            {!l.removed && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Stepper label={l.name} min={1} value={l.qty} onChange={(v) => patch(l.id, { qty: v })} />
                <span className="muted small">{l.unit}</span>
              </div>
            )}
            <button type="button" className="link-btn" style={{ fontSize: 13, color: 'var(--muted)', padding: '0 4px' }} onClick={() => patch(l.id, { removed: !l.removed })}>
              {l.removed ? 'Undo' : 'Remove'}
            </button>
          </div>
        ))}

        <p className="section">One-off items</p>
        {oneOffs.map((l) => (
          <div key={l.id} className="row">
            <div className="grow">
              <span className="name">{productName(l, lang)}</span>
              <span className="muted small">{l.reason}</span>
            </div>
            <Stepper label={l.name} min={1} value={l.qty} onChange={(v) => patch(l.id, { qty: v })} />
            <button type="button" className="link-btn" style={{ fontSize: 13, color: 'var(--muted)', padding: '0 4px' }} onClick={() => removeOneOff(l.id)}>Delete</button>
          </div>
        ))}
        {adding ? (
          <form onSubmit={addOneOff} className="card" style={{ marginTop: 8 }}>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="oo-name">Item</label>
              <input id="oo-name" className="input" value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} placeholder="Marigold flowers" autoFocus />
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="oo-qty">Quantity</label>
                <input id="oo-qty" className="input" type="number" inputMode="numeric" min={1} value={one.qty} onChange={(e) => setOne({ ...one, qty: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="oo-unit">Unit</label>
                <input id="oo-unit" className="input" value={one.unit} onChange={(e) => setOne({ ...one, unit: e.target.value })} placeholder="boxes" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="oo-why">Reason (optional)</label>
              <input id="oo-why" className="input" value={one.reason} onChange={(e) => setOne({ ...one, reason: e.target.value })} placeholder="Gurpurab decoration" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn">Add</button>
              <button type="button" className="btn secondary" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="link-btn" style={{ minHeight: 48 }} onClick={() => setAdding(true)}>+ Add one-off item</button>
        )}

        <div className="field" style={{ marginTop: 20 }}>
          <label htmlFor="note">Note to family</label>
          <textarea id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} placeholder="Milk: whole milk in 1-gallon jugs, please." />
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="footer">
        {!sent ? (
          <>
            <button className="btn" onClick={approve} disabled={week.status !== 'drafted' || activeCount === 0 || alerts.length > 0}>Approve list</button>
            {alerts.length > 0 && <p className="muted small center">Mark the alerts reviewed to approve the list.</p>}
            <p className="muted small center">Then share it on WhatsApp. You can still edit after sharing; the link always shows the latest list.</p>
          </>
        ) : (
          <>
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn secondary" onClick={copyLink}>{copied ? 'Copied' : 'Copy message'}</button>
              <button className="btn secondary" onClick={() => nav(`/f/${week.shareToken}`)}>Family view</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
