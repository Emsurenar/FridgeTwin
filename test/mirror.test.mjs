import test from 'node:test';
import assert from 'node:assert/strict';

// Spegeln läser localStorage vid anrop, så stubben måste finnas före importen.
function stubLocalStorage(start = null) {
  const data = new Map();
  if (start !== null) data.set('fridge_twin_mirror', JSON.stringify(start));
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  return () => {
    const raw = data.get('fridge_twin_mirror');
    return raw ? JSON.parse(raw) : null;
  };
}
stubLocalStorage();

const { missingFromServer, loadMirror, saveMirror, clearMirror } = await import('../src/lib/mirror.js');

// Spegeln är sista försvaret när serverns lagring inte minns. Jämför den fel
// lägger appen tillbaka varor som medvetet tagits bort — eller låter bli att
// lägga tillbaka det som faktiskt gått förlorat.

const vara = (id, over = {}) => ({ id, name: 'Mjölk', location: 'fridge', count: 1, ...over });

test('det servern saknar plockas ut, resten lämnas', () => {
  const spegel = [vara('a'), vara('b'), vara('c')];
  const server = [vara('b')];
  assert.deepEqual(missingFromServer(spegel, server).map(i => i.id), ['a', 'c']);
});

test('inget saknas när servern har allt', () => {
  const spegel = [vara('a'), vara('b')];
  assert.deepEqual(missingFromServer(spegel, [vara('a'), vara('b')]), []);
});

test('en tom server betyder att hela spegeln ska tillbaka', () => {
  const spegel = [vara('a'), vara('b')];
  assert.equal(missingFromServer(spegel, []).length, 2);
});

test('en tom spegel lägger aldrig tillbaka något', () => {
  assert.deepEqual(missingFromServer([], [vara('a')]), []);
  assert.deepEqual(missingFromServer([], []), []);
});

/*
  Jämförelsen går på id och ingenting annat. En vara som bytt namn, plats eller
  antal på servern är fortfarande samma rad — hade vi jämfört på innehåll hade
  varje redigering från en annan enhet sett ut som en förlust och lagts tillbaka
  som en dubblett.
*/
test('ändrad vara räknas som samma rad', () => {
  const spegel = [vara('a', { name: 'Mjölk', location: 'fridge', count: 1 })];
  const server = [vara('a', { name: 'Lättmjölk', location: 'pantry', count: 9 })];
  assert.deepEqual(missingFromServer(spegel, server), []);
});

/*
  Spegeln har en enda lagringsplats och bär ett hushåll i taget. Det gör
  nyckelbytet till appens farligaste ögonblick: hämtningen för den nya nyckeln
  svarar tomt, och skrevs det tomma svaret rakt av försvann det förra hushållets
  enda kopia. Dialogrutan lovar uttryckligen att man kan ta sig tillbaka med sin
  gamla nyckel — testerna nedan är det löftet.
*/

test('spegeln lämnas ut bara under sin egen nyckel', () => {
  stubLocalStorage({ key: 'ft-a', items: [vara('a'), vara('b')] });
  assert.equal(loadMirror('ft-a').length, 2);
  assert.deepEqual(loadMirror('ft-b'), [], 'ett annat hushåll ska inte se varorna');
});

test('ett nytt tomt hushåll skriver INTE över det förra hushållets spegel', () => {
  const las = stubLocalStorage({ key: 'ft-a', items: [vara('a'), vara('b'), vara('c')] });
  // Byt nyckel, hämta lagret för det nya hushållet — det är tomt.
  saveMirror('ft-b', []);
  const kvar = las();
  assert.equal(kvar.key, 'ft-a', 'hushåll A ska fortfarande äga spegeln');
  assert.equal(kvar.items.length, 3, 'A:s varor ska vara orörda');
  assert.equal(loadMirror('ft-a').length, 3, 'och gå att få tillbaka med den gamla nyckeln');
});

test('men ett tomt eget lager får tömma sin egen spegel', () => {
  const las = stubLocalStorage({ key: 'ft-a', items: [vara('a')] });
  saveMirror('ft-a', []); // man har ätit upp allt
  assert.deepEqual(las(), { key: 'ft-a', items: [] });
});

test('ett nytt hushåll med varor tar över platsen', () => {
  const las = stubLocalStorage({ key: 'ft-a', items: [vara('a')] });
  saveMirror('ft-b', [vara('x'), vara('y')]);
  assert.equal(las().key, 'ft-b');
  assert.equal(las().items.length, 2);
});

test('första spegeln kan alltid skrivas, även tom', () => {
  const las = stubLocalStorage();
  saveMirror('ft-a', []);
  assert.deepEqual(las(), { key: 'ft-a', items: [] });
});

test('trasig lagring ger tom spegel i stället för att kasta', () => {
  stubLocalStorage();
  globalThis.localStorage.setItem('fridge_twin_mirror', '{inte json');
  assert.deepEqual(loadMirror('ft-a'), []);
});

test('halvfärdiga rader sållas bort', () => {
  stubLocalStorage({ key: 'ft-a', items: [vara('a'), { id: 'b' }, { name: 'utan id' }, null] });
  assert.deepEqual(loadMirror('ft-a').map(i => i.id), ['a']);
});

test('rensning tömmer platsen helt', () => {
  const las = stubLocalStorage({ key: 'ft-a', items: [vara('a')] });
  clearMirror();
  assert.equal(las(), null);
});
