import { useCallback, useEffect, useRef, useState } from 'react';
import { Refrigerator, ChefHat, Settings as SettingsIcon, ScanLine } from 'lucide-react';
import * as api from './lib/api';
import { checkServerAi, aiReady } from './lib/ai';
import InventoryView from './components/InventoryView';
import RecipesView from './components/RecipesView';
import SettingsView from './components/SettingsView';
import ScannerView from './components/ScannerView';
import ItemSheet from './components/ItemSheet';
import PhotoIdentifySheet from './components/PhotoIdentifySheet';
import Toast from './components/Toast';

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('inventory');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [serverAi, setServerAi] = useState(false);
  const [persistent, setPersistent] = useState(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'success', action = null) => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getInventory());
    } catch (e) {
      showToast(e.message, 'danger');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // En delad länk (#key=…) ska gälla direkt, innan lagret hämtas.
    api.adoptKeyFromUrl();
    load();
    api.getHealth().then(h => setPersistent(Boolean(h.persistent))).catch(() => {});
    checkServerAi().then(setServerAi);
  }, [load]);

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

  const handlePatch = async (id, patch) => {
    try {
      upsert(await api.patchItem(id, patch));
      showToast('Sparat');
    } catch (e) {
      showToast(e.message, 'danger');
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
      upsert(item); // gick inte — lägg tillbaka raden
      showToast(e.message, 'danger');
    }
  };

  const handleKeyChanged = (reset = false) => {
    if (reset) api.resetKey();
    setItems([]);
    load();
    setTab('inventory');
  };

  const aiOk = serverAi || aiReady();

  const navItems = [
    { id: 'inventory', icon: Refrigerator, label: 'Kylskåpet' },
    { id: 'recipes', icon: ChefHat, label: 'Recept' },
    { id: 'settings', icon: SettingsIcon, label: 'Inställningar' },
  ];

  return (
    <>
      <div className="content-area" tabIndex={-1}>
        {tab === 'inventory' && (
          <InventoryView items={items} loading={loading} onSelect={setSelected}
            onOpenPhoto={() => (aiOk ? setPhotoOpen(true) : setTab('settings'))} onRefresh={load} />
        )}
        {tab === 'recipes' && (
          <RecipesView items={items} aiOk={aiOk} onToast={showToast} onGoToSettings={() => setTab('settings')} />
        )}
        {tab === 'settings' && (
          <SettingsView serverAi={serverAi} persistent={persistent}
            onKeyChanged={handleKeyChanged} onToast={showToast} />
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
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      {scannerOpen && (
        <ScannerView onAdd={handleAdd} onClose={() => setScannerOpen(false)} onToast={showToast} />
      )}
      {selected && (
        <ItemSheet item={selected} aiOk={aiOk} onClose={() => setSelected(null)}
          onPatch={handlePatch} onRemove={handleRemove} onToast={showToast} />
      )}
      {photoOpen && (
        <PhotoIdentifySheet onClose={() => setPhotoOpen(false)} onAddMany={handleAddMany} onToast={showToast} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} action={toast.action} />}
    </>
  );
}
