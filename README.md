# FridgeTwin

En digital tvilling av kylskåpet, som mobilapp (PWA). Skanna streckkoden på en
vara så identifieras den mot Open Food Facts och hamnar i lagret — med plats,
antal och bäst före-datum. Appen visar vad som brådskar och Claude föreslår vad
du kan laga på det som faktiskt finns hemma.

## Funktioner

- **Tid, inte plats** — allt som brådskar i kyl, frys och skafferi står i samma lista, grupperat efter hur bråttom det är: *Ät nu*, *Den här veckan*, *Utan datum*, *Håller sig*. Utrymmet är en upplysning på raden, inte ett läge man växlar mellan. Överst säger appen läget i en mening: *"1 vara har gått ut."*
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

### Koppla in Turso — steg för steg

Tio minuter, en gång. Allt utom sista steget görs i terminalen.

**1. Installera CLI:t och skapa ett konto**

```bash
brew install tursodatabase/tap/turso
turso auth signup     # har du redan konto: turso auth login
```

Webbläsaren öppnas för inloggning. Gratisnivån räcker med marginal för ett
kylskåp.

**2. Skapa databasen och hämta de två värdena**

```bash
turso db create fridgetwin
turso db show fridgetwin --url        # värde 1
turso db tokens create fridgetwin     # värde 2
```

Det är **två separata värden** från två separata kommandon — token ligger inte i
URL:en:

| Kommando | Ser ut som | Miljövariabel |
|---|---|---|
| `turso db show … --url` | `libsql://fridgetwin-dittnamn.turso.io` | `TURSO_URL` |
| `turso db tokens create …` | `eyJhbGciOiJFZERTQSIs…` (några hundra tecken) | `TURSO_TOKEN` |

Kopiera båda någonstans innan du går vidare. Token visas bara en gång — tappar
du bort den kör du bara kommandot igen och får en ny.

**3. Lägg in dem i Vercel**

*Vercel → ditt projekt → Settings → Environment Variables.* Lägg till en i
taget, för **alla** miljöer (Production, Preview, Development):

| Name | Value |
|---|---|
| `TURSO_URL` | värde 1 — `libsql://…turso.io` |
| `TURSO_TOKEN` | värde 2 — den långa slumpsträngen |

**4. Deploya om**

Variablerna läses vid build, inte i efterhand — en befintlig deploy plockar
alltså inte upp dem. *Deployments → senaste → ⋯ → Redeploy.* Schemat skapas
automatiskt vid första anropet, så det finns inget migreringssteg.

**5. Kontrollera**

Öppna `https://din-app.vercel.app/api/health`. Det ska stå `"persistent": true`.
Gör det det är du klar: varningen i appen försvinner och lagret ligger kvar.

**6. Flytta över det du redan har**

Servern är nu ny och tom, medan telefonen har hela lagret i sin spegel. Gå till
*Inställningar → Flytta hit lagret* och tryck **Skicka upp N varor**. Den går på
varje varas id, så den är ofarlig att köra flera gånger och rör inte det som
redan finns.

Gör det från den telefon som har det aktuella lagret. Först därefter delar du
nyckeln med resten av hushållet.

### Spegeln — appen klarar sig utan Turso

Säger `/api/health` att servern **inte** är beständig litar appen på telefonen i
stället. Klienten håller en spegel av lagret i `localStorage`, och upptäcker den
att servern tappat varor lägger den tillbaka dem via `POST /api/inventory/sync`.
Återläggningen går på varans id med `ON CONFLICT DO NOTHING`, så den kan köras
hur många gånger som helst utan att antal dubbleras.

Med Turso inkopplat rörs spegeln inte. Där vore en återläggning ingen räddning
utan ett sätt att återuppväcka varor som någon annan i hushållet medvetet tagit
bort. Spegeln nollställs också när man byter hushållsnyckel — annars hade det
gamla kylskåpets varor skjutits in i det nya.

Det gör appen användbar utan molndatabas, men det är fortfarande en nödlösning:
spegeln bor på *en* enhet, så delat hushåll kräver Turso.

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

**Värme betyder förfall.** Appen är neutral — nästan vit mark (`#F7F7F5`), vita
kort, nästan svart text (`#17191B`). Det enda som får värme är mat som håller på
att bli dålig: rött (`#B5402B`) för det som gått ut eller går ut i dag,
bärnsten (`#9A5A0F`) inom tre dagar. Den enda mättade färg som *inte* betyder
förfall är granen (`#16745A`), som bär allt man kan trycka på.

Det är också en läsbarhetsfråga. Röd/gul/grön är exakt den axel som försvinner
vid rödgrönblindhet; kall→varm är både en ton- och en ljushetsaxel och överlever
färgseendet. `#16745A` klarar 5,7:1 mot vitt både som text och med vit text
ovanpå, så en variabel räcker där den gamla gröna kärvde två.

**Tid är ordningsprincipen, inte plats.** Allt som brådskar i kyl, frys och
skafferi står i samma lista; utrymmet är en upplysning på raden. Tidigare krävdes
tre luckbyten för att se allt som brådskade.

### Signaturen: läget som en mening

De flesta appar visar en siffra med en etikett under. Den här skriver ut sitt
omdöme på svenska — *"1 vara har gått ut."*, *"Allt håller sig ett tag till."* —
och meningen ändras varje dag. Det är hela hälsokontrollen på en rad, och det
enda stället i appen där texten är stor. Logiken bor i `src/lib/lage.js` och är
testad; ordningen är prioritet och inte antal, för har något gått ut spelar det
ingen roll hur mycket annat som är i sin ordning.

### Typsnitt

**Familjen Grotesk** (Letters from Sweden, ritat för svensk offentlig text) bär
identiteten i rubriker och varunamn. **Inter** gör läsbarhetsarbetet i allt
smått — på en telefon vinner tråkigt och korrekt över karaktärsfullt och
riskabelt.

### Vad som ströks, och varför

En tidigare omgång blev teknisk och kall. Det som togs bort:

- **Monospace-versaler.** "Maskinens röst" applicerades tills hela appen skrek i
  terminaltypsnitt. 10px versaler med 0,14em spärr är svårläst på en telefon och
  läser som ett utvecklarverktyg.
- **Streckkoden** — ett svart block med 22 staplar överst i en matapp. Den som
  öppnar kylskåpet i fem sekunder behöver inte ett histogram.
- **Monogrammen** ("RL", "AG") — förkortningar som läste som platshållare.
- **Kant-till-kant med radie 0** — varken kort eller lista; läste som webbsida.
- **Ikonknappar på varje rad** — femton grå ikoner i en lista är brus, och
  "slängd" respektive "slut" förtjänar riktiga etiketter. Besluten bor i varans
  kort.

### Radier

Tre värden, inte sex: kort och ark 18px, allt man trycker på 12px, piller runda.
Blandade radier var det som fick appen att se hopplockad ut.

