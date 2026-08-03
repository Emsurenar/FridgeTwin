// libSQL-klient + schema.
//
// Lokalt: en SQLite-fil i data/ — inget molnkonto behövs för `npm run dev`.
// I produktion: sätt TURSO_URL (+ TURSO_TOKEN) så bor lagret hos Turso och
// överlever både omstarter och Vercels skrivskyddade filsystem.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function localUrl() {
  // Vercel: bara /tmp är skrivbart, och det töms vid cold start. Det duger för
  // en smoke-test men inte för riktig data — därav varningen.
  const dir = process.env.VERCEL ? '/tmp/fridgetwin-data' : path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return `file:${path.join(dir, 'fridge.db')}`;
}

export const usingTurso = Boolean(process.env.TURSO_URL);

if (!usingTurso && process.env.VERCEL) {
  console.warn('TURSO_URL saknas — lagret hamnar i /tmp och försvinner vid cold start.');
}

/*
  Två klienter, valda efter URL:en:

  - Turso (libsql://, https://) → '@libsql/client/web', som pratar HTTP och inte
    innehåller en rad native-kod. Det är den som körs på Vercel, och en native
    binär i en serverless-funktion är precis den sorts sak som fungerar lokalt
    och pajar i produktion.
  - Lokal fil → '@libsql/client/node', som behöver den native modulen — men den
    körs bara på din egen maskin.
*/
const { createClient } = usingTurso
  ? await import('@libsql/client/web')
  : await import('@libsql/client/node');

export const db = createClient(
  usingTurso
    ? { url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN }
    : { url: localUrl() }
);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS households (
     id TEXT PRIMARY KEY,
     created_at TEXT NOT NULL
   )`,
  // Både OFF-cache och appens eget minne: en vara du matat in för hand sparas
  // med source='manual' och känns igen direkt nästa gång koden skannas.
  `CREATE TABLE IF NOT EXISTS products (
     barcode TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     brand TEXT,
     quantity TEXT,
     image_url TEXT,
     nutriments_json TEXT,
     source TEXT NOT NULL,
     fetched_at TEXT NOT NULL
   )`,
  // Borttagna varor raderas inte, de får removed_at — det ger svinnstatistik
  // utan någon extra tabell.
  `CREATE TABLE IF NOT EXISTS items (
     id TEXT PRIMARY KEY,
     household_id TEXT NOT NULL,
     barcode TEXT,
     name TEXT NOT NULL,
     brand TEXT,
     quantity TEXT,
     image_url TEXT,
     location TEXT NOT NULL DEFAULT 'fridge',
     count INTEGER NOT NULL DEFAULT 1,
     added_at TEXT NOT NULL,
     expires_on TEXT,
     opened_at TEXT,
     removed_at TEXT,
     removed_reason TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_items_household ON items (household_id, removed_at)`,
];

let ready = null;
export function initDb() {
  if (!ready) {
    ready = (async () => {
      for (const stmt of SCHEMA) await db.execute(stmt);
    })().catch(err => {
      ready = null; // låt nästa anrop försöka igen i stället för att fastna
      throw err;
    });
  }
  return ready;
}

// Hushållsnyckeln lagras aldrig i klartext — bara hashen behövs för uppslag.
export const householdId = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);

export async function ensureHousehold(key) {
  const id = householdId(key);
  await db.execute({
    sql: 'INSERT OR IGNORE INTO households (id, created_at) VALUES (?, ?)',
    args: [id, new Date().toISOString()],
  });
  return id;
}

export const newId = () => crypto.randomUUID();
