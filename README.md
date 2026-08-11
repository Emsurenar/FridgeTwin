# FridgeTwin

A digital twin of your fridge. Scan barcodes, track best-before dates, and get
recipe suggestions from what you actually have at home.

**Live app: [fridge-twin.vercel.app](https://fridge-twin.vercel.app)** — open it
on your phone and add it to your home screen. No account needed. Swedish and
English (*Settings → Language*).

## Features

- **Barcode scanner** — continuous scanning (EAN-13/8, UPC-A/E, ITF), product
  lookup via [Open Food Facts](https://world.openfoodfacts.org)
- **Expiry tracking** — everything urgent in one list: eat now, this week, no date
- **AI, bring your own key** — photo recognition, best-before reading and recipe
  suggestions with your own Anthropic API key (optional)
- **Shared household** — share a link or QR code; everyone sees the same fridge
- **Waste stats** — removed items are marked consumed or wasted, never deleted

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev    # API on :8799, app on :5399
```

Inventory is stored in a local SQLite file in `data/`. `npm test` runs the
tests, `npm run lint` the linter.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEmsurenar%2FFridgeTwin)

1. Import the repo on [vercel.com/new](https://vercel.com/new), or use the button.
2. Create a free database at [turso.tech](https://turso.tech) and set two
   environment variables in Vercel: `TURSO_URL` and `TURSO_TOKEN`. Without them
   the inventory is lost on every cold start.
3. Redeploy, then check that `/api/health` answers `"persistent": true`.

## AI key

Each device brings its own Anthropic API key (*Settings → AI*). It is stored in
the browser and sent directly to `api.anthropic.com` — never to FridgeTwin's
server, so a public deploy can't spend the owner's money. Set a spend limit on
the key at Anthropic. Scanning, lookups and storage are free; only the three AI
features use tokens.

## Notes

- The camera requires HTTPS — `localhost` works, LAN IPs don't.
- The household key is a share link, not authentication: anyone with the key
  sees the fridge.
- Found a security issue? Use GitHub's private vulnerability reporting
  (*Security → Report a vulnerability*).

## License

[MIT](LICENSE)
