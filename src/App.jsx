import { useCallback, useEffect, useRef, useState } from 'react';
import { Refrigerator, ChefHat, Settings as SettingsIcon, ScanLine, Loader2, AlertTriangle } from 'lucide-react';
import * as api from './lib/api';
import { checkServerAi, aiReady, suggestRecipes } from './lib/ai';
import { loadLog, addEntry, removeEntry, clearLog, newEntryId } from './lib/recipeLog';
import { loadMirror, saveMirror, clearMirror, missingFromServer } from './lib/mirror';
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
  const [serverAi, setServerAi] = useState(false);
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

  const showToast = useCallback((message, type = 'success', action = null) => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2500);
  }, []);

  const load = useCallback(async () => {
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
      const durable = health ? Boolean(health.persistent) : null;
      setPersistent(durable);

      let fresh = await api.getInventory();

      if (durable === false) {
        const missing = missingFromServer(loadMirror(api.getKey()), fresh);
        if (missing.length) {
          const res = await api.syncItems(missing);
          fresh = res.items;
          if (res.restored) {
            showToast(res.restored === 1
              ? '1 vara lades tillbaka' : `${res.restored} varor lades tillbaka`);
          }
        }
      }

      setItems(fresh);
      saveMirror(api.getKey(), fresh);
      loadedOnce.current = true;
      setLoadError(null);
    } catch (e) {
      // Tomt lager och "kunde inte hämta lagret" ser likadant ut i datan men är
      // olika saker. Utan skillnaden påstår appen att kylskåpet är tomt när det
      // egentligen är servern som är nere.
      setLoadError(e.message);
      showToast(e.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // En delad länk (#key=…) ska gälla direkt, innan lagret hämtas.
    api.adoptKeyFromUrl();
    load(); // hämtar health själv — den avgör om spegeln ska användas
    checkServerAi().then(setServerAi);

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
    if (loadedOnce.current) saveMirror(api.getKey(), items);
  }, [items]);

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
      showToast(`${item.name} inlagd`);
      return item;
    } catch (e) {
      showToast(e.message, 'danger');
      throw e;
    }
  };

  const handleAddMany = async (list) => {
    const added = [];
    for (const payload of list) {
      try {
        const item = await api.addItem(payload);
        upsert(item);
        added.push(item);
      } catch { /* enstaka fel ska inte stoppa resten */ }
    }
    showToast(added.length === 1 ? `${added[0].name} inlagd` : `${added.length} varor inlagda`);
  };

  /*
    Lagret delas, så en vara kan ha tagits bort av någon annan i hushållet
    medan den låg öppen här. Servern svarar 404, och då är det egna listan som
    har fel — inte servern. Rätt svar är att släppa varan och säga varför,
    inte att låta den ligga kvar och gå att trycka på igen.
  */
  const dropIfGone = (id, e) => {
    if (e.status !== 404) return false;
    setItems(prev => prev.filter(i => i.id !== id));
    showToast('Varan är redan borttagen', 'danger');
    return true;
  };

  const handlePatch = async (id, patch) => {
    try {
      upsert(await api.patchItem(id, patch));
      showToast('Sparat');
    } catch (e) {
      if (!dropIfGone(id, e)) showToast(e.message, 'danger');
    }
  };

  const handleRemove = async (item, reason) => {
    setSelected(null);
    setItems(prev => prev.filter(i => i.id !== item.id)); // optimistiskt: raden ska försvinna direkt
    try {
      await api.removeItem(item.id, reason);
      showToast(`${item.name} ${reason === 'waste' ? 'slängd' : 'slut'}`, reason === 'waste' ? 'danger' : 'success', {
        label: 'Ångra',
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
      // 404 betyder att någon annan redan tagit bort den — då är den borta,
      // och att lägga tillbaka raden vore att ljuga om lagret.
      if (e.status === 404) return showToast('Varan var redan borttagen', 'danger');
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
        return showToast(`${updated.name}: ${updated.count} kvar`);
      }
      setItems(prev => prev.filter(i => i.id !== item.id));
      showToast(`${updated.name} slut`, 'success', {
        label: 'Ångra',
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
      const recipes = await suggestRecipes(items, { meal, request });
      if (!recipes.length) return showToast('Inga förslag den här gången', 'danger');
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
          showToast('Receptförslagen är klara', 'success', {
            label: 'Visa',
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
  }, [items, showToast]);

  const handleKeyChanged = (reset = false) => {
    if (reset) api.resetKey();
    // Spegeln hör till *det* kylskåpet. Följer den med till en ny nyckel skulle
    // återläggningen skjuta in det gamla hushållets varor i det nya.
    clearMirror();
    loadedOnce.current = false;
    setItems([]);
    load();
    setTab('inventory');
  };

  const aiOk = serverAi || aiReady();

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
    { id: 'inventory', icon: Refrigerator, label: 'Kylskåpet' },
    { id: 'recipes', icon: ChefHat, label: 'Recept' },
    { id: 'settings', icon: SettingsIcon, label: 'Inställningar' },
  ];

  return (
    <>
      <div className="content-area" tabIndex={-1}>
        {storageAtRisk && (
          <button className="banner banner-danger banner-btn" onClick={() => setTab('settings')}>
            <AlertTriangle size={17} />
            <span>Lagret sparas inte — varor kan försvinna. Läs mer</span>
          </button>
        )}

        {tab === 'inventory' && (
          <FridgeView items={items} loading={loading} error={loadError} onRetry={load}
            onSelect={setSelected} onAddClick={() => setAddOpen(true)} />
        )}
        {tab === 'recipes' && (
          <RecipesView items={items} aiOk={aiOk} busy={recipeBusy} log={recipeLog}
            onRun={runRecipes} onGoToSettings={() => setTab('settings')}
            onForget={(id) => setRecipeLog(prev => removeEntry(prev, id))}
            onClear={() => setRecipeLog(clearLog())} />
        )}
        {tab === 'settings' && (
          <SettingsView serverAi={serverAi} persistent={persistent}
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
          <button className="scan-nav-btn" onClick={() => setScannerOpen(true)} aria-label="Skanna streckkod">
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
                  <i className="nav-dot" aria-label="nya receptförslag" />
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
