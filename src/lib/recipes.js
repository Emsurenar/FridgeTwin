/*
  Koppla ihop ett recept med lagret.

  Modellen svarar med ingrediensnamn i fritext ("färsk spenat", "ägg"), medan
  lagret har varunamn ur Open Food Facts ("Färsk spenat", "Ägg 12-pack"). Går de
  att para ihop kan förslaget visa vilka av *dina* varor rätten tömmer — med
  samma monogram som i kön, så rätten läser som en hylla som töms i stället för
  som en lista med ord.

  Ren funktion och egen fil för att matchningen är det som faktiskt kan bli fel.
*/

const norm = (s) => String(s || '').toLowerCase().trim();

/*
  Namnet uppdelat i ord. \b i JavaScript är ASCII-baserat och tappar å, ä och ö,
  så ordgränserna dras med en Unicode-medveten uppdelning i stället.
*/
const ord = (s) => norm(s).split(/[^\p{L}\p{N}%]+/u).filter(Boolean);

const arDelmangd = (liten, stor) => liten.every(o => stor.includes(o));

/*
  En ingrediens paras med en vara när alla dess ord finns i varans namn, eller
  tvärtom. Ordgränser och inte delsträngar: "ägg" ska hitta "Ägg 12-pack", men
  "ost" ska *inte* hitta "Ostbågar" — och en längdgräns klarar bara det ena.

  Fel träff är dyrare än ingen träff: användaren tror att en vara är inräknad
  när den inte är det, och låter bli att handla. Tveksamma fall lämnas därför
  omatchade och visas som ren text.
*/
export function matchUses(uses, items = []) {
  return (uses || []).map(use => {
    const u = ord(use);
    if (!u.length) return { label: use, item: null };

    const exakt = items.find(i => norm(i.name) === norm(use));
    if (exakt) return { label: use, item: exakt };

    const traff = items.find(i => {
      const n = ord(i.name);
      return arDelmangd(u, n) || arDelmangd(n, u);
    });
    return { label: use, item: traff || null };
  });
}

// Hur mycket av rätten som redan står hemma. Noll matchningar betyder att
// förslaget inte rör lagret alls, och då är "tömmer" fel rubrik.
export const matchCount = (matched) => matched.filter(m => m.item).length;
