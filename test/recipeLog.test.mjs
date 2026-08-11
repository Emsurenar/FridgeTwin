import test from 'node:test';
import assert from 'node:assert/strict';

/*
  Receptloggen bor i localStorage, som inte finns i Node. Stubben nedan är
  medvetet enkel men kan det enda som är intressant att testa: att kasta när
  kvoten är full. Det är där de riktiga buggarna suttit — koden runt omkring
  körs bara när något redan gått fel, och den vägen tar man aldrig för hand.
*/
function stubLocalStorage({ maxBytes = Infinity } = {}) {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    // En byte-gräns och inte en räknare: det är så en riktig kvot beter sig,
    // och det är skillnaden som avgör om halveringen räddar skrivningen.
    setItem: (k, v) => {
      if (String(v).length > maxBytes) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
  return data;
}

const post = (id) => ({ id, at: '2026-08-04T10:00:00.000Z', meal: 'any', request: '', recipes: [{ title: 'Rätt ' + id }] });

// Modulen läser localStorage först vid anrop, men importen ska ändå ske efter
// att stubben finns — annars kastar en framtida toppnivåläsning i tysthet.
stubLocalStorage();
const { loadLog, addEntry, addChat, removeEntry, clearLog } = await import('../src/lib/recipeLog.js');

test('en post sparas och läses tillbaka', () => {
  stubLocalStorage();
  const log = addEntry([], post('a'));
  assert.equal(log.length, 1);
  assert.equal(loadLog()[0].id, 'a');
});

test('nyast först', () => {
  stubLocalStorage();
  let log = addEntry([], post('a'));
  log = addEntry(log, post('b'));
  assert.deepEqual(log.map(e => e.id), ['b', 'a']);
});

test('loggen kapas vid 20 poster', () => {
  stubLocalStorage();
  let log = [];
  for (let i = 0; i < 25; i++) log = addEntry(log, post('nr' + i));
  assert.equal(log.length, 20);
  assert.equal(log[0].id, 'nr24', 'den nyaste ska överleva kapningen');
});

/*
  Regressionen: kvoten tar slut när loggen har exakt en post. floor(1/2) gav
  noll, så den post man precis betalat tokens för kastades bort i försöket att
  göra plats åt den.
*/
/*
  Gränsen är satt så att en tom lista ("[]", två tecken) får plats men posten
  inte gör det. Det är precis det läget som avslöjar buggen: den gamla koden
  halverade en ettapostslogg till noll, lyckades skriva den tomma listan, och
  rapporterade sedan tillbaka en tom logg som om allt gått bra. Med en gräns på
  noll hade båda varianterna sett likadana ut, eftersom även "[]" nekats.
*/
test('full kvot får aldrig nolla en logg med en enda post', () => {
  const data = stubLocalStorage({ maxBytes: 8 });
  const log = addEntry([], post('dyrbar'));
  assert.equal(log.length, 1, 'posten ska finnas kvar i minnet');
  assert.equal(log[0].id, 'dyrbar');
  assert.notEqual(data.get('fridge_twin_recipe_log'), '[]', 'en tom logg får aldrig skrivas ner över posten');
});

test('full kvot halverar men behåller den nyaste', () => {
  stubLocalStorage();
  let log = [];
  for (let i = 0; i < 6; i++) log = addEntry(log, post('nr' + i));

  // Sätt gränsen så att sju poster inte får plats men tre gör det — då är det
  // halveringen, och inte tur, som avgör vad som blir kvar.
  const sju = JSON.stringify([post('ny'), ...log]).length;
  const tre = JSON.stringify([post('ny'), ...log].slice(0, 3)).length;
  assert.ok(tre < sju, 'testet förutsätter att halva loggen är mindre än hela');
  stubLocalStorage({ maxBytes: Math.floor((sju + tre) / 2) });

  const efter = addEntry(log, post('ny'));
  assert.equal(efter.length, 3, 'sju poster ska ha halverats till tre');
  assert.equal(efter[0].id, 'ny', 'den nya posten ska vara kvar');
  assert.equal(loadLog()[0].id, 'ny', 'och den ska ha nått lagringen');
});

test('poster utan id läses inte in — de går inte att glömma bort igen', () => {
  const data = stubLocalStorage();
  data.set('fridge_twin_recipe_log', JSON.stringify([
    { id: 'ok', recipes: [{ title: 'A' }] },
    { recipes: [{ title: 'B' }] },       // saknar id
    { id: 'tom', recipes: [] },          // inga recept
    'skräp',
  ]));
  assert.deepEqual(loadLog().map(e => e.id), ['ok']);
});

test('trasig JSON ger tom logg i stället för att kasta', () => {
  const data = stubLocalStorage();
  data.set('fridge_twin_recipe_log', '{inte json');
  assert.deepEqual(loadLog(), []);
});

/*
  Frågorna sparas i loggen av samma skäl som recepten själva: svaret kostade
  tokens, och ett flikbyte eller en omladdning får inte kasta bort det.
*/
test('en fråga hamnar på rätt recept och lämnar grannarna i fred', () => {
  stubLocalStorage();
  const entry = { ...post('a'), recipes: [{ title: 'Soppa' }, { title: 'Paj' }] };
  let log = addEntry([], entry);
  log = addChat(log, 'a', 1, { q: 'Kan jag ta frusen spenat?', a: 'Ja.' });
  assert.equal(log[0].recipes[0].chat, undefined, 'grannreceptet ska inte röras');
  assert.deepEqual(log[0].recipes[1].chat, [{ q: 'Kan jag ta frusen spenat?', a: 'Ja.' }]);
});

test('en andra fråga läggs efter den första', () => {
  stubLocalStorage();
  let log = addEntry([], post('a'));
  log = addChat(log, 'a', 0, { q: 'ett', a: 'svar ett' });
  log = addChat(log, 'a', 0, { q: 'två', a: 'svar två' });
  assert.deepEqual(log[0].recipes[0].chat.map(c => c.q), ['ett', 'två']);
});

test('svaret når lagringen, inte bara minnet', () => {
  const data = stubLocalStorage();
  let log = addEntry([], post('a'));
  addChat(log, 'a', 0, { q: 'fråga', a: 'svar' });
  const sparad = JSON.parse(data.get('fridge_twin_recipe_log'));
  assert.deepEqual(sparad[0].recipes[0].chat, [{ q: 'fråga', a: 'svar' }]);
});

// Posten kan ha glömts bort medan frågan var i luften. Då finns det ingenstans
// att lägga svaret, och loggen ska lämnas som den är i stället för att kasta.
test('okänd post lämnar loggen orörd', () => {
  stubLocalStorage();
  const log = addEntry([], post('a'));
  assert.deepEqual(addChat(log, 'finns-inte', 0, { q: 'x', a: 'y' }), log);
});

test('glöm bort en post lämnar de andra i fred', () => {
  stubLocalStorage();
  let log = addEntry([], post('a'));
  log = addEntry(log, post('b'));
  assert.deepEqual(removeEntry(log, 'a').map(e => e.id), ['b']);
});

test('rensa tömmer både minnet och lagringen', () => {
  const data = stubLocalStorage();
  addEntry([], post('a'));
  assert.deepEqual(clearLog(), []);
  assert.equal(data.has('fridge_twin_recipe_log'), false);
});
