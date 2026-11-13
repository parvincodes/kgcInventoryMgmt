import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtQty, Line, weekendLabel } from '../api';
import { LangToggle, Loading, Stepper } from '../ui';
import { productName, useLang } from '../lang';

type FamilyData = { serviceDate: string; note: string; lines: Line[]; testing?: boolean };

export default function Family() {
  const { token } = useParams();
  const lang = useLang();
  const [data, setData] = useState<FamilyData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<FamilyData>(`/api/family/${token}`).then(setData).catch((e) => setError(e.message));
  }, [token]);

  if (error && !data) return <div className="screen body" style={{ paddingTop: 48 }}><h1>Sewa list</h1><p className="muted" style={{ marginTop: 12, fontSize: 15 }}>{error}</p></div>;
  if (!data) return <Loading />;

  async function update(l: Line, body: { bought?: boolean; boughtQty?: number }) {
    setData((d) => d && { ...d, lines: d.lines.map((x) => (x.id === l.id ? { ...x, ...body } : x)) });
    try {
      await api(`/api/family/${token}/lines/${l.id}`, { body });
    } catch (e: any) {
      setError(e.message);
    }
  }

  const bought = data.lines.filter((l) => l.bought).length;
  const total = data.lines.length;

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      <div className="family-head">
        <p style={{ color: '#c9d3e6', fontSize: 13 }}>{data.testing ? 'TEST LIST · not for shopping' : 'Khalsa Community Centre · langar sewa'}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h1>Your sewa list</h1>
          <LangToggle lang={lang} />
        </div>
        <p>{weekendLabel(data.serviceDate)} · {bought} of {total} bought</p>
        <div className="progress"><div style={{ width: `${total ? Math.round((bought / total) * 100) : 0}%` }} /></div>
      </div>
      <div className="body">
        {data.note && (
          <div className="card" style={{ marginTop: 16, fontSize: 14, lineHeight: 1.45 }}>
            <strong>Note from the kitchen team:</strong> {data.note}
          </div>
        )}
        <p className="section">Please buy</p>
        {data.lines.map((l) => {
          const got = l.boughtQty ?? l.qty;
          return (
            <div key={l.id} className="row">
              <button
                type="button"
                className={`check square${l.bought ? ' on' : ''}`}
                aria-label={l.bought ? `Mark ${l.name} not bought` : `Mark ${l.name} bought`}
                onClick={() => update(l, { bought: !l.bought })}
              >
                {l.bought ? '✓' : ''}
              </button>
              <div className="grow">
                <span className={`name${l.bought ? ' strike' : ''}`}>{productName(l, lang)}</span>
                <span className="muted">
                  {l.bought
                    ? got === l.qty ? `Bought ${fmtQty(got)} ${l.unit}` : `Bought ${fmtQty(got)} of ${fmtQty(l.qty)} ${l.unit}`
                    : `${fmtQty(l.qty)} ${l.unit}`}
                </span>
              </div>
              {l.bought && <Stepper label={`${l.name} bought`} value={got} onChange={(v) => update(l, { boughtQty: v })} />}
            </div>
          );
        })}
        <p className="muted" style={{ marginTop: 24, lineHeight: 1.5 }}>
          Ticking items only lets the kitchen team know what you bought. They count the pantry again after langar.
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
