import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

const BROWSER_W = 1280
const BROWSER_H = 720

export default function LinkedInLivePage() {
  const [searchParams] = useSearchParams()
  const pageId = searchParams.get('pageId')
  const imgRef = React.useRef<HTMLImageElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [image, setImage] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState('Conectando con el navegador seguro...')
  const [busy, setBusy] = React.useState(false)

  // Poll screenshot every 800ms
  React.useEffect(() => {
    if (!pageId) { setStatus('Error: pageId no encontrado'); return }
    const token = localStorage.getItem('auth_token') || ''

    const poll = async () => {
      if (busy) return
      setBusy(true)
      try {
        const res = await fetch(
          `/api/linkedin/browser-session?pageId=${pageId}&screenshot=1&_=${Date.now()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const data = await res.json()
          if (data.image) {
            setImage(data.image)
            setStatus('Inicia sesión con tu cuenta de LinkedIn — esta ventana se cerrará sola')
          } else if (data.error) {
            setStatus(`Sesión no disponible: ${data.error}`)
          }
        }
      } catch { /* ignore */ } finally {
        setBusy(false)
      }
    }

    poll()
    const t = setInterval(poll, 800)
    return () => clearInterval(t)
  }, [pageId]) // eslint-disable-line

  const sendInput = React.useCallback(async (body: object) => {
    const token = localStorage.getItem('auth_token') || ''
    try {
      await fetch('/api/linkedin/browser-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch { /* ignore */ }
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !pageId) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (BROWSER_W / rect.width))
    const y = Math.round((e.clientY - rect.top) * (BROWSER_H / rect.height))
    sendInput({ action: 'input', type: 'click', pageId, x, y })
    // Focus hidden input so keyboard works after click
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    if (!pageId) return
    if (e.key === 'Enter') {
      sendInput({ action: 'input', type: 'key', pageId, key: 'Return', keyCode: 13 })
    } else if (e.key === 'Tab') {
      sendInput({ action: 'input', type: 'key', pageId, key: 'Tab', keyCode: 9 })
    } else if (e.key === 'Backspace') {
      sendInput({ action: 'input', type: 'key', pageId, key: 'Backspace', keyCode: 8 })
    } else if (e.key === 'Escape') {
      sendInput({ action: 'input', type: 'key', pageId, key: 'Escape', keyCode: 27 })
    } else if (e.key.length === 1) {
      sendInput({ action: 'input', type: 'text', pageId, text: e.key })
    }
  }

  return (
    <div
      className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-3 gap-3"
      style={{ userSelect: 'none' }}
    >
      {/* Header bar */}
      <div className="w-full max-w-5xl flex items-center justify-between">
        <div>
          <h1 className="text-slate-100 font-semibold text-sm">Navegador seguro — LinkedIn</h1>
          <p className="text-slate-400 text-xs mt-0.5">{status}</p>
        </div>
        <div className="flex items-center gap-2">
          {image && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              En vivo
            </div>
          )}
        </div>
      </div>

      {/* Browser viewport */}
      <div
        className="w-full max-w-5xl bg-slate-900 rounded-lg overflow-hidden border border-slate-700 relative"
        style={{ aspectRatio: `${BROWSER_W}/${BROWSER_H}` }}
      >
        {image ? (
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${image}`}
            className="w-full h-full object-cover cursor-pointer select-none"
            draggable={false}
            onClick={handleClick}
            alt="LinkedIn browser"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Iniciando navegador en la nube...</p>
              <p className="text-slate-500 text-xs">Suele tardar 5-10 segundos</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden input for keyboard capture — focused after clicking browser */}
      <input
        ref={inputRef}
        className="sr-only"
        onKeyDown={handleKeyDown}
        readOnly
        aria-label="Browser keyboard input"
      />

      {image && (
        <p className="text-center text-slate-500 text-xs max-w-xl">
          Haz clic en el navegador de arriba y escribe normalmente.
          Esta ventana se cerrará automáticamente cuando detectemos que has iniciado sesión.
        </p>
      )}
    </div>
  )
}
