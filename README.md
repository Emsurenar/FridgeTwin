# FridgeTwin

En digital tvilling av kylskåpet, som mobilapp (PWA). Skanna streckkoden på en
vara så identifieras den mot Open Food Facts och hamnar i lagret — med plats,
antal och bäst före-datum. Appen visar vad som brådskar och Claude föreslår vad
du kan laga på det som faktiskt finns hemma.

## Funktioner

- **Kylskåpet, inte listan** — ett utrymme i taget (kyl, frys, skafferi) med innehållet ställt på hyllor efter hur bråttom det är: *Ät snart*, *Den här veckan*, *Håller sig*. Luckorna visar antal och en prick när något brådskar där inne.
- **Streckkodsskanner** — kontinuerlig avläsning ur kameraströmmen (EAN-13/8, UPC-A/E, ITF). Kameran fortsätter efter varje träff, så en hel matkasse kan tömmas i ett svep. Autoläge lägger in varan direkt.
- **Redan hemma** — vid en träff visar skannern om varan redan står inne, och var. Skanna en tom förpackning så räknas den ner; sista exemplaret markeras som slut. Den som går ut först räknas ner, för det är den man äter upp härnäst.
- **Produktuppslag** — namn, märke, mängd och bild från [Open Food Facts](https://world.openfoodfacts.org). Okänd streckkod? Namnge varan en gång, så känns den igen nästa gång.
- **En vara, ett formulär** — namn (med förslag ur allt appen redan sett), antal, plats och bäst före på samma skärm. Snabbvalen för datum finns även i skannern, så det går att sätta redan vid inläsningen.
- **Bäst före** — snabbval, datumfält, eller fota datumet på förpackningen och låt Claude läsa det.
- **AI-igenkänning** — fota lösvikt eller en hel hylla; Claude föreslår varor som du bockar av innan de läggs in.
- **Receptförslag** — tre rätter utifrån lagret, med extra vikt vid det som snart blir dåligt. Välj måltid (frukost, lunch, middag) och skriv ett eget önskemål — *vegetariskt och snabbt*. Körningen fortsätter medan du går till kylskåpet, och förslagen sparas i en logg som överlever både flikbyte och omladdning.
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

## Deploya på Vercel

1. **Importera repot** på [vercel.com/new](https://vercel.com/new). Vite känns igen automatiskt (`npm run build` → `dist/`), och `api/index.js` blir en serverless-funktion via `vercel.json`.
2. **Skaffa en databas** — utan den försvinner lagret vid varje omstart. På [turso.tech](https://turso.tech) (gratisnivå):
   ```bash
   turso db create fridgetwin
   turso db show fridgetwin --url        # → libsql://...turso.io
   turso db tokens create fridgetwin     # → token
   ```
3. **Miljövariabler** i Vercel (*Settings → Environment Variables*):

   | Variabel | Värde | Krävs |
   |---|---|---|
   | `TURSO_URL` | `libsql://…turso.io` | ja, annars tappas lagret |
   | `TURSO_TOKEN` | token från steg 2 | ja |
   | `ANTHROPIC_API_KEY` | `sk-ant-…` | nej — utan den används klientnyckeln |
   | `ALLOWED_ORIGINS` | `https://din-app.vercel.app` | nej, men rekommenderas om AI-nyckeln ligger på servern |
4. **Deploya om** efter att variablerna satts — de läses vid build, inte i efterhand.
5. Öppna appen. Saknas Turso står det **Lagret sparas inte — varor kan försvinna** överst i alla vyer tills det är åtgärdat. `/api/health` svarar `persistent: true` när allt sitter.

> **Varför det är värt besväret:** utan `TURSO_URL` bor lagret i serverns `/tmp`,
> och på Vercel är den katalogen *per instans*. Två anrop kan träffa två olika
> tomma databaser, så det ser ut som att varor försvinner när man byter utrymme
> — fast det som händer är att man växlar mellan flera lager. Samma sak vid varje
> cold start.

Schemat skapas automatiskt vid första anropet, så det finns inget migreringssteg.

Lägg till appen på hemskärmen (*Dela → Lägg till på hemskärmen*) — då körs den i helskärm, och kameran fungerar eftersom Vercel serverar över HTTPS.

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

**Värme betyder förfall.** Ett kylskåp håller undan förruttnelse genom att vara
kallt, så hela appen är kall — plåt (`#E3E9EA`), lyst innervägg (`#F5F9F9`),
kall nästan-svart text (`#101719`) och exakt en mättad kall färg (`#0F6C7E`)
för allt man kan trycka på. Den enda värmen i appen betyder att maten håller på
att dö: ljummet (`#C9741C`) inom dagar, varmt (`#B33A22`) i dag eller passerat.

Det är också en läsbarhetsfråga. Den gamla skalan var röd/gul/grön, alltså exakt
den axel som försvinner vid rödgrönblindhet. Kall→varm är både en ton- *och* en
ljushetsaxel och överlever därför färgseendet.

`#0F6C7E` klarar 5,7:1 mot innerväggen som text *och* 6,1:1 med vit text ovanpå,
så den behöver inte den fyllnad/text-uppdelning den gamla gröna kärvde.
`#C9741C` går inte att få dit (3,3:1 som text) — där finns `--warn-ink` kvar, av
fysik och inte av smak.

Typsnitten har tre roller, och rollen avgör vem som talar: **Familjen Grotesk**
(Letters from Sweden, ritat för svensk offentlig text) är människans ord —
rubriker, varunamn, knappar. **IBM Plex Sans** är prosan som förklarar. **IBM
Plex Mono** är maskinens avläsningar — datum, antal, streckkoder. Ett bäst
före-datum är en avläsning och sätts därför aldrig i Familjen.

### Signaturen: ljuset

Skåpet har en enda ljuskälla, i taket, och **dess färgtemperatur är datan**.
`FridgeView` räknar ut `--larm` (0, 0,5 eller 1) ur den öppna luckans innehåll,
och CSS:en tonar in ett varmt lager i toppen. Går något ut snart lyser det varmt
däruppe — kylan sviker just där. Är allt i sin ordning är ljuset genomgående
kallt och vitt. Man ser hela kylskåpets hälsa på ljusets färg innan man läst ett
enda ord, och därför ligger *Ät snart* högst upp: ljuset landar på det som
brådskar.

Ljusgradienten är appens **enda** gradient. Allt annat är matt — det är regeln
som håller designen från att glida iväg till ännu en glasig instrumentpanel.

Hyllplanen är ritade glaskanter så att varorna står på något i stället för att
sväva. Rutorna på en hylla är alltid lika höga: ojämna höjder var halva
rörigheten i den gamla listan.
