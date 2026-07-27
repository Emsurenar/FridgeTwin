import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIsoDate, daysUntil, expiryState, byExpiry, expirySummary, addDays, toIsoDate,
} from '../src/lib/expiry.js';

// Fast "nu" mitt på dagen, så testerna inte beror på när de körs.
const now = new Date(2026, 6, 27, 13, 30); // 27 juli 2026

test('parseIsoDate ger lokal midnatt och avvisar skräp', () => {
  const d = parseIsoDate('2026-07-27');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 27);
  assert.equal(d.getHours(), 0);

  assert.equal(parseIsoDate('2026-02-31'), null); // rullar inte över till mars
  assert.equal(parseIsoDate('27/07/2026'), null);
  assert.equal(parseIsoDate(''), null);
  assert.equal(parseIsoDate(null), null);
});

test('daysUntil räknar kalenderdagar, inte dygn', () => {
  assert.equal(daysUntil('2026-07-27', now), 0);
  assert.equal(daysUntil('2026-07-28', now), 1);
  assert.equal(daysUntil('2026-07-26', now), -1);
  assert.equal(daysUntil('2026-08-03', now), 7);
  assert.equal(daysUntil(null, now), null);
});

test('daysUntil är oberoende av klockslag', () => {
  const strax_efter_midnatt = new Date(2026, 6, 27, 0, 1);
  const strax_fore_midnatt = new Date(2026, 6, 27, 23, 59);
  assert.equal(daysUntil('2026-07-28', strax_efter_midnatt), 1);
  assert.equal(daysUntil('2026-07-28', strax_fore_midnatt), 1);
});

test('daysUntil tappar ingen dag vid sommartidsbytet', () => {
  // Sverige ställer om natten till söndag 29 mars 2026 (dygnet blir 23 timmar).
  const fore = new Date(2026, 2, 28, 12, 0);
  assert.equal(daysUntil('2026-03-29', fore), 1);
  assert.equal(daysUntil('2026-03-30', fore), 2);
  // Och åt andra hållet i oktober (dygnet blir 25 timmar).
  const host = new Date(2026, 9, 24, 12, 0);
  assert.equal(daysUntil('2026-10-25', host), 1);
});

test('expiryState delar in i rätt lägen', () => {
  assert.equal(expiryState('2026-07-20', now), 'expired');
  assert.equal(expiryState('2026-07-27', now), 'today');
  assert.equal(expiryState('2026-07-28', now), 'soon');
  assert.equal(expiryState('2026-07-30', now), 'soon');   // gräns: 3 dagar
  assert.equal(expiryState('2026-07-31', now), 'week');   // gräns: 4 dagar
  assert.equal(expiryState('2026-08-03', now), 'week');   // gräns: 7 dagar
  assert.equal(expiryState('2026-08-04', now), 'ok');
  assert.equal(expiryState(null, now), 'none');
});

test('byExpiry sorterar närmast utgång först och datumlösa sist', () => {
  const items = [
    { name: 'Mjölk', expiresOn: '2026-08-10', addedAt: '2026-07-01' },
    { name: 'Ägg', expiresOn: null, addedAt: '2026-07-05' },
    { name: 'Fil', expiresOn: '2026-07-28', addedAt: '2026-07-02' },
    { name: 'Salt', expiresOn: null, addedAt: '2026-07-20' },
  ];
  assert.deepEqual(items.sort(byExpiry).map(i => i.name), ['Fil', 'Mjölk', 'Salt', 'Ägg']);
});

test('expirySummary räknar passerade och brådskande var för sig', () => {
  const items = [
    { expiresOn: '2026-07-20' }, // passerad
    { expiresOn: '2026-07-27' }, // i dag
    { expiresOn: '2026-07-29' }, // brådskar
    { expiresOn: '2026-08-20' }, // lugnt
    { expiresOn: null },
  ];
  assert.deepEqual(expirySummary(items, now), { expired: 1, urgent: 2, total: 5 });
});

test('addDays + toIsoDate ger snabbvalen rätt datum', () => {
  assert.equal(toIsoDate(addDays(now, 3)), '2026-07-30');
  assert.equal(toIsoDate(addDays(now, 7)), '2026-08-03');
  assert.equal(toIsoDate(addDays(new Date(2026, 11, 30), 7)), '2027-01-06'); // över årsskiftet
});
