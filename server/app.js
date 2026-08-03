// FridgeTwin API — delas av server.js (lokalt/Render) och api/index.js (Vercel).
// Lagret ligger i libSQL/Turso så hela hushållet ser samma kylskåp; AI-anropen
// proxas så Anthropic-nyckeln kan bo på servern.
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db, initDb, ensureHousehold, householdId, newId, usingTurso } from './db.js';
import { lookupProduct, getCachedProduct, saveProduct, isBarcode } from './off.js';

const app = express();
// Rejäl gräns: AI-igenkänningen skickar ett base64-kodat foto genom /api/ai.
app.use(express.json({ limit: '8mb' }));

const LOCATIONS = new Set(['fridge', 'freezer', 'pantry']);
const REMOVE_REASONS = new Set(['consumed', 'waste']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_NAME = 120;   // ryms i en ruta på hyllan; längre är ändå ingen vara
const MAX_COUNT = 999;

/*
  Formen räcker inte som kontroll. "2026-13-45" matchar mönstret men är inget
  datum, och en sådan vara blir värre än en utan datum: sorteringen lägger den
  först i lagret för alltid (den är ju inte NULL) medan klienten inte kan tolka
  den och visar ingenting alls.
*/
function isRealDate(iso) {
  if (!DATE_RE.test(iso || '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const cleanName = (v) => String(v ?? '').trim().slice(0, MAX_NAME);

// Bilden hamnar i en <img src> — bara http(s) släpps in, aldrig data: eller
// javascript:. Klienten får skicka vad den vill; servern bestämmer vad som lagras.
function httpUrl(v) {
  if (!v) return null;
  try {
    const url = new URL(String(v));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href.slice(0, 500) : null;
  } catch {
    return null;
  }
}
const cleanCount = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(1, n)) : 1;
};

// ---- Health ----
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, serverAi: Boolean(process.env.ANTHROPIC_API_KEY), persistent: usingTurso });
});

// ---- Hushållsnyckel ----
/*
  Samma modell som TimeProxys widget-nyckel: klienten slumpar en nyckel vid
  första starten och skickar den som X-Fridge-Key. Servern lagrar bara hashen.

  Det här är en delningslänk, inte autentisering — den som har nyckeln ser
  kylskåpet. För ett hushållslager är det rätt avvägning; skulle appen någon
  gång innehålla känsligare data behövs riktig inloggning.
*/
const KEY_RE = /^[a-zA-Z0-9-]{12,64}$/;

const requireKey = (req, res, next) => {
  const key = req.get('x-fridge-key');
  if (!KEY_RE.test(key || '')) {
    return res.status(401).json({ error: 'Saknar eller ogiltig hushållsnyckel' });
  }
  req.fridgeKey = key;
  req.householdId = householdId(key);
  next();
};

// Schemat skapas en gång; varje /api-anrop väntar in det.
app.use('/api', (req, res, next) => {
  initDb().then(() => next()).catch(err => {
    console.error('DB-fel:', err.message);
    res.status(500).json({ error: 'Databasen är inte tillgänglig' });
  });
});

// ---- Produktuppslag ----
app.get('/api/product/:barcode', async (req, res) => {
  const { barcode } = req.params;
  if (!isBarcode(barcode)) return res.status(400).json({ error: 'Ogiltig streckkod' });
  try {
    const product = await lookupProduct(barcode);
    if (!product) return res.status(404).json({ error: 'Okänd streckkod', barcode });
    res.json(product);
  } catch (e) {
    console.error('Produktuppslag misslyckades:', e.message);
    res.status(e.status || 502).json({ error: e.message });
  }
});

/*
  Sökning bland varor appen redan sett — både OFF-träffar och det du matat in
  själv. Det är det som gör manuell inläggning snabb: andra gången du lägger in
  gräddfil finns namn, märke, mängd och bild redan.
*/
app.get('/api/products', requireKey, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ products: [] });
  const like = `%${q.replaceAll('%', '').replaceAll('_', '')}%`;
  const { rows } = await db.execute({
    sql: `SELECT * FROM products WHERE name LIKE ? OR brand LIKE ?
          ORDER BY length(name) ASC, fetched_at DESC LIMIT 8`,
    args: [like, like],
  });
  res.json({
    products: rows.map(r => ({
      barcode: r.barcode, name: r.name, brand: r.brand,
      quantity: r.quantity, imageUrl: r.image_url,
    })),
  });
});

// Manuell inmatning av en okänd streckkod — lärs in för nästa gång.
app.put('/api/product/:barcode', requireKey, async (req, res) => {
  const { barcode } = req.params;
  if (!isBarcode(barcode)) return res.status(400).json({ error: 'Ogiltig streckkod' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Namn krävs' });
  const product = await saveProduct({
    barcode,
    name,
    brand: cleanName(req.body?.brand) || null,
    quantity: cleanName(req.body?.quantity) || null,
    imageUrl: null,
    nutriments: null,
    source: 'manual',
  });
  res.json(product);
});

// ---- Lager ----
const rowToItem = (r) => ({
  id: r.id,
  barcode: r.barcode,
  name: r.name,
  brand: r.brand,
  quantity: r.quantity,
  imageUrl: r.image_url,
  location: r.location,
  count: r.count,
  addedAt: r.added_at,
  expiresOn: r.expires_on,
  openedAt: r.opened_at,
  removedAt: r.removed_at,
  removedReason: r.removed_reason,
});

app.get('/api/inventory', requireKey, async (req, res) => {
  // NULL sist: varor utan bäst före-datum ska inte tränga sig först i listan.
  const { rows } = await db.execute({
    sql: `SELECT * FROM items WHERE household_id = ? AND removed_at IS NULL
          ORDER BY (expires_on IS NULL), expires_on ASC, added_at DESC`,
    args: [req.householdId],
  });
  res.json({ items: rows.map(rowToItem) });
});

// Historik för svinnstatistik och "senast förbrukat".
app.get('/api/history', requireKey, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await db.execute({
    sql: `SELECT * FROM items WHERE household_id = ? AND removed_at IS NOT NULL
          ORDER BY removed_at DESC LIMIT ?`,
    args: [req.householdId, limit],
  });
  res.json({ items: rows.map(rowToItem) });
});

app.post('/api/inventory', requireKey, async (req, res) => {
  const body = req.body || {};
  const barcode = body.barcode ? String(body.barcode) : null;
  if (barcode && !isBarcode(barcode)) return res.status(400).json({ error: 'Ogiltig streckkod' });

  // Namnet får komma från klienten, annars hämtas det ur produktcachen.
  let { name, brand = null, quantity = null, imageUrl = null } = body;
  if (barcode && !name) {
    const known = await getCachedProduct(barcode);
    if (known) ({ name, brand, quantity, imageUrl } = known);
  }
  name = cleanName(name);
  if (!name) return res.status(400).json({ error: 'Namn krävs' });
  brand = cleanName(brand) || null;
  quantity = cleanName(quantity) || null;
  imageUrl = httpUrl(imageUrl);

  const location = LOCATIONS.has(body.location) ? body.location : 'fridge';
  const count = cleanCount(body.count);
  if (body.expiresOn && !isRealDate(body.expiresOn)) {
    return res.status(400).json({ error: 'Ogiltigt datum' });
  }
  const expiresOn = body.expiresOn || null;

  await ensureHousehold(req.fridgeKey);

  /*
    Samma vara två gånger = två av den, inte två rader. Streckkod när det finns
    en, annars namnet (skiftlägesokänsligt) — annars blir "Bananer" två rutor
    bara för att man handlade två gånger, och rutnätet fylls med dubbletter.

    Plats och datum måste också stämma. Två paket med olika bäst före är i
    praktiken olika varor: det ena kan behöva ätas i dag.
  */
  const { rows: dupes } = await db.execute({
    sql: `SELECT * FROM items WHERE household_id = ? AND removed_at IS NULL
          AND location = ? AND IFNULL(expires_on, '') = IFNULL(?, '')
          AND ${barcode ? 'barcode = ?' : 'barcode IS NULL AND lower(name) = lower(?)'}
          LIMIT 1`,
    args: [req.householdId, location, expiresOn, barcode || name],
  });
  if (dupes[0]) {
    const { rows: updated } = await db.execute({
      sql: 'UPDATE items SET count = min(count + ?, ?) WHERE id = ? RETURNING *',
      args: [count, MAX_COUNT, dupes[0].id],
    });
    return res.status(200).json({ item: rowToItem(updated[0]), merged: true });
  }

  const id = newId();
  const { rows } = await db.execute({
    sql: `INSERT INTO items (id, household_id, barcode, name, brand, quantity, image_url,
                             location, count, added_at, expires_on)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [id, req.householdId, barcode, name, brand, quantity, imageUrl,
      location, count, new Date().toISOString(), expiresOn],
  });
  res.status(201).json({ item: rowToItem(rows[0]), merged: false });
});

app.patch('/api/inventory/:id', requireKey, async (req, res) => {
  const body = req.body || {};
  const sets = [];
  const args = [];

  if (body.count !== undefined) {
    const raw = Math.round(Number(body.count));
    if (!Number.isFinite(raw) || raw < 0) return res.status(400).json({ error: 'Ogiltigt antal' });
    // Antal 0 betyder förbrukad — samma sak som DELETE, uttryckt med stegaren.
    if (raw === 0) return removeItem(req, res, 'consumed');
    sets.push('count = ?'); args.push(Math.min(MAX_COUNT, raw));
  }
  if (body.location !== undefined) {
    if (!LOCATIONS.has(body.location)) return res.status(400).json({ error: 'Ogiltig plats' });
    sets.push('location = ?'); args.push(body.location);
  }
  if (body.expiresOn !== undefined) {
    if (body.expiresOn !== null && body.expiresOn !== '' && !isRealDate(body.expiresOn)) {
      return res.status(400).json({ error: 'Ogiltigt datum' });
    }
    sets.push('expires_on = ?'); args.push(body.expiresOn || null);
  }
  if (body.openedAt !== undefined) {
    sets.push('opened_at = ?'); args.push(body.openedAt || null);
  }
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return res.status(400).json({ error: 'Namn krävs' });
    sets.push('name = ?'); args.push(name);
  }
  if (!sets.length) return res.status(400).json({ error: 'Inget att uppdatera' });

  const { rows } = await db.execute({
    sql: `UPDATE items SET ${sets.join(', ')} WHERE id = ? AND household_id = ? AND removed_at IS NULL RETURNING *`,
    args: [...args, req.params.id, req.householdId],
  });
  if (!rows[0]) return res.status(404).json({ error: 'Varan finns inte' });
  res.json({ item: rowToItem(rows[0]) });
});

async function removeItem(req, res, reason) {
  const { rows } = await db.execute({
    sql: `UPDATE items SET removed_at = ?, removed_reason = ?
          WHERE id = ? AND household_id = ? AND removed_at IS NULL RETURNING *`,
    args: [new Date().toISOString(), reason, req.params.id, req.householdId],
  });
  if (!rows[0]) return res.status(404).json({ error: 'Varan finns inte' });
  res.json({ item: rowToItem(rows[0]) });
}

app.delete('/api/inventory/:id', requireKey, (req, res) => {
  const reason = REMOVE_REASONS.has(req.query.reason) ? req.query.reason : 'consumed';
  return removeItem(req, res, reason);
});

// Ångra en borttagning (toasten "Ångra" efter att man svept bort en vara).
app.post('/api/inventory/:id/restore', requireKey, async (req, res) => {
  const { rows } = await db.execute({
    sql: `UPDATE items SET removed_at = NULL, removed_reason = NULL
          WHERE id = ? AND household_id = ? RETURNING *`,
    args: [req.params.id, req.householdId],
  });
  if (!rows[0]) return res.status(404).json({ error: 'Varan finns inte' });
  res.json({ item: rowToItem(rows[0]) });
});

// ---- AI-proxy ----
// Kopierad från TimeProxy (server/app.js) — samma två spärrar, samma skäl:
// proxyn spenderar ägarens Anthropic-budget och får därför inte vara öppen.
const ALLOWED_MODELS = new Set(['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5']);
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const isLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

const originAllowed = (req) => {
  const origin = req.get('origin');
  if (!origin) return true; // curl och en del same-origin-anrop skickar ingen Origin
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin);
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (isLocal(host)) return true; // Vite (5299) proxar till 8788 i utveckling
  return host === req.get('host');
};

const RATE_LIMIT = Number(process.env.AI_RATE_LIMIT || 20);
const RATE_WINDOW_MS = 5 * 60 * 1000;
const hits = new Map();

const rateLimited = (ip) => {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
};

app.post('/api/ai', async (req, res) => {
  if (!anthropic) {
    return res.status(501).json({ error: 'Ingen ANTHROPIC_API_KEY på servern' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Otillåten origin' });
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'För många AI-anrop. Vänta en stund.' });
  }
  try {
    const { model, system, messages, max_tokens, output_config, thinking } = req.body || {};
    const response = await anthropic.messages.create({
      model: ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-5',
      max_tokens: Math.min(max_tokens || 2048, 8192),
      system,
      messages,
      ...(thinking ? { thinking } : {}),
      ...(output_config ? { output_config } : {}),
    });
    res.json(response);
  } catch (e) {
    console.error('AI proxy error:', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default app;
