import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffProduct, isBarcode } from '../server/off.js';

// Open Food Facts är crowdsourcad: halvifyllda produkter är regel, inte undantag.
// Normaliseringen måste därför tåla att i stort sett vartenda fält saknas.

test('isBarcode accepterar EAN/UPC och avvisar annat', () => {
  assert.equal(isBarcode('7310865004703'), true); // EAN-13
  assert.equal(isBarcode('73108650'), true);      // EAN-8
  assert.equal(isBarcode('1234567'), false);      // för kort
  assert.equal(isBarcode('731086500470312'), false); // för lång
  assert.equal(isBarcode('73108650470a'), false);
  assert.equal(isBarcode(null), false);
});

test('normalizeOffProduct plockar ut det appen behöver', () => {
  const p = normalizeOffProduct('7310865004703', {
    product_name: 'Gräddfil 5%',
    brands: 'Arla, Arla Foods, Arla Ko',
    quantity: '3 dl',
    image_front_small_url: 'https://images.openfoodfacts.org/images/products/front.jpg',
    nutriments: { 'energy-kcal_100g': 100, proteins_100g: 3.1, carbohydrates_100g: 3.4, fat_100g: 12 },
  });
  assert.equal(p.name, 'Gräddfil 5%');
  assert.equal(p.brand, 'Arla');            // bara första märket, inte hela raden
  assert.equal(p.quantity, '3 dl');
  assert.equal(p.imageUrl, 'https://images.openfoodfacts.org/images/products/front.jpg');
  assert.deepEqual(p.nutriments, { kcal100: 100, protein100: 3.1, carbs100: 3.4, fat100: 12 });
  assert.equal(p.source, 'off');
});

test('svenskt produktnamn går före det generella', () => {
  const p = normalizeOffProduct('123', { product_name: 'Sour cream', product_name_sv: 'Gräddfil' });
  assert.equal(p.name, 'Gräddfil');
});

test('tomma strängar räknas inte som värden', () => {
  const p = normalizeOffProduct('123', {
    product_name: '',
    product_name_sv: '   ',
    generic_name: 'Havregryn',
    brands: '',
    quantity: '',
  });
  assert.equal(p.name, 'Havregryn');
  assert.equal(p.brand, null);
  assert.equal(p.quantity, null);
  assert.equal(p.imageUrl, null);
  assert.equal(p.nutriments, null);
});

test('en post utan användbart namn förkastas', () => {
  assert.equal(normalizeOffProduct('123', { brands: 'Arla', quantity: '1 l' }), null);
  assert.equal(normalizeOffProduct('123', null), null);
});

test('delvis ifyllda näringsvärden behålls, helt tomma blir null', () => {
  const delvis = normalizeOffProduct('123', { product_name: 'X', nutriments: { proteins_100g: 8 } });
  assert.deepEqual(delvis.nutriments, { kcal100: null, protein100: 8, carbs100: null, fat100: null });

  const tomt = normalizeOffProduct('123', { product_name: 'X', nutriments: { salt_100g: 1 } });
  assert.equal(tomt.nutriments, null);
});

/*
  Bild-URL:en hamnar i en <img src> och kommer från en crowdsourcad databas där
  vem som helst kan redigera fältet. Bara https mot Open Food Facts egna värdar
  släpps igenom — resten blir null, och appen visar sin platshållare.
*/
test('bild-URL utanför Open Food Facts avvisas', () => {
  const bild = (url) => normalizeOffProduct('123', { product_name: 'X', image_front_small_url: url }).imageUrl;

  assert.equal(bild('https://images.openfoodfacts.org/a.jpg'), 'https://images.openfoodfacts.org/a.jpg');
  assert.equal(bild('https://openfoodfacts.org/a.jpg'), 'https://openfoodfacts.org/a.jpg');

  assert.equal(bild('https://angriparen.example/a.jpg'), null, 'främmande värd');
  assert.equal(bild('http://images.openfoodfacts.org/a.jpg'), null, 'okrypterat');
  assert.equal(bild('javascript:alert(1)'), null, 'javascript:');
  assert.equal(bild('data:image/svg+xml,<svg onload=alert(1)>'), null, 'data:');
  assert.equal(bild('https://openfoodfacts.org.angriparen.example/a.jpg'), null, 'värd som bara ser rätt ut');
  assert.equal(bild('inte en url'), null);
  assert.equal(bild(undefined), null);
});
