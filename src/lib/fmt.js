import { daysUntil, parseIsoDate } from './expiry.js';

const MONTHS = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const LOCATIONS = [
  { id: 'fridge', label: 'Kylen' },
  { id: 'freezer', label: 'Frysen' },
  { id: 'pantry', label: 'Skafferiet' },
];

export const locationLabel = (id) => LOCATIONS.find(l => l.id === id)?.label || 'Kylen';

export function fmtDate(iso) {
  const d = parseIsoDate(iso);
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

// Kort text för lagerlistan. Håller sig till dagar upp till två veckor —
// "om 3 dagar" säger mer om vad man bör laga i kväll än "om 0,4 veckor".
export function fmtExpiry(iso) {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < -1) return `gick ut för ${Math.abs(days)} dagar sedan`;
  if (days === -1) return 'gick ut i går';
  if (days === 0) return 'går ut i dag';
  if (days === 1) return 'går ut i morgon';
  if (days <= 14) return `om ${days} dagar`;
  return fmtDate(iso);
}

// Kort variant för rutorna på hyllan. "går ut i morgon" bryter rad i en 98px
// bred ruta och sabbar rutnätet; "i morgon" säger samma sak på en rad.
export function fmtExpiryShort(iso) {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < -1) return `${Math.abs(days)} d sedan`;
  if (days === -1) return 'i går';
  if (days === 0) return 'i dag';
  if (days === 1) return 'i morgon';
  if (days <= 14) return `${days} dagar`;
  return fmtDate(iso);
}

export const fmtCount = (item) =>
  item.count > 1 ? `${item.count} st` : (item.quantity || '');

// Tidsstämpel i receptloggen. Klockslag är det som skiljer två körningar samma
// kväll åt, så det står alltid med — datumet bara när det inte är i dag.
export function fmtLogTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `i dag ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `i går ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
}
