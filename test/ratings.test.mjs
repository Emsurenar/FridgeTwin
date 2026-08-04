import test from 'node:test';
import assert from 'node:assert/strict';
import { setRating, getRating, rattNyckel, ratingsForPrompt } from '../src/lib/ratings.js';

/*
  Betygen är indata till nästa prompt. Går de förlorade eller hamnar de på fel
  rätt börjar appen föreslå sådant hushållet redan sagt nej till — och det är
  värre än att inte ha betyg alls.

  localStorage finns inte i node:test, så en attrapp räcker: modulen sväljer
  fel från lagringen med flit, och det som prövas här är den rena logiken.
*/
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

test('nyckeln är okänslig för skiftläge och blanksteg', () => {
  assert.equal(rattNyckel('  Halloumi  med   Spenat '), 'halloumi med spenat');
  assert.equal(rattNyckel(''), '');
  assert.equal(rattNyckel(null), '');
});

test('betyg sätts och läses tillbaka', () => {
  const m = setRating({}, 'Halloumi med spenat', 5);
  assert.equal(getRating(m, 'Halloumi med spenat'), 5);
  assert.equal(getRating(m, 'HALLOUMI MED SPENAT'), 5); // samma rätt
  assert.equal(getRating(m, 'Fisksoppa'), 0);
});

test('samma stjärna igen nollställer', () => {
  let m = setRating({}, 'Fisksoppa', 2);
  assert.equal(getRating(m, 'Fisksoppa'), 2);
  m = setRating(m, 'Fisksoppa', 2);
  assert.equal(getRating(m, 'Fisksoppa'), 0, 'ett felsatt betyg måste gå att ta tillbaka');
});

test('betyg utanför skalan klipps', () => {
  assert.equal(getRating(setRating({}, 'A', 9), 'A'), 5);
  assert.equal(getRating(setRating({}, 'B', 1.4), 'B'), 1);
});

test('rätter utan namn lagras inte', () => {
  assert.deepEqual(setRating({}, '', 5), {});
  assert.deepEqual(setRating({}, '   ', 3), {});
});

test('bara ytterlägena skickas till modellen', () => {
  let m = {};
  m = setRating(m, 'Gillad', 5);
  m = setRating(m, 'Helt ok', 3);
  m = setRating(m, 'Ogillad', 1);
  const { gillade, ogillade } = ratingsForPrompt(m);
  assert.deepEqual(gillade.map(r => r.titel), ['Gillad']);
  assert.deepEqual(ogillade.map(r => r.titel), ['Ogillad']);
});

test('nyast först, och listan kapas', () => {
  let m = {};
  for (let i = 0; i < 12; i++) {
    m = setRating(m, `Rätt ${i}`, 5);
    // tidsstämplarna sätts av setRating; tvinga isär dem så ordningen går att pröva
    m[`rätt ${i}`].at = `2026-01-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`;
  }
  const { gillade } = ratingsForPrompt(m, 3);
  assert.equal(gillade.length, 3);
  assert.deepEqual(gillade.map(r => r.titel), ['Rätt 11', 'Rätt 10', 'Rätt 9']);
});

test('tom karta ger tomma listor', () => {
  assert.deepEqual(ratingsForPrompt({}), { gillade: [], ogillade: [] });
  assert.deepEqual(ratingsForPrompt(null), { gillade: [], ogillade: [] });
});
