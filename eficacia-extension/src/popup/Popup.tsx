import React, { useState, useEffect } from 'react';
import { Settings, Play, CheckCircle, AlertCircle, Loader2, Database, ExternalLink, Download, Square } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Campaign {
  id: string;
  name: string;
}

const Popup = () => {
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [token, setToken] = useState('');
  const [backendUrl, setBackendUrl] = useState('https://eficac-ia.vercel.app');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [leadCount, setLeadCount] = useState(50);
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Load config and restore any in-progress scraping state
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['token', 'backendUrl', 'eficacia_active_task'], (result) => {
        if (result.token) setToken(result.token as string);
        if (result.backendUrl) setBackendUrl(result.backendUrl as string);

        if (!result.token) {
          setView('settings');
          return;
        }

        // Restore in-progress scraping if popup was closed mid-run
        const activeTask = result['eficacia_active_task'];
        if (activeTask?.active) {
          setIsScraping(true);
          setStatus('loading');
          const pct = activeTask.limit > 0
            ? Math.min(100, (activeTask.leads.length / activeTask.limit) * 100)
            : 0;
          setProgress(pct);
          setProgressLabel(`Extrayendo ${activeTask.leads.length}/${activeTask.limit}`);
        }
      });
    }

    // Listen for progress updates from content script
    const handleMessage = (message: any) => {
      if (message.type === 'SCRAPING_PROGRESS') {
        setProgress(message.payload.progress);
        if (message.payload.current !== undefined) {
          setProgressLabel(`Extrayendo ${message.payload.current}/${message.payload.limit}`);
        }
      } else if (message.type === 'SCRAPING_FINISHED') {
        setIsScraping(false);
        setStatus('success');
        setProgress(100);
        setProgressLabel('');
        setTimeout(() => setStatus('idle'), 3000);
      } else if (message.type === 'SCRAPING_ERROR') {
        setIsScraping(false);
        setStatus('error');
        setProgressLabel('');
        setErrorMessage(message.payload.error);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    if (token && backendUrl) {
      fetchCampaigns();
    }
  }, [token, backendUrl]);

  const fetchCampaigns = async () => {
    if (!token || !backendUrl) return;
    
    try {
      setStatus('loading');
      const response = await fetch(`${backendUrl}/api/linkedin/campaigns`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status === 401) {
        console.error("[CAMPAIGNS] Token invalid or expired");
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.remove(['token'], () => {
            setToken('');
            setView('settings');
            setStatus('error');
            setErrorMessage('Tu token de conexión es inválido o ha expirado. Genera uno nuevo en Ajustes.');
          });
        }
        return;
      }

      if (response.ok) {
        const data = await response.json();
        console.log("[CAMPAIGNS] Fetch success:", data);
        const campaignsList = data.campaigns || (Array.isArray(data) ? data : []);
        setCampaigns(campaignsList);
        if (campaignsList.length > 0 && !selectedCampaign) {
          setSelectedCampaign(campaignsList[0].id);
        }
        setStatus('idle');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}`);
      }
    } catch (err: any) {
      console.error("[POPUP] Failed to fetch campaigns:", err);
      setStatus('error');
      setErrorMessage(err.message === 'Failed to fetch' 
        ? 'Error de red. Verifica que la URL del backend sea correcta.' 
        : `Error: ${err.message}`
      );
    }
  };

  const handleSaveSettings = () => {
    if (!token.trim()) {
      setStatus('error');
      setErrorMessage('El token es obligatorio');
      return;
    }
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ token: token.trim(), backendUrl: backendUrl.trim() }, () => {
        setView('main');
        fetchCampaigns();
      });
    }
  };

  const startScraping = async () => {
    if (!selectedCampaign) {
      setStatus('error');
      setErrorMessage('Selecciona una campaña');
      return;
    }

    try {
      setIsScraping(true);
      setStatus('loading');
      setProgress(0);
      setProgressLabel(`Extrayendo 0/${leadCount}`);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      if (!url.includes('linkedin.com/sales') && !url.includes('app.apollo.io')) {
        throw new Error('Solo puedes extraer leads desde LinkedIn Sales Navigator o listas de Apollo.io.');
      }

      if (!tab?.id) throw new Error('No se encontró la pestaña activa.');

      const payload = {
        campaign_id: selectedCampaign,
        limit: leadCount,
        token: token.trim(),
        backendUrl: backendUrl.trim(),
      };

      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'START_SCRAPING', payload });
      } catch (connErr: any) {
        // Content script not alive — inject and retry
        // Content script not alive (post-extension-update, first navigation, etc.) — inject and retry
        const isConnErr =
          connErr?.message?.includes('Receiving end does not exist') ||
          connErr?.message?.includes('Could not establish connection');
        if (!isConnErr) throw connErr;

        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['assets/content.js'],
          });
          await new Promise(r => setTimeout(r, 600));
          await chrome.tabs.sendMessage(tab.id, { type: 'START_SCRAPING', payload });
        } catch (_injectErr) {
          throw new Error('Por favor, recarga esta página (F5) para iniciar la conexión con la extensión.');
        }
      }
    } catch (err: any) {
      setIsScraping(false);
      setStatus('error');
      setErrorMessage(err.message);
    }
  };

  const stopScraping = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'STOP_SCRAPING' });
        } catch {
          // Tab may not have content script alive — clear state anyway
        }
      }
    } catch {
      // ignore
    }
    setIsScraping(false);
    setStatus('idle');
    setProgress(0);
    setProgressLabel('');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(['eficacia_active_task']);
    }
  };

  return (
    <div className="w-[350px] min-h-[450px] bg-zinc-950 text-zinc-200 flex flex-col font-sans antialiased border border-zinc-800 shadow-2xl overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <h1 className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">EficacIA</h1>
        </div>
        <button 
          onClick={() => setView(view === 'main' ? 'settings' : 'main')}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-all text-zinc-500 hover:text-white"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {view === 'settings' ? (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">URL del Backend</label>
                <input 
                  type="text" 
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="https://app.eficacia.ai"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Token de Conexión (API Key)</label>
                <textarea 
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="efi_..."
                  className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-all font-mono text-[11px]"
                />
              </div>
            </div>
            <button 
              onClick={handleSaveSettings}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              Guardar Configuración
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
            {!token ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                <AlertCircle className="w-12 h-12 text-zinc-700" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Falta configuración</p>
                  <p className="text-xs text-zinc-500">Configura tu token para empezar a extraer leads.</p>
                </div>
                <button 
                  onClick={() => setView('settings')}
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg transition-all"
                >
                  Ir a Ajustes
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Campaña de Destino</label>
                  <div className="relative">
                    <select 
                      value={selectedCampaign}
                      onChange={(e) => setSelectedCampaign(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer pr-10"
                    >
                      <option value="" disabled>Selecciona una campaña</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                      <Download className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Cantidad a extraer</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      value={leadCount}
                      onChange={(e) => setLeadCount(parseInt(e.target.value) || 0)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <div className="flex flex-col gap-1">
                      {[10, 50, 100].map(val => (
                        <button 
                          key={val}
                          onClick={() => setLeadCount(val)}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold rounded border transition-all",
                            leadCount === val ? "bg-blue-500/10 border-blue-500 text-blue-400" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                          )}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 mt-2">
                  <button 
                    disabled={isScraping || campaigns.length === 0}
                    onClick={startScraping}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 font-bold py-4 rounded-xl transition-all duration-300 transform active:scale-[0.98]",
                      isScraping 
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700" 
                        : "bg-blue-600 text-white hover:bg-blue-500 shadow-xl shadow-blue-900/30 hover:shadow-blue-500/40"
                    )}
                  >
                    {isScraping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5 shrink-0" />}
                    {isScraping ? 'EXTRAYENDO...' : 'AÑADIR LEADS'}
                  </button>

                  {isScraping && (
                    <button
                      onClick={stopScraping}
                      className="w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-xl text-sm transition-all border border-rose-800/60 bg-rose-950/40 text-rose-400 hover:bg-rose-900/40 hover:border-rose-700"
                    >
                      <Square className="w-4 h-4" />
                      Detener Extracción
                    </button>
                  )}

                  {(isScraping || progress > 0) && (
                    <div className="space-y-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
                        <span className="text-blue-400">{progressLabel || 'Estado de extracción'}</span>
                        <span className="text-zinc-400">{Math.round(progress)}%</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-500 ease-out" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <p className="text-[10px] text-zinc-500 text-center italic">La extracción continúa aunque cierres este popup</p>
                    </div>
                  )}
                </div>

                {status === 'success' && (
                  <div className="flex items-center gap-3 text-emerald-400 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 animate-in slide-in-from-bottom-2 duration-300">
                    <CheckCircle className="w-6 h-6 flex-shrink-0" />
                    <span className="text-xs font-bold leading-tight">¡Leads añadidos con éxito a la campaña!</span>
                  </div>
                )}

                {status === 'error' && (
                  <div className="flex items-center gap-3 text-rose-400 bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 animate-in slide-in-from-bottom-2 duration-300">
                    <AlertCircle className="w-6 h-6 flex-shrink-0" />
                    <span className="text-xs font-bold leading-tight">{errorMessage || 'Error al procesar'}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-center">
        <a 
          href={backendUrl} 
          target="_blank" 
          rel="noreferrer" 
          className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-600 hover:text-blue-400 transition-colors uppercase tracking-widest"
        >
          Abrir Dashboard <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default Popup;
