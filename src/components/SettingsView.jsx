import { useEffect, useState } from 'react';
import { QrCode, Copy, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { getKey, setKey, shareUrl, getHistory } from '../lib/api';
import { getApiKey, setApiKey, getModel, setModel, MODELS } from '../lib/ai';
import { qrSvg } from '../lib/qr';

export default function SettingsView({ serverAi, persistent, onKeyChanged, onToast }) {
  const [key, setKeyState] = useState(getKey());
  const [keyInput, setKeyInput] = useState('');
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [model, setModelState] = useState(getModel());
  const [qr, setQr] = useState(null);
  const [waste, setWaste] = useState(null);
  const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

  useEffect(() => {
    // Svinnsiffran kommer gratis ur historiken — borttagna varor raderas aldrig.
    getHistory(200)
      .then(items => {
        const thrown = items.filter(i => i.removedReason === 'waste');
        setWaste({ thrown: thrown.reduce((n, i) => n + i.count, 0), total: items.reduce((n, i) => n + i.count, 0) });
      })
      .catch(() => {});
  }, []);

  const showQr = async () => {
    if (qr) return setQr(null);
    try {
      setQr(await qrSvg(shareUrl()));
    } catch (e) {
      onToast(e.message, 'danger');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      onToast('Länken kopierad');
    } catch {
      onToast('Kunde inte kopiera — markera länken i stället', 'danger');
    }
  };

  const useKey = () => {
    try {
      const k = setKey(keyInput);
      setKeyState(k);
      setKeyInput('');
      setQr(null);
      onKeyChanged();
      onToast('Bytte kylskåp');
    } catch (e) {
      onToast(e.message, 'danger');
    }
  };

  const saveApiKey = (value) => {
    setApiKeyState(value);
    setApiKey(value.trim());
  };

  return (
    <>
      <h1>Inställningar</h1>

      {/* Deployad utan Turso är det värsta läget: allt fungerar, tills servern
          startar om och lagret är tomt. Då ska man ha blivit varnad först. */}
      {!persistent && !isLocalhost && (
        <div className="banner banner-warn" style={{ marginTop: 'var(--space-4)' }}>
          <AlertTriangle size={17} />
          <span>
            Servern saknar <span className="mono">TURSO_URL</span> — lagret ligger på ett tillfälligt
            filsystem och försvinner när servern startar om. Se README:n.
          </span>
        </div>
      )}

      <h3 style={{ margin: 'var(--space-5) 0 8px' }}>Hushåll</h3>
      <div className="panel">
        <p style={{ marginBottom: 12 }}>
          Alla som har den här nyckeln ser samma kylskåp. Dela den med hushållet — och bara med dem,
          nyckeln är hela åtkomsten.
        </p>
        <div className="mono" style={{
          background: 'var(--bg-elevated)', padding: '10px 12px',
          borderRadius: 'var(--radius-xs)', marginBottom: 12, wordBreak: 'break-all',
        }}>{key}</div>

        <div className="grid-2">
          <button className="btn-ghost" onClick={copyLink}><Copy size={15} /> Kopiera</button>
          <button className="btn-ghost" onClick={showQr}><QrCode size={15} /> {qr ? 'Dölj' : 'QR-kod'}</button>
        </div>

        {qr && <div className="qr-box" dangerouslySetInnerHTML={{ __html: qr }} />}
      </div>

      <div className="panel">
        <label>Anslut till ett annat kylskåp</label>
        <input value={keyInput} onChange={e => setKeyInput(e.target.value)}
          placeholder="ft-…" autoCapitalize="off" autoCorrect="off" />
        <button className="btn-ghost" onClick={useKey} disabled={!keyInput.trim()}>Byt nyckel</button>
      </div>

      <h3 style={{ margin: 'var(--space-5) 0 8px' }}>AI</h3>
      <div className="panel">
        <p style={{ marginBottom: 12 }}>
          {serverAi
            ? 'Servern har en nyckel — inget behövs här.'
            : 'Foto­igenkänning, datumläsning och recept använder Claude. Nyckeln sparas bara i den här webbläsaren.'}
        </p>
        {!serverAi && (
          <>
            <label>Anthropic API-nyckel</label>
            <input type="password" value={apiKey} onChange={e => saveApiKey(e.target.value)}
              placeholder="sk-ant-…" autoCapitalize="off" autoCorrect="off" />
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
              className="item-sub flex-row" style={{ gap: 5, marginBottom: 16 }}>
              Hämta en nyckel <ExternalLink size={12} />
            </a>
          </>
        )}
        <label>Modell</label>
        <select value={model} onChange={e => { setModelState(e.target.value); setModel(e.target.value); }}>
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      {waste && waste.total > 0 && (
        <>
          <h3 style={{ margin: 'var(--space-5) 0 8px' }}>Svinn</h3>
          <div className="panel">
            <p>
              Av {waste.total} borttagna varor har {waste.thrown} slängts
              {' '}({Math.round((waste.thrown / waste.total) * 100)} %).
            </p>
          </div>
        </>
      )}

      <h3 style={{ margin: 'var(--space-5) 0 8px' }}>Om</h3>
      <div className="panel">
        <p style={{ marginBottom: 8 }}>
          Produktdata kommer från <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>,
          en öppen databas (ODbL). Saknas en vara kan du lägga till den där — och den du matar in här känns igen nästa gång.
        </p>
        <p>Lagring: {persistent ? 'Turso' : 'lokal databasfil'}.</p>
      </div>

      <button className="btn-ghost" style={{ marginTop: 'var(--space-4)' }}
        onClick={() => {
          if (!confirm('Nollställ nyckeln? Du får ett nytt, tomt kylskåp. Spara nuvarande nyckel först om du vill tillbaka.')) return;
          navigator.clipboard?.writeText(key).catch(() => {});
          onKeyChanged(true);
        }}>
        <Trash2 size={15} /> Nollställ hushållsnyckel
      </button>
    </>
  );
}
