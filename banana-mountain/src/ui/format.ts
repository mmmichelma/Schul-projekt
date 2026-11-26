export { formatMoney } from '../render/effects';

export function fmtInt(n: number): string {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtNum(n: number, digits = 1): string {
  if (n >= 1000) return fmtInt(n);
  return n.toFixed(digits).replace('.', ',');
}

export function fmtPct(f: number, digits = 2): string {
  return (f * 100).toFixed(digits).replace('.', ',') + ' %';
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '–';
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 99) return `${Math.floor(h / 24)} Tage`;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} h` : `${m}:${String(s).padStart(2, '0')} min`;
}
