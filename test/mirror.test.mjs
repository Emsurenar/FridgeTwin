import test from 'node:test';
import assert from 'node:assert/strict';
import { missingFromServer } from '../src/lib/mirror.js';

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
