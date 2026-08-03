import test from 'node:test';
import assert from 'node:assert/strict';
import { matchUses, matchCount } from '../src/lib/recipes.js';

// Matchar den fel tror användaren att en vara är inräknad när den inte är det,
// och går till affären i onödan — eller värre, låter bli att gå.

const vara = (name) => ({ id: name, name, location: 'fridge', count: 1 });

test('exakt namn matchar', () => {
  const m = matchUses(['Färsk spenat'], [vara('Färsk spenat')]);
  assert.equal(m[0].item.name, 'Färsk spenat');
});

test('matchningen är skiftlägesokänslig och tål blanksteg', () => {
  const m = matchUses(['  FÄRSK SPENAT '], [vara('Färsk spenat')]);
  assert.equal(m[0].item.name, 'Färsk spenat');
});

test('varunamnet får vara längre än ingrediensen', () => {
  // "ägg" är ett helt ord i "Ägg 12-pack" — och svenska bokstäver får inte
  // tappas bort av ordgränsen
  assert.equal(matchUses(['ägg'], [vara('Ägg 12-pack')])[0].item.name, 'Ägg 12-pack');
  assert.equal(matchUses(['gräddfil'], [vara('Arla Gräddfil 5%')])[0].item.name, 'Arla Gräddfil 5%');
  assert.equal(matchUses(['smör'], [vara('Smör Normalsaltat')])[0].item.name, 'Smör Normalsaltat');
});

test('delsträng mitt i ett ord är ingen träff', () => {
  // "ost" i "Ostbågar" är en slumpträff, inte samma vara
  assert.equal(matchUses(['ost'], [vara('Ostbågar')])[0].item, null);
  assert.equal(matchUses(['lax'], [vara('Laxeringsmedel')])[0].item, null);
  assert.equal(matchUses(['ris'], [vara('Rismjöl')])[0].item, null);
});

test('flerordig ingrediens kräver att alla orden finns', () => {
  assert.equal(matchUses(['färsk spenat'], [vara('Färsk spenat')])[0].item.name, 'Färsk spenat');
  assert.equal(matchUses(['fryst spenat'], [vara('Färsk spenat')])[0].item, null);
});

test('ingrediens som inte finns hemma lämnas omatchad', () => {
  const m = matchUses(['citron'], [vara('Halloumi')]);
  assert.deepEqual(m, [{ label: 'citron', item: null }]);
});

test('etiketten behålls ordagrant även vid träff', () => {
  const m = matchUses(['gräddfil'], [vara('Arla Gräddfil 5%')]);
  assert.equal(m[0].label, 'gräddfil');
});

test('tomma och saknade listor ger tomt svar', () => {
  assert.deepEqual(matchUses(undefined, [vara('Ost')]), []);
  assert.deepEqual(matchUses([], []), []);
  assert.equal(matchUses([''], [vara('Ost')])[0].item, null);
});

test('matchCount räknar bara verkliga träffar', () => {
  const m = matchUses(['Halloumi', 'citron'], [vara('Halloumi')]);
  assert.equal(matchCount(m), 1);
  assert.equal(matchCount([]), 0);
});
