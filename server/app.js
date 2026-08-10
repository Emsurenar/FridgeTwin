/*
  FridgeTwin API — delas av server.js (lokalt/Render) och api/index.js (Vercel).
  Lagret ligger i libSQL/Turso så hela hushållet ser samma kylskåp.

  Servern rör aldrig Anthropic. AI-nyckeln är privat per enhet och går direkt
  från webbläsaren till api.anthropic.com (se src/lib/ai.js) — det finns alltså
  ingen proxy här som kan spendera någon annans budget, och därmed inget behov
  av origin-spärr eller rate limit för den saken.
*/
import express from 'express';
import { db, initDb, ensureHousehold, householdId, newId, usingTurso, lastDbError, tursoHost } from './db.js';
import { lookupProduct, getCachedProduct, isBarcode } from './off.js';

const app = express();
// Vercel och Render sätter X-Forwarded-For; utan trust proxy blir req.ip det
// sista hoppets adress i stället för klientens.
app.set('trust proxy', 1);
/*
  1 MB räcker med marginal: största kroppen är en spegelsynk med 500 varor, och
  varje vara är några hundra byte. Gränsen låg på 8 MB för att foton skickades
  genom AI-proxyn — den finns inte längre, och foton går aldrig hitåt.
*/
app.use(express.json({ limit: '1mb' }));

const isProd = process.env.NODE_ENV === 'production';

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

/*
  SQLites lower() och LIKE är skiftlägesokänsliga — men bara för ASCII. För
  databasen är "Ägg" och "ägg" två olika strängar, och svenska varunamn börjar
  påfallande ofta på å, ä eller ö. Jämförelsen görs därför i JS, där
  toLocaleLowerCase faktiskt kan svenska.
*/
const nameKey = (v) => String(v ?? '').trim().toLocaleLowerCase('sv');

/*
  Skiftlägesvarianter att söka på, eftersom LIKE inte klarar det själv. Täcker
  de fall som uppstår i praktiken: skrivet som det står, allt gement, och
  gement med stor begynnelsebokstav (det sistnämnda är hur varunamn skrivs).
*/
const caseVariants = (s) => {
  const gement = s.toLocaleLowerCase('sv');
  return [...new Set([s, gement, gement.charAt(0).toLocaleUpperCase('sv') + gement.slice(1)])];
};

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

/*
  Health svarar också på "varför fungerar det inte", för det är den frågan man
  faktiskt har när man precis satt TURSO_URL och TURSO_TOKEN och något ändå är
  fel. Värdnamn men aldrig token: nog för att se om man klistrat in fel sak i
  fel ruta, utan att läcka något känsligt.
*/
app.get('/api/health', async (req, res) => {
  const turso = {
    configured: usingTurso,
    tokenSatt: Boolean(process.env.TURSO_TOKEN),
    host: tursoHost(),
  };
  // Prova anslutningen på riktigt — utan det säger health "persistent: true"
  // så fort variablerna finns, oavsett om de fungerar.
  let ansluten = false;
  try {
    await initDb();
    ansluten = true;
  } catch { /* felet plockas ur lastDbError nedan */ }

  /*
    Värdnamn och råa databasfel är felsökningshjälp, inte publik information.
    I produktion räcker det att säga *att* något är fel; vad det är får man
    veta med en hushållsnyckel i handen.
  */
  const detaljer = isProd && !KEY_RE.test(req.get('x-fridge-key') || '')
    ? { configured: turso.configured, tokenSatt: turso.tokenSatt, ansluten }
    : { ...turso, ansluten, fel: lastDbError };

  res.json({
    ok: true,
    persistent: usingTurso && ansluten,
    turso: detaljer,
  });
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
app.get('/api/product/:barcode', requireKey, async (req, res) => {
  const { barcode } = req.params;
  if (!isBarcode(barcode)) return res.status(400).json({ error: 'Ogiltig streckkod' });
  try {
    // Det hushållet själv lärt in går före OFF: har man döpt om en vara är det
    // för att OFF:s namn inte dög.
    const { rows } = await db.execute({
      sql: 'SELECT * FROM household_products WHERE household_id = ? AND barcode = ?',
      args: [req.householdId, barcode],
    });
    if (rows[0]) {
      return res.json({
        barcode, name: rows[0].name, brand: rows[0].brand,
        quantity: rows[0].quantity, imageUrl: null, source: 'manual',
      });
    }
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
  // % och _ är jokertecken i LIKE; utan städningen blev "%" en sökning på allt.
  const ren = q.replaceAll('%', '').replaceAll('_', '');
  if (!ren) return res.json({ products: [] });

  // Söker man på "ägg" ska "Ägg 12-pack" komma upp. Se caseVariants.
  const monster = caseVariants(ren).map(v => `%${v}%`);
  const villkor = monster.map(() => '(name LIKE ? OR brand LIKE ?)').join(' OR ');
  const likeArgs = monster.flatMap(v => [v, v]);

  /*
    Egna först, sedan den globala OFF-cachen. source != 'manual' i andra ledet
    är hela poängen: utan det läckte sökningen andra hushålls egeninmatade
    varunamn till vem som helst.
  */
  /*
    Underfrågan är inte kosmetik: efter UNION ALL får ORDER BY bara peka på
    kolumnnamn i resultatet, inte på uttryck som length(name). Utan omslaget
    svarade SQLite "2nd ORDER BY term does not match any column".
  */
  const { rows } = await db.execute({
    sql: `SELECT barcode, name, brand, quantity, image_url FROM (
            SELECT barcode, name, brand, quantity, NULL AS image_url, 0 AS ordning,
                   length(name) AS langd
            FROM household_products
            WHERE household_id = ? AND (${villkor})
            UNION ALL
            SELECT barcode, name, brand, quantity, image_url, 1 AS ordning,
                   length(name) AS langd
            FROM products
            WHERE source != 'manual' AND (${villkor})
          ) ORDER BY ordning ASC, langd ASC LIMIT 8`,
    args: [req.householdId, ...likeArgs, ...likeArgs],
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
  await ensureHousehold(req.fridgeKey);

  const brand = cleanName(req.body?.brand) || null;
  const quantity = cleanName(req.body?.quantity) || null;
  await db.execute({
    sql: `INSERT INTO household_products (household_id, barcode, name, brand, quantity, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(household_id, barcode) DO UPDATE SET
            name = excluded.name, brand = excluded.brand,
            quantity = excluded.quantity, fetched_at = excluded.fetched_at`,
    args: [req.householdId, barcode, name, brand, quantity, new Date().toISOString()],
  });
  res.json({ barcode, name, brand, quantity, imageUrl: null, source: 'manual' });
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
  // LIMIT -1 betyder obegränsat i SQLite, så taket måste ha ett golv också.
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 500);
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
    const { rows: egna } = await db.execute({
      sql: 'SELECT * FROM household_products WHERE household_id = ? AND barcode = ?',
      args: [householdId(req.fridgeKey), barcode],
    });
    if (egna[0]) ({ name, brand, quantity } = egna[0]);
    else {
      const known = await getCachedProduct(barcode);
      if (known) ({ name, brand, quantity, imageUrl } = known);
    }
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
  // Namnjämförelsen görs i JS och inte med lower() i SQL — se nameKey.
  const hittaDubblett = async () => {
    const { rows } = await db.execute({
      sql: `SELECT * FROM items WHERE household_id = ? AND removed_at IS NULL
            AND location = ? AND IFNULL(expires_on, '') = IFNULL(?, '')
            AND ${barcode ? 'barcode = ?' : 'barcode IS NULL'}`,
      args: barcode
        ? [req.householdId, location, expiresOn, barcode]
        : [req.householdId, location, expiresOn],
    });
    return barcode ? rows[0] : rows.find(r => nameKey(r.name) === nameKey(name));
  };

  // Svarar null om raden hann tas bort mellan uppslaget och skrivningen — då är
  // rätt sak att lägga in den på nytt i stället.
  const rakaUpp = async (id) => {
    const { rows } = await db.execute({
      sql: 'UPDATE items SET count = min(count + ?, ?) WHERE id = ? AND removed_at IS NULL RETURNING *',
      args: [count, MAX_COUNT, id],
    });
    return rows[0] || null;
  };

  const dubblett = await hittaDubblett();
  if (dubblett) {
    const uppraknad = await rakaUpp(dubblett.id);
    if (uppraknad) return res.json({ item: rowToItem(uppraknad), merged: true });
  }

  /*
    Kvar är ett litet glapp: två exakt samtidiga inläggningar av samma vara kan
    båda hitta ingenting här och båda lägga in en rad. Ett unikhetsindex stängde
    det, men fick samtidigt UPDATE att bryta mot samma villkor — och därmed blev
    "flytta bananerna till kylen" ett 500 (se db.js). Två rader av samma vara är
    ofarligt och slås ihop nästa gång varan skannas; att inte kunna flytta en
    vara är det inte.
  */
  const { rows } = await db.execute({
    sql: `INSERT INTO items (id, household_id, barcode, name, brand, quantity, image_url,
                             location, count, added_at, expires_on)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [newId(), req.householdId, barcode, name, brand, quantity, imageUrl,
      location, count, new Date().toISOString(), expiresOn],
  });
  res.status(201).json({ item: rowToItem(rows[0]), merged: false });
});

/*
  Lägg tillbaka varor som servern tappat.

  Utan TURSO_URL bor lagret i serverns /tmp, och på Vercel är den katalogen per
  instans: två anrop kan träffa två olika tomma databaser. Klienten håller
  därför en spegel av lagret lokalt och skickar hit det servern saknar.

  ON CONFLICT DO NOTHING på id är det som gör det ofarligt att köra om. Vanliga
  POST /api/inventory slår ihop dubbletter och hade räknat upp antalet varje
  gång — här är varans id nyckeln, så en vara som redan finns lämnas i fred.
  Raderna behåller sina ursprungliga id:n, vilket också gör att redigeringar och
  borttagningar från andra enheter fortsätter peka rätt.
*/
const MAX_SYNC = 500;

app.post('/api/inventory/sync', requireKey, async (req, res) => {
  const alla = Array.isArray(req.body?.items) ? req.body.items : [];
  /*
    Tyst kapning var farligt: klienten skrev sedan serverns kortare svar
    tillbaka till spegeln, så det som kapades bort raderades permanent. Nu säger
    servern ifrån i stället, och klienten låter spegeln vara.
  */
  if (alla.length > MAX_SYNC) {
    return res.status(413).json({
      error: `För många varor på en gång (${alla.length}, max ${MAX_SYNC})`,
      max: MAX_SYNC,
    });
  }
  const incoming = alla;
  await ensureHousehold(req.fridgeKey);

  const satser = [];
  for (const raw of incoming) {
    const id = String(raw?.id || '');
    const name = cleanName(raw?.name);
    // Utan id går raden inte att göra idempotent, och utan namn är den ingen vara.
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || !name) continue;

    const barcode = raw.barcode && isBarcode(String(raw.barcode)) ? String(raw.barcode) : null;
    const location = LOCATIONS.has(raw.location) ? raw.location : 'fridge';
    const expiresOn = isRealDate(raw.expiresOn) ? raw.expiresOn : null;

    satser.push({
      /*
        ON CONFLICT(id) och inte bara ON CONFLICT: måltavlan ska vara varans id
        och ingenting annat. Utan den blev vilken unikhetskrock som helst en tyst
        överhoppning — en spegelvara som liknade en rad servern redan hade föll
        då bort utan att räknas, och klienten skrev sedan serverns kortare svar
        tillbaka över spegeln. Det är precis den dataförlust spegeln finns för
        att förhindra.
      */
      sql: `INSERT INTO items (id, household_id, barcode, name, brand, quantity, image_url,
                               location, count, added_at, expires_on)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [id, req.householdId, barcode, name,
        cleanName(raw.brand) || null, cleanName(raw.quantity) || null, httpUrl(raw.imageUrl),
        location, cleanCount(raw.count),
        // addedAt är sorteringsnyckel; skräp där sorterar lagret fel för alltid.
        typeof raw.addedAt === 'string' && !Number.isNaN(Date.parse(raw.addedAt))
          ? raw.addedAt.slice(0, 40) : new Date().toISOString(),
        expiresOn],
    });
  }

  /*
    En batch och inte 500 separata skrivningar. Mot Turso är varje db.execute en
    egen rundresa över HTTP, så en full spegelåterläggning blev 500 av dem i
    följd — det hann slå i Vercels funktionstak innan den var klar, och då kom
    inget svar alls tillbaka till telefonen som satt med hela lagret.
  */
  let restored = 0;
  if (satser.length) {
    const svar = await db.batch(satser, 'write');
    restored = svar.reduce((n, r) => n + (r.rowsAffected || 0), 0);
  }

  const { rows } = await db.execute({
    sql: `SELECT * FROM items WHERE household_id = ? AND removed_at IS NULL
          ORDER BY (expires_on IS NULL), expires_on ASC, added_at DESC`,
    args: [req.householdId],
  });
  res.json({ restored, items: rows.map(rowToItem) });
});

/*
  Räkna ner ett steg — "jag åt upp en".

  Egen väg och inte PATCH { count: n }, för avsikten är *relativ* medan count är
  absolut. Skickar klienten ett absolut tal räknat på sin egen ögonblicksbild
  skriver den över vad någon annan i hushållet hunnit göra: har sambon ätit två
  sedan din flik hämtade lagret, får "ta en" antalet att gå *upp*. Här räknas
  det i databasen i stället, i samma sats som skrivningen.

  Skulle steget ta antalet under 1 är varan slut, och då är rätt svar en
  borttagning — samma sak som stegaren gör med noll.
*/
app.post('/api/inventory/:id/consume', requireKey, async (req, res) => {
  const { rows } = await db.execute({
    sql: `UPDATE items SET count = count - 1
          WHERE id = ? AND household_id = ? AND removed_at IS NULL AND count > 1
          RETURNING *`,
    args: [req.params.id, req.householdId],
  });
  if (rows[0]) return res.json({ item: rowToItem(rows[0]), removed: false });

  // Inga rader betyder antingen count = 1 (sista exemplaret) eller att raden
  // inte finns. removeItem skiljer dem åt: den svarar 404 i det senare fallet.
  return removeItem(req, res, 'consumed', true);
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
    if (body.openedAt && !isRealDate(body.openedAt)) {
      return res.status(400).json({ error: 'Ogiltigt öppnat-datum' });
    }
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

async function removeItem(req, res, reason, flagRemoved = false) {
  const { rows } = await db.execute({
    sql: `UPDATE items SET removed_at = ?, removed_reason = ?
          WHERE id = ? AND household_id = ? AND removed_at IS NULL RETURNING *`,
    args: [new Date().toISOString(), reason, req.params.id, req.householdId],
  });
  if (!rows[0]) return res.status(404).json({ error: 'Varan finns inte' });
  res.json({ item: rowToItem(rows[0]), ...(flagRemoved ? { removed: true } : {}) });
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

/*
  Sista utposten. Utan den besvarar Express varje ohanterat fel i en
  route-handler med sin standardsida — HTML plus full stacktrace, i en app
  vars klient bara kan tolka JSON.

  Kroppsläsaren kastar egna fel med vettiga statuskoder, och de ska inte bli
  "Serverfel 500". En trasig JSON-kropp är klientens fel, inte serverns, och en
  spegelsynk som spränger gränsen ska säga just det — klienten har redan en
  hantering för 413 som låter den lokala kopian vara i fred.
*/
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'För stor begäran' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Ogiltig JSON' });
  }
  console.error('Ohanterat fel:', err?.message || err);
  res.status(err?.status || 500).json({ error: 'Serverfel' });
});

export default app;
