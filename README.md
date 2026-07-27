# FridgeTwin

En digital tvilling av kylskåpet, som mobilapp (PWA). Skanna streckkoden på en
vara så identifieras den mot Open Food Facts och hamnar i lagret — med plats,
antal och bäst före-datum. Appen visar vad som brådskar och Claude föreslår vad
du kan laga på det som faktiskt finns hemma.

## Funktioner

- **Kylskåpet, inte listan** — ett utrymme i taget (kyl, frys, skafferi) med innehållet ställt på hyllor efter hur bråttom det är: *Ät snart*, *Den här veckan*, *Håller sig*. Luckorna visar antal och en prick när något brådskar där inne.
- **Streckkodsskanner** — kontinuerlig avläsning ur kameraströmmen (EAN-13/8, UPC-A/E, ITF). Kameran fortsätter efter varje träff, så en hel matkasse kan tömmas i ett svep. Autoläge lägger in varan direkt.
- **Produktuppslag** — namn, märke, mängd och bild från [Open Food Facts](https://world.openfoodfacts.org). Okänd streckkod? Namnge varan en gång, så känns den igen nästa gång.
- **En vara, ett formulär** — namn (med förslag ur allt appen redan sett), antal, plats och bäst före på samma skärm. Snabbvalen för datum finns även i skannern, så det går att sätta redan vid inläsningen.
- **Bäst före** — snabbval, datumfält, eller fota datumet på förpackningen och låt Claude läsa det.
- **AI-igenkänning** — fota lösvikt eller en hel hylla; Claude föreslår varor som du bockar av innan de läggs in.
- **Receptförslag** — tre rätter utifrån lagret, med extra vikt vid det som snart blir dåligt.
- **Delat hushåll** — lagret bor på servern. Dela nyckeln (länk eller QR-kod) så ser hela hushållet samma kylskåp.
- **Svinnstatistik** — borttagna varor raderas inte, de markeras som förbrukade eller slängda.

## Kom igång

```bash
npm install
npm run dev        # server (:8799) + vite (:5399) samtidigt
npm test           # utgångslogik, OFF-normalisering och streckkodsavkodning
```

Utan konfiguration används en lokal SQLite-fil i `data/` — inget molnkonto behövs
för att köra igång.

### AI-nyckel — två alternativ

1. **Servernyckel (rekommenderas):** `ANTHROPIC_API_KEY=sk-ant-... npm run dev` — nyckeln stannar på servern, klienten går via `/api/ai`.
2. **Klientnyckel:** klistra in nyckeln i appen under *Inställningar → AI*. Används direkt från webbläsaren när servern saknar nyckel.

Skanning, produktuppslag och lagring kostar ingenting. Bara de tre AI-funktionerna
(fotoigenkänning, datumläsning, recept) drar tokens — sätt en **spendgräns på
API-nyckeln hos Anthropic**, det är det enda som faktiskt begränsar kostnaden.

### Databas i produktion

Sätt `TURSO_URL` (och `TURSO_TOKEN`) så flyttar lagret till Turso. Utan dem
används en lokal fil, vilket inte håller på Vercel: där är bara `/tmp` skrivbart
och det töms vid varje cold start. `/api/health` svarar `persistent: true` när
Turso är inkopplat.

### Skydda proxyn

`/api/ai` spenderar serverns Anthropic-budget och har därför samma två spärrar
som TimeProxy: **origin-kontroll** (sätt `ALLOWED_ORIGINS=https://din-app.vercel.app`)
och **rate limit** (20 anrop per IP per 5 minuter, ändras med `AI_RATE_LIMIT`).
Ingen av dem är autentisering.

## Hushållsnyckeln

Klienten slumpar en nyckel vid första starten och skickar den som `X-Fridge-Key`.
Servern lagrar bara en hash av den. Den som har nyckeln ser kylskåpet — det är en
delningslänk, inte inloggning, vilket är rimligt för ett matlager men inte för
något känsligare.

## Kameran kräver HTTPS

`getUserMedia` fungerar bara i säker kontext. `localhost` räknas som säkert, men
`http://192.168.x.x` gör det inte — testa på telefonen via en deploy, eller kör
Vite med `@vitejs/plugin-basic-ssl`.

**iOS Safari saknar `BarcodeDetector`** (Chrome och Android har det, WebKit inte).
Avkodningen sker därför i WebAssembly via [zxing-wasm](https://github.com/Sec-ant/zxing-wasm),
och wasm-filen bundlas med appen i stället för att hämtas från ett CDN — annars
skulle skanningen kräva nätverk varje gång.

## Arkitektur

```
server/
  app.js      Express: produktuppslag, lager-CRUD, AI-proxy
  db.js       libSQL/Turso-klient + schema
  off.js      Open Food Facts med User-Agent och cache i products-tabellen
src/
  lib/
    api.js         hushållsnyckel + fetch-lager mot /api/*
    expiry.js      kalenderdagsräkning, lägen och sortering (rena funktioner)
    scan.js        kamera + kontinuerlig wasm-avkodning
    ai.js          Claude: bildigenkänning, datumläsning, recept
    qr.js          QR-kod för att dela nyckeln (lazy-laddad writer)
  components/
    FridgeView          luckor, hyllor och varorna som står på dem
    Fields              antal, plats och bäst före — delas av inläggning och redigering
    AddSheet            lägg in en vara, med förslag ur produktcachen
    ScannerView         helskärmsskanner med produktkort vid träff
    ItemSheet           ändra en vara, eller markera den slut/slängd
    PhotoIdentifySheet  AI-förslag att bocka av
    RecipesView         receptförslag på begäran
test/            enhetstester (npm test)
```

Databasen har tre tabeller: `households`, `products` (både OFF-cache och appens
eget minne av manuellt inmatade varor) och `items`. Borttagna varor får
`removed_at` i stället för att raderas — det ger svinnstatistiken nästan gratis.

Uppslagen mot Open Food Facts går via servern av två skäl: `User-Agent` är en
förbjuden header i webbläsarens `fetch`, och deras läsgräns på 15 anrop/min/IP
gör cachen nödvändig. Andra skanningen av samma vara når aldrig deras API.

## Design

Färgerna följer [Lifesum](https://lifesum.com/sv/): varm off-white (`#FAF5F0` /
`#F5EBE1`), nästan svart text (`#0E0E0E`) och exakt en grön (`#21BA3A`), med
versala knappar och 8px-radier. DM Sans står in för deras TT Norms Pro.

Grönt som fyllning tål vit text, men som *text* på ljus botten är `#21BA3A`
oläsligt (ca 2,3:1). Därför finns två variabler: `--accent` fyller ytor,
`--accent-ink` skriver text.

Kylskåpsinsidan är svalare än appens varma off-white och har ett ljus uppe vid
taket — det är det som skiljer "en lucka som står öppen" från "en lista på en
sida". Hyllplanen är ritade glaskanter så att varorna står på något i stället
för att sväva. Rutorna på en hylla är alltid lika höga: ojämna höjder var halva
rörigheten i den gamla listan.
