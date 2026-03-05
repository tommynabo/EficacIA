import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, Flame, AlertCircle, Trash2, Loader, CheckCircle2, Key, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"

interface LinkedInAccount {
  id: string
  team_id: string
  username: string
  profile_name: string
  is_valid: boolean
  created_at: string
}

const STEPS = [
  {
    num: "1",
    title: "Entra en LinkedIn",
    desc: (
      <p className="text-slate-300 text-sm">
        Abre{" "}
        <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:underline inline-flex items-center gap-1">
          linkedin.com <ExternalLink className="w-3 h-3" />
        </a>{" "}
        en tu navegador y asegúrate de estar logueado con la cuenta que quieres conectar.
      </p>
    ),
  },
  {
    num: "2",
    title: "Abre las DevTools",
    desc: (
      <p className="text-slate-300 text-sm">
        Pulsa <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono">F12</kbd> en Windows/Linux
        o <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono">Cmd + Option + I</kbd> en Mac.
      </p>
    ),
  },
  {
    num: "3",
    title: "Ve a Application → Cookies",
    desc: (
      <div className="space-y-1">
        <p className="text-slate-300 text-sm">
          <strong className="text-slate-100">Chrome/Edge:</strong> Pestaña "Application" → "Cookies" → "https://www.linkedin.com"
        </p>
        <p className="text-slate-300 text-sm">
          <strong className="text-slate-100">Firefox:</strong> Pestaña "Storage" → "Cookies" → "https://www.linkedin.com"
        </p>
      </div>
    ),
  },
  {
    num: "4",
    title: "Copia el valor de li_at",
    desc: (
      <p className="text-slate-300 text-sm">
        Busca la cookie llamada <code className="px-1 py-0.5 bg-slate-700 rounded text-xs font-mono text-emerald-400">li_at</code>.
        Haz doble clic en su valor, cópialo todo (<kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono">Ctrl+A</kbd> → <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono">Ctrl+C</kbd>) y pégalo abajo.
      </p>
    ),
  },
]

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [liAt, setLiAt] = React.useState("")
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [showGuide, setShowGuide] = React.useState(true)

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
      setError(err instanceof Error ? err.message : "Error loading accounts")
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => {
    fetchAccounts()
  }, [])

  const handleConnectAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = liAt.trim()
    if (!trimmed || trimmed.length < 20) {
      setError("Pega el valor completo de la cookie li_at (suele tener más de 100 caracteres)")
      return
    }

    try {
      setIsConnecting(true)
      setError(null)
      setSuccess(null)

      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/linkedin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ li_at: trimmed })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error conectando cuenta')
      }

      setSuccess(data.message || '✓ Cuenta conectada exitosamente')
      setLiAt("")
      setShowGuide(false)
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting account")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("¿Desconectar esta cuenta?")) return
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
      setError(err instanceof Error ? err.message : "Error disconnecting account")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cuentas LinkedIn</h2>
        <p className="text-slate-400">Conecta tu cuenta LinkedIn usando la cookie de sesión. Funciona sin 2FA y dura semanas.</p>
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

      {/* Guía de cómo obtener li_at */}
      <Card className="border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowGuide(v => !v)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-blue-400" />
            <div className="text-left">
              <p className="font-semibold text-slate-100">Cómo obtener tu cookie li_at</p>
              <p className="text-xs text-slate-400 mt-0.5">Proceso de 60 segundos · Sin instalar nada · Sin 2FA</p>
            </div>
          </div>
          {showGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showGuide && (
          <div className="px-5 pb-5 border-t border-slate-700/50">
            <div className="space-y-4 mt-4">
              {STEPS.map((step) => (
                <div key={step.num} className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-400">{step.num}</span>
                  </div>
                  <div className="pt-0.5">
                    <p className="font-medium text-slate-100 text-sm mb-1">{step.title}</p>
                    {step.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Formulario pegar li_at */}
      <Card className="p-6 border-slate-700">
        <form onSubmit={handleConnectAccount} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Valor de la cookie <code className="px-1 py-0.5 bg-slate-700 rounded text-xs font-mono text-emerald-400">li_at</code>
            </label>
            <Input
              type="text"
              placeholder="AQEDATxxxxxxxxxxxxxxxx..."
              value={liAt}
              onChange={(e) => setLiAt(e.target.value)}
              className="bg-slate-950 font-mono text-sm"
              disabled={isConnecting}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              El valor suele empezar por "AQED" y tiene más de 100 caracteres. Es tu contraseña de sesión — no la compartas con nadie más.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={isConnecting || liAt.trim().length < 20}
          >
            {isConnecting ? (
              <><Loader className="w-4 h-4 animate-spin" /> Validando con LinkedIn...</>
            ) : (
              <><Plus className="w-4 h-4" /> Conectar cuenta</>
            )}
          </Button>
        </form>
      </Card>

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
                  <p className="text-sm">Sigue los pasos de arriba para conectar tu primera cuenta</p>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-slate-800/50">
                  <TableCell className="font-medium">{account.profile_name || account.username}</TableCell>
                  <TableCell>
                    <Badge className={`gap-1 ${account.is_valid
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                      {account.is_valid ? "✓ Activa" : "⚠ Inválida"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-300">
                    {new Date(account.created_at).toLocaleDateString("es-ES")}
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
