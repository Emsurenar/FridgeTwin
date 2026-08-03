/*
  Lokal spegel av lagret.

  Servern är normalt sanningen. Men utan TURSO_URL bor dess databas i /tmp, och
  på Vercel är den katalogen per lambda-instans — två anrop kan träffa två olika
  tomma databaser. Då ser det ut som att varor försvinner när man byter utrymme,
  fast det som händer är att man växlar mellan flera lager.

  Därför den här spegeln: när servern själv säger att den inte minns
  (/api/health → persistent: false) litar appen på telefonen i stället och
  lägger tillbaka det servern tappat.

  Spegeln används *bara* i det läget. Med Turso inkopplat är servern sanningen
  och spegeln rörs inte, för då är en återläggning inte en räddning utan ett sätt
  att återuppväcka varor någon annan i hushållet medvetet tagit bort.
*/

const STORAGE = 'fridge_twin_mirror';

export function loadMirror() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(i => i && i.id && i.name) : [];
  } catch {
    return [];
  }
}

export function saveMirror(items) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(items));
  } catch { /* full kvot eller privat läge — spegeln är en bonus, inte ett krav */ }
}

export const clearMirror = () => {
  try {
    localStorage.removeItem(STORAGE);
  } catch { /* inget att göra åt */ }
};

/*
  Vad servern saknar jämfört med spegeln.

  Jämförelsen går på id och inget annat. Namn och plats ändras; id:t är samma rad
  hela vägen, och det är också det som gör återläggningen idempotent på servern.
*/
export function missingFromServer(mirror, serverItems) {
  const known = new Set(serverItems.map(i => i.id));
  return mirror.filter(i => !known.has(i.id));
}
