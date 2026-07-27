// FridgeTwin server (lokalt + Render) — API:t från server/app.js plus statisk
// servering av den byggda appen. På Vercel körs api/index.js i stället.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import app from './server/app.js';
import { usingTurso } from './server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8788;

const dist = path.join(__dirname, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`FridgeTwin på http://localhost:${PORT}`
    + ` (databas: ${usingTurso ? 'Turso' : 'lokal fil'},`
    + ` server-AI: ${process.env.ANTHROPIC_API_KEY ? 'ja' : 'nej — klientnyckel används'})`);
});
