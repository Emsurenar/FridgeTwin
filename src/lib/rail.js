/*
  Streckkoden — kylskåpets framtid ritad som den kod appen är byggd för att läsa.

  En kolumn per dygn. Varje vara är ett streck på sin bäst före-dag, och höjden
  är hur många varor som ligger där. Ett tätt svart parti är fem saker som dör
  samma torsdag; ett glest fält är en lugn vecka. Man ser hela hushållet — kyl,
  frys och skafferi på en gång — innan man läst ett ord.

  Rena funktioner här, ritandet i Rail.jsx. Fönstret är −7 till +14 dygn: längre
  bak än så är maten inte längre ett beslut utan ett faktum, och längre fram är
  varje dag likgiltig. Allt utanför samlas i "senare" och "utan datum", som är
  egna kolumner just för att de är egna sorters svar.
*/
import { daysUntil, expiryState, isUrgent } from './expiry.js';

export const RAIL_PAST = 7;
export const RAIL_FUTURE = 14;

export function railColumns(items, now = new Date()) {
  const days = [];
  for (let offset = -RAIL_PAST; offset <= RAIL_FUTURE; offset++) {
    days.push({ key: `d${offset}`, offset, items: [] });
  }
  const later = { key: 'later', offset: null, items: [] };
  const none = { key: 'none', offset: null, items: [] };

  for (const item of items) {
    const d = daysUntil(item.expiresOn, now);
    if (d === null) { none.items.push(item); continue; }
    if (d > RAIL_FUTURE) { later.items.push(item); continue; }
    // Äldre än en vecka staplas på vänsterkanten i stället för att falla ur
    // bilden — att något ruttnat länge ska synas, inte tigas ihjäl.
    days[Math.max(d, -RAIL_PAST) + RAIL_PAST].items.push(item);
  }

  return { days, later, none };
}

// Kolumnens färg styrs av det mest brådskande den innehåller. En dag med både
// en passerad och en pigg vara är en dag med en passerad vara.
export function columnState(column, now = new Date()) {
  let worst = 'ok';
  const rank = { expired: 4, today: 3, soon: 2, week: 1, ok: 0, none: 0 };
  for (const item of column.items) {
    const state = expiryState(item.expiresOn, now);
    if (rank[state] > rank[worst]) worst = state;
  }
  return worst;
}

// Högsta stapeln i bilden — skalan är relativ till det egna kylskåpet, för
// "mycket" betyder olika saker för en student och ett femmannahushåll.
export const tallestColumn = ({ days, later }) =>
  Math.max(1, ...days.map(c => c.items.length), later.items.length);

/*
  Kön: det man ska göra något åt, tvärs alla tre utrymmen.

  Det är här den gamla vyns funktionella brist dör. Tidigare krävdes tre
  luckbyten för att se allt som brådskade; nu är plats en egenskap på raden i
  stället för ett läge man växlar mellan.
*/
export function queueSections(items, now = new Date()) {
  const attGora = [];
  const veckan = [];
  const utanDatum = [];
  const resten = [];

  for (const item of items) {
    const state = expiryState(item.expiresOn, now);
    if (state === 'none') utanDatum.push(item);
    else if (isUrgent(state)) attGora.push(item);
    else if (state === 'week') veckan.push(item);
    else resten.push(item);
  }
  return { attGora, veckan, utanDatum, resten };
}
