import { daysUntil, parseIsoDate } from './expiry.js';
import { t, getLang } from './i18n.js';

// Månads- och veckodagsnamn ligger här och inte i ordboken: de är listor, inte
// meningar, och slås upp med index i stället för nyckel.
const MONTHS = {
  sv: ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const WEEKDAYS = {
  sv: ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const manader = () => MONTHS[getLang()] || MONTHS.sv;
const veckodagar = () => WEEKDAYS[getLang()] || WEEKDAYS.sv;

export const LOCATIONS = [
  { id: 'fridge', label: 'Kylen' },
  { id: 'freezer', label: 'Frysen' },
  { id: 'pantry', label: 'Skafferiet' },
];

export const locationLabel = (id) => t(LOCATIONS.find(l => l.id === id)?.label || 'Kylen');

// Plats är inte längre en flik utan en egenskap på raden, och där finns bara
// plats för en bokstav. K/F/S räcker när utrymmena är tre.
const GLYPHS = { fridge: 'K', freezer: 'F', pantry: 'S' };
export const locationGlyph = (id) => GLYPHS[id] || 'K';

// Dagens datum är referenspunkten för varenda "om 3 dagar" på sidan, och hör
// därför hemma överst.
export function fmtToday(now = new Date()) {
  return `${veckodagar()[now.getDay()]} ${now.getDate()} ${manader()[now.getMonth()]}`;
}

export function fmtDate(iso) {
  const d = parseIsoDate(iso);
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${manader()[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

// Kort text för lagerlistan. Håller sig till dagar upp till två veckor —
// "om 3 dagar" säger mer om vad man bör laga i kväll än "om 0,4 veckor".
export function fmtExpiry(iso) {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < -1) return t('gick ut för {n} dagar sedan', { n: Math.abs(days) });
  if (days === -1) return t('gick ut i går');
  if (days === 0) return t('går ut i dag');
  if (days === 1) return t('går ut i morgon');
  if (days <= 14) return t('om {n} dagar', { n: days });
  return fmtDate(iso);
}

// Kort variant för rutorna på hyllan. "går ut i morgon" bryter rad i en 98px
// bred ruta och sabbar rutnätet; "i morgon" säger samma sak på en rad.
export function fmtExpiryShort(iso) {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < -1) return t('{n} d sedan', { n: Math.abs(days) });
  if (days === -1) return t('i går');
  if (days === 0) return t('i dag');
  if (days === 1) return t('i morgon');
  if (days <= 14) return t('{n} dagar', { n: days });
  return fmtDate(iso);
}

/*
  Nedräkningen på ett band. Kortare än fmtExpiry — "gick ut för 5 dagar sedan"
  bryter rad på en 320px-skärm och gör bandet en rad högre för varje vara.
  Versalerna sätts i CSS; här handlar det bara om ordmängd.
*/
export function fmtBandExpiry(iso) {
  const days = daysUntil(iso);
  if (days === null) return t('inget datum');
  if (days < -1) return t('{n} dagar sedan', { n: Math.abs(days) });
  if (days === -1) return t('i går');
  if (days === 0) return t('i dag');
  if (days === 1) return t('i morgon');
  if (days <= 14) return t('om {n} dagar', { n: days });
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
  item.count > 1 ? t('{n} st', { n: item.count }) : (item.quantity || '');

// Tidsstämpel i receptloggen. Klockslag är det som skiljer två körningar samma
// kväll åt, så det står alltid med — datumet bara när det inte är i dag.
export function fmtLogTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('i dag {time}', { time });
  if (d.toDateString() === yesterday.toDateString()) return t('i går {time}', { time });
  return `${d.getDate()} ${manader()[d.getMonth()]} ${time}`;
}
