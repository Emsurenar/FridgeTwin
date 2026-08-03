import { daysUntil, parseIsoDate } from './expiry.js';

const MONTHS = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const LOCATIONS = [
  { id: 'fridge', label: 'Kylen' },
  { id: 'freezer', label: 'Frysen' },
  { id: 'pantry', label: 'Skafferiet' },
];

export const locationLabel = (id) => LOCATIONS.find(l => l.id === id)?.label || 'Kylen';

// Plats är inte längre en flik utan en egenskap på raden, och där finns bara
// plats för en bokstav. K/F/S räcker när utrymmena är tre.
const GLYPHS = { fridge: 'K', freezer: 'F', pantry: 'S' };
export const locationGlyph = (id) => GLYPHS[id] || 'K';

const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];

// Dagens datum är referenspunkten för varenda \"om 3 dagar\" på sidan, och hör
// därför hemma överst.
export function fmtToday(now = new Date()) {
  return `${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

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

/*
  Nedräkningen på ett band. Kortare än fmtExpiry — "gick ut för 5 dagar sedan"
  bryter rad på en 320px-skärm och gör bandet en rad högre för varje vara.
  Versalerna sätts i CSS; här handlar det bara om ordmängd.
*/
export function fmtBandExpiry(iso) {
  const days = daysUntil(iso);
  if (days === null) return 'inget datum';
  if (days < -1) return `${Math.abs(days)} dagar sedan`;
  if (days === -1) return 'i går';
  if (days === 0) return 'i dag';
  if (days === 1) return 'i morgon';
  if (days <= 14) return `om ${days} dagar`;
  return fmtDate(iso);
}

/*
  Monogram när produktbild saknas — och den saknas ofta: Open Food Facts har
  inte allt, och lösvikt har ingen streckkod alls. Tjugo identiska paketikoner
  ger noll igenkänning; två bokstäver ur namnet gör varje vara urskiljbar på
  formen även innan man läst den.
*/
export function monogram(name) {
  const ord = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!ord.length) return '?';
  const bokstav = (w) => [...w].find(c => /\p{L}/u.test(c)) || '';
  const forsta = bokstav(ord[0]);
  const andra = ord.length > 1 ? bokstav(ord[1]) : '';
  return (forsta + andra).toUpperCase() || '?';
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
