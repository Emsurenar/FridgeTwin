// Utgångslogik — rena funktioner, testade i test/expiry.test.mjs.
//
// Allt räknas i *kalenderdagar i lokal tid*, inte i millisekunder. En vara som
// går ut i morgon ska säga "i morgon" oavsett om klockan är 08:00 eller 23:50,
// och 'YYYY-MM-DD' får aldrig tolkas som UTC (då blir det fel dygn i Sverige).

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' → Date vid lokal midnatt.
export function parseIsoDate(iso) {
  if (!ISO_DATE_RE.test(iso || '')) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Fångar 2026-02-31 och liknande: JS rullar över till mars i stället för att klaga.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export const toIsoDate = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
};

export const addDays = (date, days) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
};

export const todayIso = (now = new Date()) => toIsoDate(now);

// Antal hela kalenderdagar kvar. 0 = går ut i dag, negativt = redan passerat.
export function daysUntil(iso, now = new Date()) {
  const target = parseIsoDate(iso);
  if (!target) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Dela på hela dygn i lokal tid. Vid sommartidsbyte är ett dygn 23 eller 25
  // timmar, så avrundningen är avsiktlig — annars tappar man en dag i mars.
  return Math.round((target - start) / 86400000);
}

/*
  Fem lägen, i den ordning de bör dra blicken till sig:
    expired  redan passerat
    today    går ut i dag
    soon     inom 3 dagar — det är här man faktiskt kan rädda maten
    week     inom en vecka
    ok       längre fram
    none     inget datum satt
*/
export function expiryState(iso, now = new Date()) {
  const days = daysUntil(iso, now);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  if (days <= 7) return 'week';
  return 'ok';
}

export const isUrgent = (state) => state === 'expired' || state === 'today' || state === 'soon';

/*
  Vilken hylla varan hamnar på. Hyllorna är hela ordningsprincipen i kylskåpet:
  det som brådskar ligger i ögonhöjd, resten längre ner. Datumlösa varor hamnar
  längst ner — de kan ändå inte gå ut.
*/
export const SHELVES = [
  { id: 'now', label: 'Ät snart' },
  { id: 'week', label: 'Den här veckan' },
  { id: 'later', label: 'Håller sig' },
];

export function shelfOf(item, now = new Date()) {
  const state = expiryState(item.expiresOn, now);
  if (isUrgent(state)) return 'now';
  if (state === 'week') return 'week';
  return 'later';
}

// Sortering för lagerlistan: närmast utgång först, saknat datum sist.
export function byExpiry(a, b) {
  const da = daysUntil(a.expiresOn);
  const db = daysUntil(b.expiresOn);
  if (da === null && db === null) return (b.addedAt || '').localeCompare(a.addedAt || '');
  if (da === null) return 1;
  if (db === null) return -1;
  if (da !== db) return da - db;
  return a.name.localeCompare(b.name, 'sv');
}

// Sammanfattning till bannern på hemskärmen.
export function expirySummary(items, now = new Date()) {
  let expired = 0;
  let urgent = 0; // i dag + inom 3 dagar
  for (const item of items) {
    const state = expiryState(item.expiresOn, now);
    if (state === 'expired') expired += 1;
    else if (state === 'today' || state === 'soon') urgent += 1;
  }
  return { expired, urgent, total: items.length };
}
