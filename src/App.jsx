import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Refrigerator, ChefHat, Settings as SettingsIcon, ScanLine, Loader2, AlertTriangle } from 'lucide-react';
import * as api from './lib/api';
import { subscribeAi, aiReady, suggestRecipes } from './lib/ai';
import { t, subscribeLang, getLang } from './lib/i18n';
import { loadLog, addEntry, removeEntry, clearLog, newEntryId } from './lib/recipeLog';
import { loadMirror, saveMirror, missingFromServer } from './lib/mirror';
import { loadRatings, setRating } from './lib/ratings';
import FridgeView from './components/FridgeView';
import RecipesView from './components/RecipesView';
import SettingsView from './components/SettingsView';
import ScannerView from './components/ScannerView';
import ItemSheet from './components/ItemSheet';
import AddSheet from './components/AddSheet';
import PhotoIdentifySheet from './components/PhotoIdentifySheet';
import Toast from './components/Toast';

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('inventory');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Den öppna luckan styr var nya varor hamnar — i formuläret och i skannern.
  const [door, setDoor] = useState('fridge');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  /*
    null = vi vet inte än. Utan det tredje läget är "lagret sparas inte" sant
    redan vid första målningen, så varningen hade blinkat rött vid varje start
    även på en app med Turso inkopplad — och blivit stående för alltid om
    health-anropet failade en enda gång. En varning som ropar varg slutar man
    läsa, och just den här får inte sluta läsas.
  */
  const [persistent, setPersistent] = useState(null);
  // Receptförslagen bor här och inte i RecipesView. Vyn avmonteras vid varje
  // flikbyte, och tidigare försvann både pågående körning och färdiga förslag
  // med den — man kunde inte ens titta i kylskåpet medan modellen tänkte.
  const [recipeLog, setRecipeLog] = useState(loadLog);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [recipesUnseen, setRecipesUnseen] = useState(false);
  // Betygen bor här av samma skäl som loggen: RecipesView avmonteras vid varje
  // flikbyte, och de ska med i nästa promptanrop oavsett var man står.
  const [ratings, setRatings] = useState(loadRatings);
  const toastTimer = useRef(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const toastRef = useRef(null);
  toastRef.current = toast;
  /*
    Två spärrar mot dubbeltryck. Knapparnas disabled sätts först vid nästa
    rendering, så två snabba tryck hinner igenom båda två — och då skickas
    samma count-1 två gånger, vilket lämnar kvar ett exemplar för mycket.
    Refs uppdateras direkt och stänger glappet.
  */
  const consuming = useRef(new Set());
  const recipesRunning = useRef(false);
  // Spegeln får inte skrivas innan första hämtningen lyckats — annars sparar
  // appen sitt tomma starttillstånd över det som faktiskt fanns.
  const loadedOnce = useRef(false);
  const loadSeq = useRef(0);
  // Senaste *besvarade* health-anropet. Se load().
  const senastKandaDurable = useRef(null);

  const showToast = useCallback((message, type = 'success', action = null) => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2500);
  }, []);

  const load = useCallback(async () => {
    // Två hämtningar kan överlappa (mount + visibilitychange, eller ett tryck på
    // "Försök igen"). Utan sekvensnummer kan ett äldre svar vinna och skriva
    // över optimistiska ändringar som redan gått igenom.
    const min = ++loadSeq.current;
    setLoading(true);
    try {
      /*
        Health först, för svaret avgör vem som är sanningen. Säger servern att
        den inte är beständig är dess databas den i /tmp, och på Vercel är den
        per instans — då är telefonens spegel den enda som sett hela lagret, och
        det servern saknar läggs tillbaka.

        Med Turso inkopplat rörs spegeln inte. Där vore en återläggning ingen
        räddning utan ett sätt att återuppväcka varor som någon annan i
        hushållet medvetet tagit bort.
      */
      const health = await api.getHealth().catch(() => null);
      if (min !== loadSeq.current) return;
      /*
        Ett misslyckat health-anrop betyder inte att servern hunnit bli
        beständig — det betyder att vi inte fick svar. Tidigare nollställdes
        vetskapen till null, och då slog ett enda 504 från en kall lambda av
        allt på en gång: spegeln lästes inte, spegeln skrevs inte, och den röda
        bannern "Lagret sparas inte" försvann. Man kunde skanna in hela
        matkassen i en lambdas /tmp utan en enda varning, och tappa allt när
        instansen återvanns. Det senast kända svaret är en bättre gissning än
        ingen alls.
      */
      const durable = health ? Boolean(health.persistent) : senastKandaDurable.current;
      if (health) senastKandaDurable.current = durable;
      setPersistent(durable);

      let fresh = await api.getInventory();
      if (min !== loadSeq.current) return;

      if (durable === false) {
        const missing = missingFromServer(loadMirror(api.getKey()), fresh);
        if (missing.length) {
          const res = await api.syncItems(missing);
          /*
            Sekvenskontroll även här. Synken kan ta lång tid, och hinner man
            byta hushållsnyckel under tiden skrevs det gamla hushållets lager
            ner under den nya nyckeln — och sköts sedan in i sambons kylskåp.
          */
          if (min !== loadSeq.current) return;
          fresh = res.items;
          if (res.restored) {
            showToast(res.restored === 1
              ? t('1 vara lades tillbaka') : t('{n} varor lades tillbaka', { n: res.restored }));
          }
        }
      }

      setItems(fresh);
      /*
        Spegeln skrivs bara när vi vet att servern inte är beständig, och aldrig
        när den skulle krympa en befintlig kopia till noll. Misslyckas health
        medan lagret svarar tomt — en kall lambda räcker — hade den enda
        kvarvarande kopian av lagret raderats av sitt eget skyddsnät.
      */
      if (durable === false && (fresh.length || !loadMirror(api.getKey()).length)) {
        saveMirror(api.getKey(), fresh);
      }
      loadedOnce.current = true;
      setLoadError(null);
    } catch (e) {
      // Tomt lager och "kunde inte hämta lagret" ser likadant ut i datan men är
      // olika saker. Utan skillnaden påstår appen att kylskåpet är tomt när det
      // egentligen är servern som är nere.
      setLoadError(e.message);
      showToast(e.message, 'danger');
    } finally {
      if (min === loadSeq.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // En delad länk (#key=…) ska gälla direkt, innan lagret hämtas.
    api.adoptKeyFromUrl();
    load(); // hämtar health själv — den avgör om spegeln ska användas

    // Lagret delas med hushållet, så det kan ha ändrats medan appen låg i
    // bakgrunden. Hämta om när den kommer fram igen — billigare och mindre
    // påträngande än en uppdateringsknapp man ändå glömmer trycka på.
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Pricken släcks så fort man tittat, oavsett vilken väg man tog dit —
  // navknappen, toasten eller "Öppna inställningar".
  useEffect(() => {
    if (tab === 'recipes') setRecipesUnseen(false);
  }, [tab]);

  // Spegeln följer lagret. En effekt i stället för ett anrop i varje mutation:
  // det är en plats att ha rätt på, inte sex.
  useEffect(() => {
    if (loadedOnce.current && persistent === false) saveMirror(api.getKey(), items);
  }, [items, persistent]);

  // Servern slår ihop dubbletter, så svaret kan vara antingen en ny rad eller
  // en uppdaterad. Ett enda upsert-mönster täcker båda.
  const upsert = (item) => setItems(prev => {
    const i = prev.findIndex(p => p.id === item.id);
    if (i === -1) return [...prev, item];
    const next = [...prev];
    next[i] = item;
    return next;
  });

  const handleAdd = async (payload) => {
    try {
      const item = await api.addItem(payload);
      upsert(item);
      showToast(t('{name} inlagd', { name: item.name }));
      return item;
    } catch (e) {
      showToast(e.message, 'danger');
      throw e;
    }
  };

  const handleAddMany = async (list) => {
    const added = [];
    let sista;
    for (const payload of list) {
      try {
        const item = await api.addItem(payload);
        upsert(item);
        added.push(item);
      } catch (e) {
        // Ett enstaka fel ska inte stoppa resten — men det får inte heller
        // tystas. Tidigare sa toasten "0 varor inlagda" i grönt när allt failat.
        sista = e;
      }
    }
    if (!added.length) {
      showToast(sista?.message || t('Inget kunde läggas in'), 'danger');
      return false;
    }
    if (added.length < list.length) {
      showToast(t('{a} av {b} inlagda — resten misslyckades', { a: added.length, b: list.length }), 'danger');
      return true;
    }
    showToast(added.length === 1
      ? t('{name} inlagd', { name: added[0].name })
      : t('{n} varor inlagda', { n: added.length }));
    return true;
  };

  /*
    Lagret delas, så en vara kan ha tagits bort av någon annan i hushållet
    medan den låg öppen här. Servern svarar 404, och då är det egna listan som
    har fel — inte servern. Rätt svar är att släppa varan och säga varför,
    inte att låta den ligga kvar och gå att trycka på igen.
  */
  /*
    En 404 är bara auktoritativ när servern faktiskt minns.

    Utan Turso ligger lagret i en lambdas /tmp, och nästa anrop kan träffa en
    kall instans som aldrig sett raden. Då betyder 404 "den här instansen
    känner inte till varan", inte "varan är borttagen" — men appen trodde på
    den, plockade bort raden ur listan, och effekten som speglar listan
    raderade den strax därefter ur spegeln. Spegeln var den enda kvarvarande
    kopian, så varan var borta för gott, med ett besked som påstod att någon
    annan i hushållet redan tagit bort den.
  */
  const dropIfGone = (id, e) => {
    if (e.status !== 404) return false;
    if (persistent === false) {
      showToast(t('Servern hittade inte varan just nu. Försök igen.'), 'danger');
      return true;
    }
    setItems(prev => prev.filter(i => i.id !== id));
    showToast(t('Varan är redan borttagen'), 'danger');
    return true;
  };

  /*
    Svarar om arket ska stängas. Tidigare svarade den ingenting alls, och arket
    stängdes oavsett — misslyckades sparningen försvann både ändringen och
    formuläret, och kvar fanns bara en röd toast.

    404 är undantaget: då finns varan inte längre, och det finns inget att
    försöka igen på. Andra fel går att försöka om, så då står arket kvar — och
    så gör det även vid en osäker 404 mot en icke-beständig server, för där står
    varan kvar i listan och ska gå att spara om.
  */
  const handlePatch = async (id, patch) => {
    try {
      upsert(await api.patchItem(id, patch));
      showToast(t('Sparat'));
      return true;
    } catch (e) {
      if (dropIfGone(id, e)) return persistent !== false;
      showToast(e.message, 'danger');
      return false;
    }
  };

  const handleRemove = async (item, reason) => {
    setSelected(null);
    setItems(prev => prev.filter(i => i.id !== item.id)); // optimistiskt: raden ska försvinna direkt
    try {
      await api.removeItem(item.id, reason);
      showToast(t(reason === 'waste' ? '{name} slängd' : '{name} slut', { name: item.name }), reason === 'waste' ? 'danger' : 'success', {
        label: t('Ångra'),
        onClick: async () => {
          setToast(null);
          try {
            upsert(await api.restoreItem(item.id));
          } catch (e) {
            showToast(e.message, 'danger');
          }
        },
      });
    } catch (e) {
      /*
        404 betyder att någon annan redan tagit bort den — då är den borta, och
        att lägga tillbaka raden vore att ljuga om lagret.

        Utom när servern inte är beständig: då kan 404 lika gärna komma från en
        kall instans som aldrig sett raden, och den optimistiska borttagningen
        skulle strax därefter radera varan ur spegeln — den enda kopia som fanns.
      */
      if (e.status === 404) {
        if (persistent === false) {
          upsert(item);
          return showToast(t('Servern hittade inte varan just nu. Försök igen.'), 'danger');
        }
        return showToast(t('Varan var redan borttagen'), 'danger');
      }
      upsert(item); // något annat gick fel — lägg tillbaka raden
      showToast(e.message, 'danger');
    }
  };

  /*
    Att skanna en tom förpackning är samma sak som att säga "den är uppäten".
    Sista exemplaret tas bort med ångra-toasten; är det fler kvar räknas det
    bara ner, för då är varan inte slut.
  */
  const handleConsumeOne = async (item) => {
    if (consuming.current.has(item.id)) return;
    consuming.current.add(item.id);
    try {
      // Servern räknar, inte vi. Antalet i klientens minne kan vara timmar
      // gammalt, och att skriva tillbaka det hade skrivit över vad någon annan
      // i hushållet gjort under tiden.
      const { item: updated, removed } = await api.consumeOne(item.id);
      if (!removed) {
        upsert(updated);
        return showToast(t('{name}: {n} kvar', { name: updated.name, n: updated.count }));
      }
      setItems(prev => prev.filter(i => i.id !== item.id));
      showToast(t('{name} slut', { name: updated.name }), 'success', {
        label: t('Ångra'),
        onClick: async () => {
          setToast(null);
          try {
            upsert(await api.restoreItem(item.id));
          } catch (e) {
            showToast(e.message, 'danger');
          }
        },
      });
    } catch (e) {
      if (!dropIfGone(item.id, e)) showToast(e.message, 'danger');
    } finally {
      consuming.current.delete(item.id);
    }
  };

  /*
    Receptkörningen ligger i App så att den överlever ett flikbyte. Blir den
    klar medan man tittar på något annat säger toasten till — annars hade man
    fått gissa när det var dags att gå tillbaka.
  */
  const runRecipes = useCallback(async ({ meal, request }) => {
    if (recipesRunning.current) return;
    recipesRunning.current = true;
    setRecipeBusy(true);
    try {
      const recipes = await suggestRecipes(items, { meal, request, ratings });
      if (!recipes.length) return showToast(t('Inga förslag den här gången'), 'danger');
      setRecipeLog(prev => addEntry(prev, {
        id: newEntryId(),
        at: new Date().toISOString(),
        meal,
        request,
        recipes,
      }));
      if (tabRef.current !== 'recipes') {
        // Pricken i navet är beskedet som inte kan gå förlorat. Toasten är ett
        // tillägg — och den får inte kasta bort en ångra-knapp som ligger
        // framme, för den åtgärden går inte att nå på något annat sätt.
        setRecipesUnseen(true);
        if (!toastRef.current?.action) {
          showToast(t('Receptförslagen är klara'), 'success', {
            label: t('Visa'),
            onClick: () => { setToast(null); setTab('recipes'); },
          });
        }
      }
    } catch (e) {
      showToast(e.message, 'danger');
    } finally {
      recipesRunning.current = false;
      setRecipeBusy(false);
    }
  }, [items, ratings, showToast]);

  const handleKeyChanged = (reset = false) => {
    if (reset) api.resetKey();
    // Spegeln bär sin egen nyckel sedan dess, så loadMirror vägrar redan lämna
    // ut den under fel hushåll. Att radera den här hade förstört det förra
    // kylskåpets enda lokala kopia i onödan.
    loadedOnce.current = false;
    setItems([]);
    load();
    setTab('inventory');
  };

  // Prenumeration och inte ett avläst värde: nyckeln sätts i Inställningar, och
  // knapparna den styr sitter i skannern och receptvyn. Utan den här kopplingen
  // syntes en nyinlagd nyckel först när något annat råkade rendera om.
  const aiOk = useSyncExternalStore(subscribeAi, aiReady);
  // Språket byts i Inställningar men ändrar varenda text. App är trädets rot,
  // så en omrendering här ritar om alltihop på det nya språket.
  useSyncExternalStore(subscribeLang, getLang);

  /*
    Utan TURSO_URL ligger lagret i serverns /tmp. På Vercel är den katalogen
    dessutom *per instans*, så två anrop kan träffa två olika tomma databaser —
    det ser ut som att varor försvinner när man byter utrymme, fast det som
    händer är att man växlar mellan flera lager.

    Varningen fanns bara under Inställningar, dit man inte går förrän man redan
    tappat maten. Den hör hemma här, ovanför allt, tills den är åtgärdad.
  */
  const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const storageAtRisk = persistent === false && !isLocalhost;

  const navItems = [
    { id: 'inventory', icon: Refrigerator, label: t('Kylskåpet') },
    { id: 'recipes', icon: ChefHat, label: t('Recept') },
    { id: 'settings', icon: SettingsIcon, label: t('Inställningar') },
  ];

  return (
    <>
      <div className="content-area" tabIndex={-1}>
        {storageAtRisk && (
          <button className="banner banner-danger banner-btn" onClick={() => setTab('settings')}>
            <AlertTriangle size={17} />
            <span>{t('Lagret sparas inte — varor kan försvinna. Läs mer')}</span>
          </button>
        )}

        {tab === 'inventory' && (
          <FridgeView items={items} loading={loading} error={loadError} onRetry={load}
            onSelect={setSelected} onAddClick={() => setAddOpen(true)} />
        )}
        {tab === 'recipes' && (
          <RecipesView items={items} aiOk={aiOk} busy={recipeBusy} log={recipeLog}
            ratings={ratings}
            onRate={(title, n) => setRatings(prev => setRating(prev, title, n))}
            onRun={runRecipes} onGoToSettings={() => setTab('settings')}
            onForget={(id) => setRecipeLog(prev => removeEntry(prev, id))}
            onClear={() => setRecipeLog(clearLog())} />
        )}
        {tab === 'settings' && (
          <SettingsView persistent={persistent}
            onKeyChanged={handleKeyChanged} onReload={load} onToast={showToast} />
        )}
      </div>

      {!scannerOpen && (
        <nav className="bottom-nav">
          <button className={`nav-item ${tab === 'inventory' ? 'active' : ''}`}
            aria-current={tab === 'inventory' ? 'page' : undefined}
            aria-label={navItems[0].label}
            onClick={() => setTab('inventory')}>
            <Refrigerator size={19} />
            <span>{navItems[0].label}</span>
          </button>
          <button className="scan-nav-btn" onClick={() => setScannerOpen(true)} aria-label={t('Skanna streckkod')}>
            <ScanLine size={22} strokeWidth={2.2} />
          </button>
          {navItems.slice(1).map(item => (
            <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => setTab(item.id)}>
              {/* Snurran i navet är hela kvittot på att körningen fortsätter
                  när man går härifrån. Utan den ser bakgrundsarbetet ut som
                  ingenting alls. */}
              {item.id === 'recipes' && recipeBusy
                ? <Loader2 size={19} className="spin" />
                : <item.icon size={19} />}
              <span>
                {item.label}
                {item.id === 'recipes' && recipesUnseen && !recipeBusy && (
                  <i className="nav-dot" aria-label={t('nya receptförslag')} />
                )}
              </span>
            </button>
          ))}
        </nav>
      )}

      {scannerOpen && (
        <ScannerView defaultLocation={door} items={items} aiOk={aiOk} onAdd={handleAdd}
          onConsumeOne={handleConsumeOne} onLocationChange={setDoor}
          onClose={() => setScannerOpen(false)} onToast={showToast} />
      )}
      {selected && (
        <ItemSheet item={selected} aiOk={aiOk} onClose={() => setSelected(null)}
          onPatch={handlePatch} onRemove={handleRemove} onToast={showToast} />
      )}
      {addOpen && (
        <AddSheet aiOk={aiOk} defaultLocation={door} onClose={() => setAddOpen(false)} onAdd={handleAdd} onToast={showToast}
          onScan={() => { setAddOpen(false); setScannerOpen(true); }}
          onPhoto={() => { setAddOpen(false); setPhotoOpen(true); }} />
      )}
      {photoOpen && (
        <PhotoIdentifySheet onClose={() => setPhotoOpen(false)} onAddMany={handleAddMany} onToast={showToast} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} action={toast.action} />}
    </>
  );
}
