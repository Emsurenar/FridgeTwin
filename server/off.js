// Produktuppslag mot Open Food Facts, med cache i products-tabellen.
//
// Två skäl till att det här måste ligga på servern och inte i webbläsaren:
//   1. OFF kräver en identifierande User-Agent, och User-Agent är en förbjuden
//      header i fetch() — webbläsaren vägrar sätta den.
//   2. Deras läsgräns är 15 anrop/min/IP. Cachen gör att andra skanningen av
//      samma vara aldrig når dem.
import { db } from './db.js';

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
/*
  Bara https-bilder från Open Food Facts egna värdar. Fältet kommer från en
  crowdsourcad databas och hamnar i en <img src>; utan kontrollen kunde en
  redigerad produkt peka den var som helst.
*/
function offImage(url) {
  if (!url) return null;
  try {
    const u = new URL(String(url));
    const ok = u.protocol === 'https:' &&
      (u.hostname === 'openfoodfacts.org' || u.hostname.endsWith('.openfoodfacts.org'));
    return ok ? u.href.slice(0, 500) : null;
  } catch {
    return null;
  }
}

const FIELDS = 'product_name,product_name_sv,generic_name,brands,quantity,image_front_small_url,image_small_url,nutriments';
const UA = process.env.OFF_USER_AGENT || 'FridgeTwin/1.0 (https://github.com/Emsurenar/FridgeTwin)';

// EAN-8/EAN-13/UPC-A m.fl. — siffror, 8–14 tecken.
export const isBarcode = (code) => /^\d{8,14}$/.test(String(code || ''));

const first = (...vals) => vals.find(v => typeof v === 'string' && v.trim()) || null;

// OFF-svar → appens form. Tål att fält saknas: databasen är crowdsourcad och
// halvifyllda produkter är vanliga.
export function normalizeOffProduct(barcode, product) {
  if (!product) return null;
  const name = first(product.product_name_sv, product.product_name, product.generic_name);
  if (!name) return null; // en post utan namn är inte användbar för ett kylskåp
  const brand = first(product.brands)?.split(',')[0].trim() || null;
  const n = product.nutriments || {};
  const nutriments = {
    kcal100: Number.isFinite(n['energy-kcal_100g']) ? n['energy-kcal_100g'] : null,
    protein100: Number.isFinite(n.proteins_100g) ? n.proteins_100g : null,
    carbs100: Number.isFinite(n.carbohydrates_100g) ? n.carbohydrates_100g : null,
    fat100: Number.isFinite(n.fat_100g) ? n.fat_100g : null,
  };
  return {
    barcode: String(barcode),
    name: name.trim(),
    brand,
    quantity: first(product.quantity),
    // Genom samma kontroll som klientskickade URL:er. Bilden hamnar i en
    // <img src>, och Open Food Facts är crowdsourcad — fältet är inte vår data.
    imageUrl: offImage(first(product.image_front_small_url, product.image_small_url)),
    nutriments: Object.values(nutriments).some(v => v !== null) ? nutriments : null,
    source: 'off',
  };
}

const rowToProduct = (row) => ({
  barcode: row.barcode,
  name: row.name,
  brand: row.brand,
  quantity: row.quantity,
  imageUrl: row.image_url,
  nutriments: row.nutriments_json ? JSON.parse(row.nutriments_json) : null,
  source: row.source,
});

export async function getCachedProduct(barcode) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM products WHERE barcode = ?', args: [String(barcode)] });
  return rows[0] ? rowToProduct(rows[0]) : null;
}

export async function saveProduct(p) {
  await db.execute({
    sql: `INSERT INTO products (barcode, name, brand, quantity, image_url, nutriments_json, source, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(barcode) DO UPDATE SET
            name = excluded.name, brand = excluded.brand, quantity = excluded.quantity,
            image_url = excluded.image_url, nutriments_json = excluded.nutriments_json,
            source = excluded.source, fetched_at = excluded.fetched_at`,
    args: [
      p.barcode, p.name, p.brand ?? null, p.quantity ?? null, p.imageUrl ?? null,
      p.nutriments ? JSON.stringify(p.nutriments) : null, p.source || 'manual', new Date().toISOString(),
    ],
  });
  return p;
}

export async function fetchFromOff(barcode) {
  const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (res.status === 429) {
    const e = new Error('Open Food Facts stryper anropen just nu. Försök igen om en stund.');
    e.status = 429;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Open Food Facts svarade ${res.status}`);
    e.status = 502;
    throw e;
  }
  const json = await res.json();
  if (json.status === 0 || !json.product) return null;
  return normalizeOffProduct(barcode, json.product);
}

/*
  Cache först, OFF sedan. null = okänd vara → klienten visar manuell inmatning.

  Ingen specialhantering av UPC-A behövs: ZXing lämnar tillbaka en UPC-A som
  EAN-13 med inledande nolla ("0012345678905"), och Open Food Facts gör exakt
  samma normalisering på sin sida — en fråga på tolv siffror svarar med den
  trettonsiffriga koden. Koderna möts alltså på mitten av sig själva.
*/
export async function lookupProduct(barcode) {
  const cached = await getCachedProduct(barcode);
  if (cached) return { ...cached, cached: true };
  const fetched = await fetchFromOff(barcode);
  if (!fetched) return null;
  await saveProduct(fetched);
  return { ...fetched, cached: false };
}
