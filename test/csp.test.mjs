import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  CSP:n mot vad appen faktiskt gör.

  Bakgrund: en härdningsomgång satte `script-src 'self'` och `img-src` utan
  blob:. Båda ser oklanderliga ut i en granskning och båda slog ut en
  huvudfunktion i skarp drift — Chrome vägrar kompilera WebAssembly utan
  'wasm-unsafe-eval', och streckkodsavkodningen ÄR wasm. Fotofunktionerna gick
  samma väg, eftersom nedskalningen lägger en blob:-URL i en <img>.

  Ingenting fångade det, för testerna körde mot vite och Vercels headers finns
  bara i vercel.json. Det här testet läser båda och kräver att de går ihop:
  varje tillåtelse nedan är knuten till den kodrad som behöver den, så att den
  som stramar åt CSP:n får veta vad som går sönder i stället för att upptäcka
  det på en telefon i en mataffär.
*/

const rot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const las = (p) => fs.readFileSync(path.join(rot, p), 'utf8');

const csp = (() => {
  const v = JSON.parse(las('vercel.json'));
  const rad = v.headers
    .flatMap(h => h.headers)
    .find(h => h.key.toLowerCase() === 'content-security-policy');
  assert.ok(rad, 'vercel.json ska sätta en Content-Security-Policy');
  return Object.fromEntries(
    rad.value.split(';').map(d => d.trim()).filter(Boolean).map(d => {
      const [namn, ...kallor] = d.split(/\s+/);
      return [namn, kallor];
    })
  );
})();

const kallor = (direktiv) => csp[direktiv] || csp['default-src'] || [];

test('script-src tillåter WebAssembly — annars kan inte streckkoder avkodas', () => {
  // Kravet kommer från zxing-wasm i scan.js. Försvinner importen får kravet gå.
  assert.match(las('src/lib/scan.js'), /zxing-wasm/, 'förutsättning: avkodningen är wasm');
  assert.ok(
    kallor('script-src').includes("'wasm-unsafe-eval'"),
    "script-src saknar 'wasm-unsafe-eval' — Chrome blockerar då WebAssembly.instantiate och hela skannern dör"
  );
});

test('img-src tillåter blob: — annars går fotofunktionerna inte att använda', () => {
  assert.match(las('src/lib/image.js'), /createObjectURL/, 'förutsättning: nedskalningen går via en blob:-URL');
  assert.ok(
    kallor('img-src').includes('blob:'),
    'img-src saknar blob: — bilden laddas aldrig, så "Fota datumet" och AI-igenkänningen tystnar'
  );
});

test('img-src tillåter data: — förhandsvisningar ritas ur canvas', () => {
  assert.match(las('src/lib/image.js'), /toDataURL/, 'förutsättning: canvas.toDataURL används');
  assert.ok(kallor('img-src').includes('data:'), 'img-src saknar data:');
});

test('img-src tillåter Open Food Facts produktbilder', () => {
  const k = kallor('img-src');
  assert.ok(
    k.some(s => s.includes('openfoodfacts.org')),
    'img-src släpper inte in produktbilderna, och då står varje vara utan bild'
  );
});

test('connect-src tillåter Anthropic — nyckeln är per enhet och anropet går direkt', () => {
  assert.match(las('src/lib/ai.js'), /@anthropic-ai\/sdk/, 'förutsättning: SDK:n körs i webbläsaren');
  assert.ok(
    kallor('connect-src').includes('https://api.anthropic.com'),
    'connect-src saknar api.anthropic.com — då blockeras alla AI-anrop'
  );
});

test('connect-src tillåter egen origin — appens eget API', () => {
  assert.ok(kallor('connect-src').includes("'self'"), "connect-src saknar 'self'");
});

test('typsnitten som index.html begär är tillåtna', () => {
  const html = las('index.html');
  if (/fonts\.googleapis\.com/.test(html)) {
    assert.ok(kallor('style-src').some(s => s.includes('fonts.googleapis.com')),
      'index.html hämtar Google Fonts-CSS som style-src inte tillåter');
    assert.ok(kallor('font-src').some(s => s.includes('fonts.gstatic.com')),
      'typsnittsfilerna ligger på gstatic och blockeras av font-src');
  }
});

test('inline-stilar är tillåtna — React sätter style-attribut', () => {
  assert.ok(
    kallor('style-src').includes("'unsafe-inline'"),
    "style-src saknar 'unsafe-inline'; komponenterna använder style={{…}} som blir style-attribut"
  );
});

test('CSP:n är fortfarande stram där den ska vara', () => {
  // Regressionsskydd åt andra hållet: att öppna upp för mycket är lika illa.
  assert.ok(!kallor('script-src').includes("'unsafe-eval'"),
    "'unsafe-eval' är för brett — 'wasm-unsafe-eval' räcker för wasm");
  assert.ok(!kallor('script-src').includes("'unsafe-inline'"),
    "script-src 'unsafe-inline' skulle göra nyckeln i localStorage läsbar vid minsta injektion");
  assert.ok(!kallor('script-src').includes('*'), 'script-src får inte vara öppen');
  assert.deepEqual(csp['frame-ancestors'], ["'none'"], 'appen ska inte gå att rama in');
  assert.ok(csp['default-src'], 'default-src ska finnas som botten');
});

test('kameran är tillåten i Permissions-Policy, mikrofon och plats är det inte', () => {
  const v = JSON.parse(las('vercel.json'));
  const pp = v.headers.flatMap(h => h.headers)
    .find(h => h.key.toLowerCase() === 'permissions-policy');
  assert.ok(pp, 'Permissions-Policy ska sättas');
  assert.match(pp.value, /camera=\(self\)/, 'utan kamera fungerar inte skannern');
  assert.match(pp.value, /microphone=\(\)/, 'appen behöver ingen mikrofon');
  assert.match(pp.value, /geolocation=\(\)/, 'appen behöver ingen plats');
});
