/*
  Receptloggen.

  Förslagen kostar tokens att ta fram, och tidigare låg de i RecipesViews eget
  tillstånd — ett tryck på "Kylskåpet" avmonterade vyn och allt var borta. Nu
  bor de här i stället, så de överlever både navigering och omladdning.

  localStorage och inte servern, av två skäl: loggen är personlig snarare än
  delad (hushållet vill sällan se varandras gamla förslag), och den ska fungera
  även när serverns lagring krånglar — vilket är precis då man är som minst
  hjälpt av att också förlora recepten.
*/

const STORAGE = 'fridge_twin_recipe_log';
const MAX_ENTRIES = 20;

// Varje läsning och skrivning är omgärdad: localStorage kastar i privat läge
// och när kvoten är full, och en trasig logg får aldrig sänka receptvyn.
export function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // id krävs: utan det går posten inte att glömma bort igen, och ett saknat
    // id matchar dessutom alla andra saknade id:n när man försöker.
    return parsed.filter(e => e && typeof e.id === 'string'
      && Array.isArray(e.recipes) && e.recipes.length);
  } catch {
    return [];
  }
}

function write(log) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(log));
    return log;
  } catch {
    /*
      Full kvot: halvera loggen och försök en gång till innan vi ger upp.

      Golvet på ett är inte kosmetik. Den nyaste posten ligger först, och med
      en logg på en enda post gav floor(1/2) noll — man betalade för förslagen
      och fick en tom logg tillbaka, vilket är det enda utfall som är sämre än
      att inte spara alls.
    */
    const trimmed = log.slice(0, Math.max(1, Math.floor(log.length / 2)));
    try {
      localStorage.setItem(STORAGE, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return log; // inget nådde lagringen — minnet får duga sessionen ut
    }
  }
}

export function addEntry(log, entry) {
  return write([entry, ...log].slice(0, MAX_ENTRIES));
}

export function removeEntry(log, id) {
  return write(log.filter(e => e.id !== id));
}

export function clearLog() {
  try {
    localStorage.removeItem(STORAGE);
  } catch { /* inget att göra åt */ }
  return [];
}

export const newEntryId = () =>
  (crypto.randomUUID?.() || String(Date.now() + Math.random()));
