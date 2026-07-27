// Vercel serverless function — alla /api/*-anrop skrivs om hit (se vercel.json)
// och Express-appen routar vidare på originalsökvägen.
import app from '../server/app.js';

export default app;
