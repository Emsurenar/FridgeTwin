/*
  Betyg på rätter, och hur de påverkar nästa förslag.

  Poängen är inte att samla stjärnor utan att modellen ska sluta föreslå sådant
  hushållet inte tycker om. Ett betyg är alltså indata till nästa prompt, inte
  en statistiksida.

  Egen lagringspost och inte en del av receptloggen: loggen rensas när den blir
  lång, och betygen är det enda i den som är värt att behålla för alltid. Nyckeln
  är rättens namn i normaliserad form, för det är det enda modellen ger oss som
  är stabilt mellan två körningar — den har inga id:n.
*/

const STORAGE = 'fridge_twin_ratings';
const MAX = 200;

export const MIN_BETYG = 1;
export const MAX_BETYG = 5;

// Samma rätt kan komma tillbaka med annat skiftläge eller extra blanksteg.
export const rattNyckel = (title) =>
  String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function loadRatings() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(map) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(map));
  } catch { /* full kvot eller privat läge — betyg är en bonus, inte ett krav */ }
  return map;
}

/*
  Sätt eller ta bort ett betyg. Att trycka på samma stjärna igen nollställer,
  för ett felaktigt betyg som inte går att ta tillbaka blir ett fel som styr
  förslagen för alltid.
*/
export function setRating(map, title, betyg) {
  const nyckel = rattNyckel(title);
  if (!nyckel) return map;

  const next = { ...map };
  if (!betyg || map[nyckel]?.betyg === betyg) {
    delete next[nyckel];
    return write(next);
  }

  next[nyckel] = {
    titel: String(title).slice(0, 120),
    betyg: Math.min(MAX_BETYG, Math.max(MIN_BETYG, Math.round(betyg))),
    at: new Date().toISOString(),
  };

  // Taket är ett skydd mot att posten växer i evighet. Det äldsta ryker först.
  const poster = Object.entries(next);
  if (poster.length > MAX) {
    poster.sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
    return write(Object.fromEntries(poster.slice(0, MAX)));
  }
  return write(next);
}

export const getRating = (map, title) => map[rattNyckel(title)]?.betyg || 0;

/*
  Vad modellen får veta.

  Bara ytterlägena skickas med. En trea betyder "gick bra" och säger ingenting
  om vad man vill ha mer eller mindre av; skickar man med allt blir listan lång
  och signalen svag. Nyast först, för smaken ändrar sig.
*/
export function ratingsForPrompt(map, max = 8) {
  const alla = Object.values(map || {})
    .filter(r => r && r.titel && r.betyg)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const gillade = alla.filter(r => r.betyg >= 4).slice(0, max);
  const ogillade = alla.filter(r => r.betyg <= 2).slice(0, max);
  return { gillade, ogillade };
}
