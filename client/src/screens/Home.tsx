import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Me, Week, weekendLabel } from '../api';
import { Chevron, Loading } from '../ui';

const STEPS = ['Count due', 'Counted', 'List drafted', 'Sent to family'];

export default function Home({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const name = me.name;
  const [week, setWeek] = useState<Week | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Week>('/api/week').then(setWeek).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="screen body"><p className="error">{error}</p></div>;
  if (!week) return <Loading />;

  const stepIndex = week.status === 'sent' ? 3 : week.status === 'drafted' ? 2 : 0;
  let card: { title: string; body: string; cta: string; to: string };
  if (week.itemCount === 0) {
    card = { title: 'Build your catalog', body: 'Start by photographing each shelf, the fridge and the freezer. The app lists what it sees and you confirm.', cta: 'Add items by photo', to: '/scan' };
  } else if (week.status === 'count_due') {
    card = { title: 'Weekly count is due', body: `Walk the kitchen, shelves, fridge and freezer. ${week.itemCount} items, about 15 minutes. It saves as you go.`, cta: 'Start weekly count', to: '/count' };
  } else if (week.status === 'counting') {
    card = { title: 'Finish the count', body: `${week.counted} of ${week.itemCount} items counted so far. Pick up where you or the other reviewer left off.`, cta: 'Continue count', to: '/count' };
  } else if (week.status === 'drafted') {
    card = { title: 'Review and send the list', body: `${week.lineCount} items on the draft. Check quantities, add one-offs, and send by Thursday.`, cta: 'Review list', to: '/list' };
  } else {
    card = { title: 'List sent to the family', body: `The family has marked ${week.boughtCount} of ${week.lineCount} items bought. Next count after Sunday langar.`, cta: 'View list', to: '/list' };
  }

  async function signOut() {
    await api('/api/logout', { body: {} });
    onSignOut();
  }

  return (
    <div className="screen">
      <div className="header plain" style={{ paddingTop: 24 }}>
        <div className="topbar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p className="muted">Next langar · {weekendLabel(week.serviceDate)}</p>
            <h1 style={{ fontSize: 28 }}>This week</h1>
            <span className={`tag ${me.testing ? 'low' : 'info'}`} style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}>
              {me.testing ? `Test data · ${me.catalogLabel}` : me.catalogLabel}
            </span>
          </div>
          <button type="button" onClick={signOut} aria-label={`Signed in as ${name}. Sign out`} style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: 'var(--navy-soft)', color: 'var(--navy)', fontWeight: 600, cursor: 'pointer' }}>
            {name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
          </button>
        </div>
      </div>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card steps">
          {STEPS.map((label, i) => {
            const done = i < stepIndex || (i === 1 && stepIndex >= 2);
            const now = i === stepIndex;
            return (
              <div key={label} className={`step${done ? ' done' : now ? ' now' : ''}`}>
                <span className="dot">{done ? '✓' : i + 1}</span>
                {label}
                {i === 0 && week.status === 'counting' && <span className="tag info">{week.counted}/{week.itemCount}</span>}
              </div>
            );
          })}
        </div>
        <div className="hero">
          <span className="eyebrow">NEXT STEP</span>
          <h2>{card.title}</h2>
          <p>{card.body}</p>
          <Link className="btn" to={card.to}>{card.cta}</Link>
        </div>
        {week.needsSetup > 0 && (
          <Link to="/catalog" className="banner warn" style={{ textDecoration: 'none' }}>
            {week.needsSetup} item{week.needsSetup === 1 ? ' needs' : 's need'} a minimum and target before they can go on a list.
          </Link>
        )}
        <div className="card" style={{ padding: 0 }}>
          <Link to="/list" className="nav-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 500 }}>Shopping list</span>
              <span className="muted">{week.status === 'sent' ? `Sent · ${week.boughtCount} of ${week.lineCount} bought` : week.status === 'drafted' ? `${week.lineCount} items drafted` : 'Drafts after the count'}</span>
            </span>
            <Chevron />
          </Link>
          <Link to="/catalog" className="nav-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 500 }}>Item catalog</span>
              <span className="muted">{week.itemCount} items · min and target levels</span>
            </span>
            <Chevron />
          </Link>
          <Link to="/scan" className="nav-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 500 }}>Add items by photo</span>
              <span className="muted">Photograph a shelf to add what's on it</span>
            </span>
            <Chevron />
          </Link>
        </div>
      </div>
    </div>
  );
}
