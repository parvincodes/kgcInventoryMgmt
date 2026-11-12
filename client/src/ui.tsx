import { useNavigate } from 'react-router-dom';

export function Back({ to = '/', label = 'Back' }: { to?: string; label?: string }) {
  const nav = useNavigate();
  return (
    <button type="button" className="icon-btn" aria-label={label} onClick={() => nav(to)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

export function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#55524C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CameraIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function Stepper({ value, onChange, min = 0, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="val">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span className={`switch${on ? ' on' : ''}`} aria-hidden="true">
      <span />
    </span>
  );
}

export function Loading() {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  );
}
