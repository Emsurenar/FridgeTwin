import test from 'node:test';
import assert from 'node:assert/strict';
import { alreadyHome, summarize, totalCount } from '../src/lib/owned.js';
import { setLang } from '../src/lib/i18n.js';

// Uttryckligen svenska: summeringen jämförs mot de svenska källsträngarna.
setLang('sv');

// Skannern visar "redan hemma" och erbjuder att räkna ner. Väljer den fel
// förpackning tömmer appen den med längst hållbarhet och lämnar kvar den som
// hinner bli dålig — precis tvärtom mot vad hela appen är till för.

const item = (over) => ({
  id: Math.random().toString(36).slice(2),
  barcode: '7310865004703',
  name: 'Gräddfil',
  location: 'fridge',
  count: 1,
  expiresOn: null,
  addedAt: '2026-08-01T10:00:00.000Z',
  ...over,
});

test('den som går ut först hamnar överst', () => {
  const items = [
    item({ id: 'sent', expiresOn: '2026-09-01' }),
    item({ id: 'snart', expiresOn: '2026-08-05' }),
    item({ id: 'mitten', expiresOn: '2026-08-20' }),
  ];
  assert.deepEqual(alreadyHome(items, '7310865004703').map(i => i.id), ['snart', 'mitten', 'sent']);
});

test('varor utan datum hamnar sist — de kan inte gå ut', () => {
  const items = [
    item({ id: 'utan', expiresOn: null }),
    item({ id: 'med', expiresOn: '2026-12-24' }),
  ];
  assert.deepEqual(alreadyHome(items, '7310865004703').map(i => i.id), ['med', 'utan']);
});

test('bara samma streckkod räknas', () => {
  const items = [
    item({ id: 'ratt' }),
    item({ id: 'annan', barcode: '5000112637922' }),
    item({ id: 'utan-kod', barcode: null }),
  ];
  assert.deepEqual(alreadyHome(items, '7310865004703').map(i => i.id), ['ratt']);
});

test('utan streckkod ges inget svar — namnmatchning ger falska träffar', () => {
  const items = [item({ barcode: null, name: 'Ost' })];
  assert.deepEqual(alreadyHome(items, null), []);
  assert.deepEqual(alreadyHome(items, ''), []);
  assert.deepEqual(alreadyHome(items, undefined), []);
});

test('tomt lager ger tomt svar', () => {
  assert.deepEqual(alreadyHome([], '7310865004703'), []);
});

test('summeringen slår ihop antal per utrymme', () => {
  const list = [
    item({ location: 'fridge', count: 2 }),
    item({ location: 'freezer', count: 1 }),
    item({ location: 'fridge', count: 3 }),
  ];
  assert.equal(summarize(list), '5 st i kylen · 1 st i frysen');
  assert.equal(totalCount(list), 6);
});

test('ett enda exemplar summeras utan att bli konstigt', () => {
  assert.equal(summarize([item({ location: 'pantry', count: 1 })]), '1 st i skafferiet');
  assert.equal(totalCount([]), 0);
});

test('summeringen följer språkvalet', () => {
  setLang('en');
  try {
    assert.equal(summarize([item({ location: 'fridge', count: 2 })]), '2 in the fridge');
  } finally {
    setLang('sv');
  }
});
