import test from 'node:test';
import assert from 'node:assert/strict';
import { lagesText } from '../src/lib/lage.js';
import { setLang } from '../src/lib/i18n.js';

// Meningen är det första man läser när appen öppnas. Säger den fel sak — eller
// fel numerus — är det appens ansikte som är fel.

// Uttryckligen svenska: i Node beror standardspråket på miljön, och de här
// testerna jämför mot de svenska källsträngarna.
setLang('sv');

const now = new Date(2026, 7, 4, 12, 0); // 4 aug 2026
const vara = (expiresOn) => ({ id: expiresOn || 'x', name: 'Vara', expiresOn, count: 1, location: 'fridge' });

test('tomt lager säger det rakt ut', () => {
  assert.deepEqual(lagesText([], now), { text: 'Kylskåpet är tomt.', ton: 'lugn' });
});

test('passerat går före allt annat', () => {
  const l = lagesText([vara('2026-08-01'), vara('2026-08-04'), vara('2026-12-01')], now);
  assert.equal(l.tal, 1);
  assert.equal(l.text, 'vara har gått ut.');
  assert.equal(l.ton, 'varm');
});

test('flertal böjs rätt', () => {
  const l = lagesText([vara('2026-08-01'), vara('2026-08-02')], now);
  assert.equal(l.tal, 2);
  assert.equal(l.text, 'varor har gått ut.');
});

test('i dag när inget passerat', () => {
  const l = lagesText([vara('2026-08-04'), vara('2026-09-01')], now);
  assert.equal(l.text, 'vara bör ätas i dag.');
  assert.equal(l.ton, 'varm');
});

test('inom tre dagar ger ljum ton', () => {
  // 6 aug = om 2 dagar, 7 aug = om 3 dagar — båda 'soon'
  const l = lagesText([vara('2026-08-06'), vara('2026-08-07')], now);
  assert.equal(l.tal, 2);
  assert.equal(l.text, 'varor går ut inom tre dagar.');
  assert.equal(l.ton, 'ljum');

  // 8 aug = om 4 dagar, alltså veckan och inte 'soon'
  assert.equal(lagesText([vara('2026-08-08')], now).ton, 'lugn');
});

test('veckan är lugn', () => {
  const l = lagesText([vara('2026-08-10')], now);
  assert.equal(l.text, 'vara går ut den här veckan.');
  assert.equal(l.ton, 'lugn');
});

test('allt håller sig', () => {
  const l = lagesText([vara('2026-12-01'), vara(null)], now);
  assert.deepEqual(l, { text: 'Allt håller sig ett tag till.', ton: 'lugn' });
});

test('varor utan datum påverkar inte omdömet', () => {
  assert.equal(lagesText([vara(null), vara(null)], now).text, 'Allt håller sig ett tag till.');
});

test('meningen följer språkvalet', () => {
  setLang('en');
  try {
    assert.equal(lagesText([vara('2026-08-01')], now).text, 'item has expired.');
    assert.equal(lagesText([], now).text, 'The fridge is empty.');
  } finally {
    setLang('sv');
  }
});
