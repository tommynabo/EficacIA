import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, Flame, AlertCircle, Trash2, Loader, CheckCircle2, Puzzle, Download, ChevronDown, ChevronUp } from "lucide-react"

interface LinkedInAccount {
  id: string
  team_id: string
  username: string
  profile_name: string
  is_valid: boolean
  created_at: string
}

type ExtStatus = 'checking' | 'ready' | 'not-installed'

// Detectar la extensión enviando un ping y esperando respuesta
function useExtensionDetect(): ExtStatus {
  const [status, setStatus] = React.useState<ExtStatus>('checking')

  React.useEffect(() => {
    let resolved = false

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      if (event.data?.type === 'EFICACIA_EXT_READY') {
        resolved = true
        setStatus('ready')
      }
    }
    window.addEventListener('message', onMessage)

    // Enviar ping por si la extensión ya estaba cargada antes que React
    window.postMessage({ type: 'EFICACIA_PING' }, '*')

    // Timeout: si no responde en 800ms, no está instalada
    const timer = setTimeout(() => {
      if (!resolved) setStatus('not-installed')
    }, 800)

    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }
  }, [])

  return status
}

// Pedir la cookie li_at a la extensión
function requestLiAt(): Promise<{ success: boolean; liAt?: string; error?: string }> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2)

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      if (event.data?.type === 'EFICACIA_LI_AT_RESPONSE' && event.data.requestId === requestId) {
        window.removeEventListener('message', onMessage)
        clearTimeout(timer)
        resolve(event.data)
      }
    }
    window.addEventListener('message', onMessage)

    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve({ success: false, error: 'La extensión no respondió. Recarga la página e inténtalo de nuevo.' })
    }, 5000)

    window.postMessage({ type: 'EFICACIA_GET_LI_AT', requestId }, '*')
  })
}

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [showManual, setShowManual] = React.useState(false)
  const [manualLiAt, setManualLiAt] = React.useState('')

  const extStatus = useExtensionDetect()

  const fetchAccounts = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/linkedin/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error cargando cuentas')
      }
      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading accounts')
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => { fetchAccounts() }, [])

  // Conectar usando la extensión (1 click)
  const handleConnectWithExtension = async () => {
    try {
      setIsConnecting(true)
      setError(null)
      setSuccess(null)

      const result = await requestLiAt()
      if (!result.success || !result.liAt) {
        throw new Error(result.error || 'No se pudo obtener la sesión de LinkedIn. Asegúrate de estar logueado en linkedin.com')
      }

      await submitLiAt(result.liAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsConnecting(false)
    }
  }

  // Conectar pegando la cookie manualmente (fallback)
  const handleConnectManual = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualLiAt.trim()
    if (!trimmed || trimmed.length < 20) {
      setError('Pega el valor completo de la cookie li_at (mínimo 20 caracteres)')
      return
    }
    try {
      setIsConnecting(true)
      setError(null)
      setSuccess(null)
      await submitLiAt(trimmed)
      setManualLiAt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsConnecting(false)
    }
  }

  const submitLiAt = async (liAt: string) => {
    const token = localStorage.getItem('auth_token')
    const response = await fetch('/api/linkedin/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ li_at: liAt })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Error conectando cuenta')
    setSuccess(data.message || '✓ Cuenta conectada exitosamente')
    setShowManual(false)
    await fetchAccounts()
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('¿Desconectar esta cuenta?')) return
    try {
      setError(null)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/linkedin/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error desconectando cuenta')
      }
      setSuccess('✓ Cuenta desconectada')
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error disconnecting account')
    }
  }

  const extensionZipUrl = '/eficacia-extension.zip'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cuentas LinkedIn</h2>
        <p className="text-slate-400">Conecta tu cuenta LinkedIn en un clic con la extensión de Chrome.</p>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </Card>
      )}

      {success && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-emerald-400">{success}</p>
          </div>
        </Card>
      )}

      {/* Estado de la extensión */}
      {extStatus === 'checking' && (
        <Card className="p-5 border-slate-700">
          <div className="flex items-center gap-3">
            <Loader className="w-4 h-4 animate-spin text-slate-400" />
            <p className="text-sm text-slate-400">Detectando extensión...</p>
          </div>
        </Card>
      )}

      {/* Extensión instalada → 1 click */}
      {extStatus === 'ready' && (
        <Card className="p-6 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Puzzle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-100">Extensión detectada</p>
                <p className="text-sm text-slate-400">Asegúrate de estar logueado en linkedin.com</p>
              </div>
            </div>
            <Button
              onClick={handleConnectWithExtension}
              disabled={isConnecting}
              className="gap-2 bg-emerald-600 hover:bg-emerald-500"
            >
              {isConnecting
                ? <><Loader className="w-4 h-4 animate-spin" /> Conectando...</>
                : <><Plus className="w-4 h-4" /> Conectar LinkedIn</>
              }
            </Button>
          </div>
        </Card>
      )}

      {/* Extensión NO instalada → Install CTA */}
      {extStatus === 'not-installed' && (
        <Card className="p-6 border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Puzzle className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-100 mb-1">Instala la extensión de Chrome (30 segundos)</p>
              <p className="text-sm text-slate-400 mb-4">Permite conectar LinkedIn con 1 clic. Sin pegar cookies, sin pasos manuales.</p>

              <div className="space-y-3 mb-4">
                {[
                  { n: '1', text: <>Descarga el ZIP y guárdalo en tu ordenador</> },
                  { n: '2', text: <>Abre <strong className="text-slate-200">chrome://extensions</strong> en Chrome y activa "Modo desarrollador" (esquina superior derecha)</> },
                  { n: '3', text: <>Haz clic en <strong className="text-slate-200">"Cargar sin empaquetar"</strong> y selecciona la carpeta del ZIP descomprimido</> },
                  { n: '4', text: <>Vuelve aquí y pulsa <strong className="text-slate-200">"Conectar LinkedIn"</strong></> },
                ].map(({ n, text }) => (
                  <div key={n} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-blue-400">{n}</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 flex-wrap">
                <a href={extensionZipUrl} download="eficacia-extension.zip">
                  <Button className="gap-2 bg-blue-600 hover:bg-blue-500">
                    <Download className="w-4 h-4" /> Descargar extensión (.zip)
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  className="text-slate-400 gap-1"
                  onClick={() => window.location.reload()}
                >
                  Ya la instalé — recargar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Fallback manual (siempre disponible, colapsado) */}
      <div>
        <button
          onClick={() => setShowManual(v => !v)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Conectar manualmente (pegar cookie li_at)
        </button>

        {showManual && (
          <Card className="p-5 border-slate-700 mt-3">
            <p className="text-xs text-slate-500 mb-3">
              Ve a linkedin.com → F12 → Application → Cookies → copia el valor de <code className="text-emerald-400 font-mono">li_at</code>
            </p>
            <form onSubmit={handleConnectManual} className="flex gap-2">
              <Input
                type="text"
                placeholder="AQEDATxxxxxxxxxxxxxxxx..."
                value={manualLiAt}
                onChange={(e) => setManualLiAt(e.target.value)}
                className="bg-slate-950 font-mono text-xs flex-1"
                disabled={isConnecting}
              />
              <Button type="submit" disabled={isConnecting || manualLiAt.trim().length < 20} className="gap-1">
                {isConnecting ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Conectar
              </Button>
            </form>
          </Card>
        )}
      </div>

      {/* Tabla de cuentas */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PERFIL</TableHead>
              <TableHead>ESTADO</TableHead>
              <TableHead>CONECTADA</TableHead>
              <TableHead className="text-right">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-slate-400">
                  <Flame className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="mb-2">No hay cuentas conectadas</p>
                  <p className="text-sm">Instala la extensión y conecta tu primera cuenta</p>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-slate-800/50">
                  <TableCell className="font-medium">{account.profile_name || account.username}</TableCell>
                  <TableCell>
                    <Badge className={`gap-1 ${account.is_valid
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      {account.is_valid ? '✓ Activa' : '⚠ Inválida'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-300">
                    {new Date(account.created_at).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDisconnect(account.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
