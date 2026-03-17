import React, { useState, useEffect } from 'react';
import { Settings, Play, CheckCircle, AlertCircle, Loader2, Database, ExternalLink, Download } from 'lucide-react';
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
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Load config from chrome storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['token', 'backendUrl'], (result) => {
        if (result.token) setToken(result.token);
        if (result.backendUrl) setBackendUrl(result.backendUrl);
        
        if (!result.token) {
          setView('settings');
        }
      });
    }

    // Listen for progress updates
    const handleMessage = (message: any) => {
      if (message.type === 'SCRAPING_PROGRESS') {
        setProgress(message.payload.progress);
      } else if (message.type === 'SCRAPING_FINISHED') {
        setIsScraping(false);
        setStatus('success');
        setProgress(100);
        setTimeout(() => setStatus('idle'), 3000);
      } else if (message.type === 'SCRAPING_ERROR') {
        setIsScraping(false);
        setStatus('error');
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
    try {
      const response = await fetch(`${backendUrl}/api/linkedin/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data);
        if (data.length > 0 && !selectedCampaign) setSelectedCampaign(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch campaigns", err);
    }
  };

  const handleSaveSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ token, backendUrl }, () => {
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

    setIsScraping(true);
    setStatus('loading');
    setProgress(0);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'START_SCRAPING',
        payload: {
          campaign_id: selectedCampaign,
          limit: leadCount,
          token,
          backendUrl
        }
      });
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
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Token de Usuario (JWT)</label>
                <textarea 
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Pega tu token aquí..."
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

                  {(isScraping || progress > 0) && (
                    <div className="space-y-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
                        <span className="text-blue-400">Estado de extracción</span>
                        <span className="text-zinc-400">{Math.round(progress)}%</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-500 ease-out" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <p className="text-[10px] text-zinc-500 text-center italic">No cierres esta ventana mientras el proceso esté activo</p>
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
