import React, { useState, useEffect } from 'react';
import { Settings, Play, Download, CheckCircle, AlertCircle, Loader2, Database, ExternalLink } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Campaign {
  id: string;
  name: string;
}

const App = () => {
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
        if (typeof result.token === 'string') setToken(result.token);
        if (typeof result.backendUrl === 'string') setBackendUrl(result.backendUrl);
      });
    }

    // Listen for progress updates from content script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const handleMessage = (message: any) => {
        if (message.type === 'SCRAPING_PROGRESS') {
          setProgress(message.payload.progress);
        } else if (message.type === 'SCRAPING_FINISHED') {
          setIsScraping(false);
          setStatus('success');
          setProgress(100);
        } else if (message.type === 'SCRAPING_ERROR') {
          setIsScraping(false);
          setStatus('error');
          setErrorMessage(message.payload.error);
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
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
        if (data.length > 0) setSelectedCampaign(data[0].id);
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
    } else {
      setView('main');
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

    if (typeof chrome !== 'undefined' && chrome.tabs) {
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
    }
  };

  return (
    <div className="w-[350px] min-h-[400px] p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center font-bold text-white">E</div>
          <h1 className="font-semibold text-lg tracking-tight">EficacIA <span className="text-xs text-zinc-500 font-normal">v1.0</span></h1>
        </div>
        <button 
          onClick={() => setView(view === 'main' ? 'settings' : 'main')}
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {view === 'settings' ? (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">URL del Backend</label>
            <input 
              type="text" 
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="https://app.eficacia.ai"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-600"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Token de Usuario (JWT)</label>
            <textarea 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega tu token aquí..."
              className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-600 resize-none"
            />
          </div>
          <button 
            onClick={handleSaveSettings}
            className="w-full bg-white text-black font-semibold py-2 rounded-md hover:bg-zinc-200 transition-colors"
          >
            Guardar Configuración
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-left-2 duration-200">
          {!token ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <AlertCircle className="w-10 h-10 text-zinc-600" />
              <p className="text-sm text-zinc-400">Configura tu token para empezar</p>
              <button 
                onClick={() => setView('settings')}
                className="text-xs text-violet-500 hover:underline"
              >
                Ir a ajustes
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Campaña de Destino</label>
                <select 
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="" disabled>Selecciona una campaña</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">¿Cuántos leads quieres extraer?</label>
                <input 
                  type="number" 
                  value={leadCount}
                  onChange={(e) => setLeadCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  disabled={isScraping}
                  onClick={startScraping}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 font-bold py-3 rounded-md transition-all duration-300",
                    isScraping 
                      ? "bg-zinc-900 text-zinc-500 cursor-not-allowed" 
                      : "bg-violet-600 text-white hover:bg-violet-700 shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)]"
                  )}
                >
                  {isScraping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                  {isScraping ? 'EXTRAYENDO...' : 'AÑADIR LEADS'}
                </button>

                {isScraping && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                      <span>Progreso</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                      <div 
                        className="h-full bg-violet-600 transition-all duration-300" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {status === 'success' && (
                <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 p-3 rounded-md border border-emerald-500/20">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-xs font-medium">¡Leads añadidos con éxito!</span>
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-center gap-2 text-rose-500 bg-rose-500/10 p-3 rounded-md border border-rose-500/20">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-xs font-medium">{errorMessage || 'Error al procesar'}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-4 flex justify-center">
        <a 
          href={backendUrl} 
          target="_blank" 
          rel="noreferrer" 
          className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Abrir Dashboard <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default App;
