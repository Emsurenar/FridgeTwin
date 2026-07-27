import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBarcode } from 'zxing-wasm/writer';
import { readBarcodes } from 'zxing-wasm/reader';
import { SCAN_FORMATS } from '../src/lib/scan-formats.js';

/*
  Att skannern faktiskt avkodar går inte att testa med en kamera i CI — men
  själva avkodningen går: skriv en streckkod med writer-modulen och läs
  tillbaka den med reader-modulen och exakt samma formatlista som appen kör
  med. Det fångar den dyra sortens fel: att formatnamnen inte matchar, eller
  att wasm-modulen inte går att ladda alls.
*/
const readerOptions = { formats: SCAN_FORMATS, tryHarder: true, maxNumberOfSymbols: 1 };

test('EAN-13 skrivs och läses tillbaka', async () => {
  for (const code of ['7310865004703', '5449000000996']) {
    const written = await writeBarcode(code, { format: 'EAN-13', scale: 4 });
    assert.equal(written.error, '');
    const [hit] = await readBarcodes(written.image, readerOptions);
    assert.ok(hit, `ingen träff för ${code}`);
    assert.equal(hit.text, code);
    assert.equal(hit.isValid, true);
  }
});

test('EAN-8 och UPC-A finns med i formatlistan', async () => {
  // Kontrollsiffrorna måste stämma, annars vägrar writer skriva koden alls.
  const ean8 = await writeBarcode('73108658', { format: 'EAN-8', scale: 4 });
  assert.equal(ean8.error, '');
  const [a] = await readBarcodes(ean8.image, readerOptions);
  assert.equal(a?.text, '73108658');

  // ZXing lämnar tillbaka en UPC-A som EAN-13 med inledande nolla. Det är rätt
  // form att slå upp med: Open Food Facts normaliserar likadant.
  const upca = await writeBarcode('012345678905', { format: 'UPC-A', scale: 4 });
  assert.equal(upca.error, '');
  const [b] = await readBarcodes(upca.image, readerOptions);
  assert.equal(b?.text, '0012345678905');
});

test('QR-koder avkodas inte — formatlistan är avsiktligt smal', async () => {
  const qr = await writeBarcode('inte en vara', { format: 'QRCode', scale: 4 });
  const hits = await readBarcodes(qr.image, readerOptions);
  assert.equal(hits.length, 0);
});
