import test from 'node:test';
import assert from 'node:assert/strict';
import { t, setLang, getLang, EN } from '../src/lib/i18n.js';

/*
  Språklagrets kontrakt: svenskan är nyckeln, engelskan slås upp, och allt som
  saknar post passerar orört. Det sista är bärande — serverns felsträngar går
  genom t() utan garanti att de finns i ordboken, och de får aldrig försvinna.
*/

test('svenska är identitet', () => {
  setLang('sv');
  assert.equal(t('Sparat'), 'Sparat');
});

test('engelska slås upp', () => {
  setLang('en');
  try {
    assert.equal(t('Sparat'), 'Saved');
  } finally {
    setLang('sv');
  }
});

test('okänd nyckel passerar orörd — även på engelska', () => {
  setLang('en');
  try {
    assert.equal(t('En sträng utan post i ordboken'), 'En sträng utan post i ordboken');
  } finally {
    setLang('sv');
  }
});

test('platshållare fylls i på båda språken', () => {
  setLang('sv');
  assert.equal(t('{n} varor inlagda', { n: 3 }), '3 varor inlagda');
  setLang('en');
  try {
    assert.equal(t('{n} varor inlagda', { n: 3 }), '3 items added');
    assert.equal(t('{name}: {n} kvar', { name: 'Mjölk', n: 2 }), 'Mjölk: 2 left');
  } finally {
    setLang('sv');
  }
});

test('setLang slår igenom i getLang', () => {
  setLang('en');
  try {
    assert.equal(getLang(), 'en');
  } finally {
    setLang('sv');
  }
  assert.equal(getLang(), 'sv');
});

/*
  Varje översättning måste bära samma platshållare som sin nyckel. En glömd
  {n} i den engelska texten syns aldrig i en kodgranskning — den syns som en
  siffra som saknas i en toast, långt senare, på ett språk utvecklaren inte
  kör. Det här testet gör felet till ett testfall i stället.
*/
test('platshållarna stämmer i varje post i ordboken', () => {
  const platshallare = (s) => [...s.matchAll(/\{[a-z]+\}/g)].map(m => m[0]).sort();
  for (const [nyckel, oversattning] of Object.entries(EN)) {
    assert.deepEqual(
      platshallare(oversattning), platshallare(nyckel),
      `Platshållarna skiljer sig för: "${nyckel}" → "${oversattning}"`
    );
  }
});

test('ingen post översätter till sig själv av misstag', () => {
  for (const [nyckel, oversattning] of Object.entries(EN)) {
    assert.notEqual(nyckel, oversattning, `"${nyckel}" är oöversatt i ordboken`);
  }
});
