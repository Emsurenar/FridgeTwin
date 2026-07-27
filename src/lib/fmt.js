import { daysUntil, parseIsoDate } from './expiry';

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

export const fmtCount = (item) =>
  item.count > 1 ? `${item.count} st` : (item.quantity || '');
