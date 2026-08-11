/*
  "Har jag redan den här?" — svaret skannern behöver vid varje träff.

  Egen modul och inte en hjälpare inuti ScannerView, för det är den delen som
  faktiskt kan bli fel: vilken förpackning som ska räknas ner när man skannar en
  tom påse. Rena funktioner går att testa; en vy som kräver kamera och en riktig
  streckkod gör det inte.
*/
// Explicita .js-ändelser: Vite klarar sig utan, men node:test gör det inte,
// och de här funktionerna ska gå att testa utan bundler.
import { byExpiry } from './expiry.js';
import { locationLabel } from './fmt.js';
import { t } from './i18n.js';

/*
  Varorna man redan har av en streckkod, med det som går ut först överst.

  Ordningen är hela poängen: det är den förpackningen man äter upp härnäst, och
  alltså den som ska räknas ner. Räknade vi ner den med längst hållbarhet skulle
  appen tömma fel paket och lämna kvar det som hinner bli dåligt.

  Utan streckkod ges inget svar alls. Namnmatchning hade gett falska träffar
  ("Ost" är inte samma vara som "Ost"), och en felaktig "du har redan den här"
  är värre än ingen upplysning.
*/
export function alreadyHome(items, barcode) {
  if (!barcode) return [];
  return items.filter(i => i.barcode === barcode).sort(byExpiry);
}

// "2 st i kylen · 1 st i frysen" — antal per utrymme, i den ordning de dyker upp.
export function summarize(list) {
  const perLocation = new Map();
  for (const item of list) {
    perLocation.set(item.location, (perLocation.get(item.location) || 0) + item.count);
  }
  return [...perLocation]
    .map(([location, n]) => t('{n} st i {place}', { n, place: locationLabel(location).toLowerCase() }))
    .join(' · ');
}

export const totalCount = (list) => list.reduce((n, i) => n + i.count, 0);
