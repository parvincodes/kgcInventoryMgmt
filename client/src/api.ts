export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong. Try again.');
  return data as T;
}

export type Item = {
  id: number;
  name: string;
  namePa: string | null;
  location: string;
  unit: string;
  mode: 'num' | 'lvl';
  min: number | null;
  target: number | null;
  expiryDate: string | null;
  currentNum: number;
  currentLevel: 'Full' | 'Half' | 'Low' | 'Out';
  needsSetup: boolean;
  belowMin: boolean;
  hasPhoto: boolean;
  counted?: boolean;
};

/** Who is signed in, and which catalog their PIN opened. */
export type Me = {
  name: string;
  catalog: 'prod' | 'test';
  catalogLabel: string;
  testing: boolean;
};

export type Week = {
  id: number;
  serviceDate: string;
  status: 'count_due' | 'counting' | 'drafted' | 'sent';
  countedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string;
  shareToken: string;
  itemCount: number;
  needsSetup: number;
  counted: number;
  belowMin: number;
  lineCount: number;
  boughtCount: number;
};

export type Line = {
  id: number;
  itemId: number | null;
  name: string;
  namePa: string | null;
  unit: string;
  reason: string;
  suggested: number;
  qty: number;
  oneOff: boolean;
  removed: boolean;
  bought: boolean;
  boughtQty: number | null;
};

export const LOCATIONS = ['Kitchen', 'Shelves', 'Fridge', 'Freezer'] as const;
export const LEVELS = ['Full', 'Half', 'Low', 'Out'] as const;

export function weekendLabel(serviceDate: string) {
  const [y, m, d] = serviceDate.split('-').map(Number);
  const sat = new Date(y, m - 1, d);
  const sun = new Date(y, m - 1, d + 1);
  const mon = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short' });
  return sat.getMonth() === sun.getMonth()
    ? `Sat–Sun, ${mon(sat)} ${sat.getDate()}–${sun.getDate()}`
    : `Sat–Sun, ${mon(sat)} ${sat.getDate()} – ${mon(sun)} ${sun.getDate()}`;
}

export function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function expirySoon(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const exp = new Date(y, m - 1, d);
  const days = Math.round((exp.getTime() - Date.now()) / 86400000);
  if (days > 14) return null;
  const label = exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return days < 0 ? `Expired ${label}` : `Use by ${label}`;
}
