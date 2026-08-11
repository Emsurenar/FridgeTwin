/*
  Språklagret. Svenskan i koden är källtexten: t('Sparat') slår upp den engelska
  översättningen när engelska är valt, och faller tillbaka på nyckeln själv när
  en post saknas — en oöversatt sträng visas alltså på svenska i stället för att
  försvinna. Det gör också serverns felmeddelanden översättbara: de är svenska
  strängar, och de som är kända slås upp i samma ordbok vid klientgränsen.

  Valet bor i localStorage per enhet, precis som AI-nyckeln: språket är en
  egenskap hos telefonen i handen, inte hos hushållet.
*/
const LANG_STORAGE = 'fridge_twin_lang';

// Etiketterna står på sitt eget språk med flit — den som inte läser svenska
// ska kunna hitta "English" utan att först förstå ordet "engelska".
export const LANGS = [
  { id: 'sv', label: 'Svenska' },
  { id: 'en', label: 'English' },
];

// Samma minnesfallback som AI-nyckeln: localStorage kastar i privat läge, och
// ett språkval ska inte kunna ge en vit skärm.
let minne = null;

// I Node (testerna) finns varken navigator eller document — därav vakterna.
const browserDefault = () => {
  try {
    return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en';
  } catch {
    return 'sv';
  }
};

export function getLang() {
  try {
    const sparad = localStorage.getItem(LANG_STORAGE);
    if (sparad === 'sv' || sparad === 'en') return sparad;
  } catch { /* privat läge */ }
  return minne || browserDefault();
}

// Prenumeration av samma skäl som AI-nyckelns: valet görs i Inställningar men
// ändrar varenda text i appen, så bytet måste vara en händelse.
const lyssnare = new Set();
export function subscribeLang(fn) {
  lyssnare.add(fn);
  return () => lyssnare.delete(fn);
}

const settLangAttribut = (lang) => {
  try { document.documentElement.lang = lang; } catch { /* Node */ }
};
settLangAttribut(getLang());

export function setLang(lang) {
  minne = lang;
  try { localStorage.setItem(LANG_STORAGE, lang); } catch { /* sessionen ut */ }
  settLangAttribut(lang);
  for (const fn of lyssnare) fn();
}

export function t(key, vars) {
  let s = getLang() === 'sv' ? key : (EN[key] ?? key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

// Exporteras för testet som kontrollerar att platshållarna stämmer överens.
export const EN = {
  // Läget som en mening (lage.js)
  'Kylskåpet är tomt.': 'The fridge is empty.',
  'vara har gått ut.': 'item has expired.',
  'varor har gått ut.': 'items have expired.',
  'vara bör ätas i dag.': 'item should be eaten today.',
  'varor bör ätas i dag.': 'items should be eaten today.',
  'vara går ut inom tre dagar.': 'item expires within three days.',
  'varor går ut inom tre dagar.': 'items expire within three days.',
  'vara går ut den här veckan.': 'item expires this week.',
  'varor går ut den här veckan.': 'items expire this week.',
  'Allt håller sig ett tag till.': 'Everything keeps for a while longer.',

  // Datum och mängd (fmt.js)
  'Kylen': 'Fridge',
  'Frysen': 'Freezer',
  'Skafferiet': 'Pantry',
  'gick ut för {n} dagar sedan': 'expired {n} days ago',
  'gick ut i går': 'expired yesterday',
  'går ut i dag': 'expires today',
  'går ut i morgon': 'expires tomorrow',
  'om {n} dagar': 'in {n} days',
  '{n} d sedan': '{n} d ago',
  'i går': 'yesterday',
  'i dag': 'today',
  'i morgon': 'tomorrow',
  '{n} dagar': '{n} days',
  'inget datum': 'no date',
  '{n} dagar sedan': '{n} days ago',
  '{n} st': '{n} pcs',
  'i dag {time}': 'today {time}',
  'i går {time}': 'yesterday {time}',

  // Redan hemma (owned.js)
  '{n} st i {place}': '{n} in the {place}',

  // Kylskåpsvyn
  'Håller sig': 'Still good',
  'Allt': 'All',
  'Kyl': 'Fridge',
  'Frys': 'Freezer',
  'Skafferi': 'Pantry',
  'Öppnar kylskåpet…': 'Opening the fridge…',
  'Kunde inte hämta lagret.': 'Couldn’t load the inventory.',
  'Försök igen': 'Try again',
  'Stäng sök': 'Close search',
  'Sök vara': 'Search items',
  'Lägg till vara': 'Add item',
  'Sök i hela kylskåpet': 'Search the whole fridge',
  'Visa utrymme': 'Filter by space',
  'Träff': 'Match',
  'Träffar': 'Matches',
  'Ingen vara heter så.': 'No item by that name.',
  'Skanna en streckkod eller tryck på plus.': 'Scan a barcode or tap plus.',
  'Inget här ännu.': 'Nothing here yet.',
  'Ät nu': 'Eat now',
  'Den här veckan': 'This week',
  'Utan datum': 'No date',
  'Sätt datum': 'Set date',
  '{n} vara': '{n} item',
  '{n} varor': '{n} items',
  'av {n}': 'of {n}',

  // Navigering och toasts (App)
  'Kylskåpet': 'Fridge',
  'Recept': 'Recipes',
  'Inställningar': 'Settings',
  'Skanna streckkod': 'Scan barcode',
  'nya receptförslag': 'new recipe suggestions',
  'Lagret sparas inte — varor kan försvinna. Läs mer': 'Inventory isn’t being saved — items can disappear. Learn more',
  '1 vara lades tillbaka': '1 item was restored',
  '{n} varor lades tillbaka': '{n} items were restored',
  '{name} inlagd': '{name} added',
  'Inget kunde läggas in': 'Nothing could be added',
  '{a} av {b} inlagda — resten misslyckades': '{a} of {b} added — the rest failed',
  '{n} varor inlagda': '{n} items added',
  'Servern hittade inte varan just nu. Försök igen.': 'The server couldn’t find the item just now. Try again.',
  'Varan är redan borttagen': 'The item is already removed',
  'Varan var redan borttagen': 'The item was already removed',
  'Sparat': 'Saved',
  '{name} slängd': '{name} thrown away',
  '{name} slut': '{name} finished',
  'Ångra': 'Undo',
  '{name}: {n} kvar': '{name}: {n} left',
  'Inga förslag den här gången': 'No suggestions this time',
  'Receptförslagen är klara': 'The recipe suggestions are ready',
  'Visa': 'Show',

  // Skannern
  '3 dagar': '3 days',
  '1 vecka': '1 week',
  '1 månad': '1 month',
  'Kunde inte tolka "{raw}"': 'Couldn’t interpret "{raw}"',
  'Hittade inget datum på bilden': 'No date found in the photo',
  'Läste {date}': 'Read {date}',
  'Kameran nekades. Tillåt kameraåtkomst för sajten och försök igen.': 'Camera access was denied. Allow camera access for this site and try again.',
  'Kunde inte starta kameran.': 'Couldn’t start the camera.',
  'Stäng': 'Close',
  'Klar': 'Done',
  'Autoläge på': 'Auto mode on',
  'Autoläge av': 'Auto mode off',
  'Startar kameran…': 'Starting the camera…',
  'Rikta mot streckkoden': 'Point at the barcode',
  'Lägg till för hand i stället': 'Add by hand instead',
  'Avbryt': 'Cancel',
  'Antal': 'Quantity',
  'Bäst före': 'Best before',
  'Fota datumet': 'Snap the date',
  'Läser…': 'Reading…',
  'Läst från förpackningen:': 'Read from the package:',
  'Ta bort': 'Remove',
  'Hoppa över': 'Skip',
  'Lägg till': 'Add',
  'Lägg till {n} st': 'Add {n}',
  'Okänd streckkod': 'Unknown barcode',
  'Vad är det för vara?': 'What item is it?',
  'Spara': 'Save',
  'Vara utan streckkod': 'Item without a barcode',
  'Redan hemma': 'Already at home',
  'Ta en ur {place}': 'Take one from the {place}',
  'Markera som slut': 'Mark as finished',
  'Varans namn': 'Item name',

  // Inställningar
  'Hushållsnyckel, AI och svinn.': 'Household key, AI and waste.',
  'Servern saknar': 'The server has no',
  '— lagret ligger på ett tillfälligt filsystem och försvinner när servern startar om. Se README:n.': '— the inventory sits on a temporary filesystem and disappears when the server restarts. See the README.',
  'Språk': 'Language',
  'Hushåll': 'Household',
  'Alla som har den här nyckeln ser samma kylskåp. Dela den med hushållet — och bara med dem, nyckeln är hela åtkomsten.': 'Everyone with this key sees the same fridge. Share it with your household — and only with them, the key is all it takes.',
  'Kopiera': 'Copy',
  'Dölj': 'Hide',
  'QR-kod': 'QR code',
  'Anslut till ett annat kylskåp': 'Connect to another fridge',
  'ft-… eller en delad länk': 'ft-… or a shared link',
  'Byt nyckel': 'Switch key',
  'Fotoigenkänning, datumläsning och recept använder Claude. Nyckeln är din egen och sparas bara i den här webbläsaren — den skickas aldrig till FridgeTwins server, och andra i hushållet lägger in sin egen.': 'Photo recognition, date reading and recipes use Claude. The key is your own and is stored only in this browser — it is never sent to FridgeTwin’s server, and others in the household add their own.',
  'Anthropic API-nyckel': 'Anthropic API key',
  'Hämta en nyckel': 'Get a key',
  'Modell': 'Model',
  'Claude Sonnet 5 · snabb & smart (standard)': 'Claude Sonnet 5 · fast & smart (default)',
  'Claude Opus 4.8 · smartast': 'Claude Opus 4.8 · smartest',
  'Claude Haiku 4.5 · snabbast & billigast': 'Claude Haiku 4.5 · fastest & cheapest',
  'Svinn': 'Waste',
  'Av {total} borttagna varor har {thrown} slängts ({pct} %).': 'Of {total} removed items, {thrown} were thrown away ({pct}%).',
  'Flytta hit lagret': 'Move the inventory here',
  'Den här telefonen har en egen kopia av lagret. Har du precis kopplat in en databas, eller ser kylskåpet tommare ut än det ska, kan du skicka upp kopian. Varor som redan finns på servern lämnas i fred.': 'This phone keeps its own copy of the inventory. If you just connected a database, or the fridge looks emptier than it should, you can upload the copy. Items already on the server are left alone.',
  'Skickar…': 'Uploading…',
  'Skicka upp 1 vara': 'Upload 1 item',
  'Skicka upp {n} varor': 'Upload {n} items',
  'Inget sparat på den här telefonen': 'Nothing saved on this phone',
  'Servern hade redan allt': 'The server already had everything',
  'Länken kopierad': 'Link copied',
  'Kunde inte kopiera — markera länken i stället': 'Couldn’t copy — select the link instead',
  'Bytte kylskåp': 'Switched fridge',
  'Om': 'About',
  'Produktdata kommer från': 'Product data comes from',
  ', en öppen databas (ODbL). Saknas en vara kan du lägga till den där — och den du matar in här känns igen nästa gång.': ', an open database (ODbL). If an item is missing you can add it there — and anything you enter here is recognized next time.',
  'Lagring:': 'Storage:',
  'lokal databasfil': 'local database file',
  'Nollställ nyckeln? Du får ett nytt, tomt kylskåp. Spara nuvarande nyckel först om du vill tillbaka.': 'Reset the key? You get a new, empty fridge. Save the current key first if you want to come back.',
  'Nollställ hushållsnyckel': 'Reset household key',

  // Receptvyn
  'Tömmer ur kylskåpet': 'Clears from your fridge',
  'Använder': 'Uses',
  'Betygsätt {title}': 'Rate {title}',
  '{n} av 5': '{n} of 5',
  'Behöver köpas': 'Need to buy',
  'Vad kan jag laga?': 'What can I cook?',
  'Lagret är tomt — skanna in något först.': 'The fridge is empty — scan something in first.',
  'Förslagen prioriterar {list}.': 'Suggestions prioritize {list}.',
  'Förslagen utgår från vad som finns hemma just nu.': 'Suggestions are based on what’s at home right now.',
  'Receptförslag kräver en Anthropic-nyckel.': 'Recipe suggestions require an Anthropic key.',
  'Öppna inställningar': 'Open settings',
  'Måltid': 'Meal',
  'Frukost': 'Breakfast',
  'Middag': 'Dinner',
  'Något särskilt?': 'Anything specific?',
  'Vegetariskt, snabbt, barnvänligt…': 'Vegetarian, quick, kid-friendly…',
  'Tänker…': 'Thinking…',
  'Föreslå rätter': 'Suggest dishes',
  'Du kan gå till kylskåpet under tiden. Förslagen dyker upp här när de är klara.': 'You can go to the fridge in the meantime. The suggestions appear here when they’re ready.',
  'Inga förslag än': 'No suggestions yet',
  'Förslag': 'Suggestions',
  'Ta bort förslagen från {time}': 'Remove the suggestions from {time}',
  'Rensa hela receptloggen?': 'Clear the whole recipe log?',
  'Rensa loggen': 'Clear the log',

  // Lägg in en vara
  'Lägg in en vara': 'Add an item',
  'Skanna': 'Scan',
  'Identifiera med foto': 'Identify from a photo',
  'Vad är det?': 'What is it?',
  'Känd sedan tidigare': 'Known from before',
  'Känd vara': 'Known item',
  'Ändra': 'Change',
  'Var ska den ligga?': 'Where does it go?',
  'Lägger in…': 'Adding…',
  'Lägg in': 'Add',

  // Varans kort
  'Var ligger den?': 'Where is it?',
  'Slängd': 'Thrown away',
  'Slut': 'Finished',
  'Sparar…': 'Saving…',
  'Inget ändrat': 'Nothing changed',

  // Fälten
  'Färre': 'Fewer',
  'Fler': 'More',
  '2 dagar': '2 days',
  '5 dagar': '5 days',
  '2 veckor': '2 weeks',
  'Fota bäst före-datumet': 'Snap the best-before date',
  'Ta bort datum': 'Remove date',
  'Utan datum kan varan inte påminna om sig själv.': 'Without a date the item can’t remind you about itself.',

  // Fotoigenkänning
  'Fota lösvikt eller en hel hylla — Claude föreslår vad det är, du bockar av.': 'Photograph loose produce or a whole shelf — Claude suggests what it is, you tick off.',
  'Ta ett nytt foto': 'Take a new photo',
  'Ta foto': 'Take a photo',
  'Tittar på bilden…': 'Looking at the photo…',
  'Claude tittar på bilden…': 'Claude is looking at the photo…',
  'Hittade inga varor på bilden': 'No items found in the photo',
  '{n} förslag': '{n} suggestions',
  'Lägg till {n} varor': 'Add {n} items',
  'Inget valt': 'Nothing selected',

  // Bild och kamera
  'Kunde inte läsa bilden': 'Couldn’t read the image',
  'Filen är ingen bild': 'The file is not an image',
  'Kameran kräver en säker anslutning (https eller localhost).': 'The camera requires a secure connection (https or localhost).',

  // Klientens API-lager
  'Ingen kontakt med servern': 'No contact with the server',
  'Servern svarar inte just nu': 'The server isn’t responding right now',
  'Fel {n}': 'Error {n}',
  'Ogiltig nyckel': 'Invalid key',

  // Serverns felsträngar, översatta vid klientgränsen
  'Saknar eller ogiltig hushållsnyckel': 'Missing or invalid household key',
  'Databasen är inte tillgänglig': 'The database is unavailable',
  'Ogiltig streckkod': 'Invalid barcode',
  'Namn krävs': 'A name is required',
  'Ogiltigt datum': 'Invalid date',
  'Ogiltigt antal': 'Invalid quantity',
  'Ogiltig plats': 'Invalid location',
  'Ogiltigt öppnat-datum': 'Invalid opened date',
  'Inget att uppdatera': 'Nothing to update',
  'Varan finns inte': 'The item doesn’t exist',
  'För stor begäran': 'Request too large',
  'Ogiltig JSON': 'Invalid JSON',
  'Serverfel': 'Server error',

  // AI-fel
  'Ingen AI-nyckel på den här enheten. Lägg in en under Inställningar.': 'No AI key on this device. Add one under Settings.',
  'Nyckeln avvisades. Kontrollera den under Inställningar.': 'The key was rejected. Check it under Settings.',
  'För många anrop mot Anthropic. Vänta en stund.': 'Too many requests to Anthropic. Wait a moment.',
  'Anthropic svarar inte just nu. Försök igen om en stund.': 'Anthropic isn’t responding right now. Try again in a moment.',
  'Anropet tog för lång tid. Kontrollera uppkopplingen och försök igen.': 'The request took too long. Check your connection and try again.',
  'AI-anropet misslyckades.': 'The AI request failed.',
  'AI:n avböjde förfrågan.': 'The AI declined the request.',
  'Svaret hann inte bli klart. Försök igen.': 'The answer didn’t finish in time. Try again.',
  'Modellen hann inte svara klart. Försök igen, eller välj en annan modell under Inställningar.': 'The model couldn’t finish its answer. Try again, or pick another model under Settings.',
  'Tomt svar från AI:n.': 'Empty response from the AI.',
  'Kunde inte tolka AI-svaret.': 'Couldn’t parse the AI response.',
  'Ogiltig bild.': 'Invalid image.',
};
