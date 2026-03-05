import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, AlertCircle, Trash2, Loader, CheckCircle2, Monitor, X } from "lucide-react"

interface LinkedInAccount {
  id: string
  team_id: string
  username: string
  profile_name: string
  is_valid: boolean
  created_at: string
}

type SessionStatus = "idle" | "starting" | "open" | "connected" | "error"

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Cloud Login state
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus>("idle")
  const [liveViewerUrl, setLiveViewerUrl] = React.useState<string | null>(null)
  const [pageId, setPageId] = React.useState<string | null>(null)
  const [statusMessage, setStatusMessage] = React.useState("")
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAccounts = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/linkedin/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error cargando cuentas")
      }
      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading accounts")
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => { fetchAccounts() }, [])
  React.useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  const startCloudLogin = async () => {
    try {
      setSessionStatus("starting")
      setError(null)
      setSuccess(null)
      setStatusMessage("Iniciando navegador en la nube...")

      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/linkedin/browser-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error iniciando sesión")

      setPageId(data.pageId)
      setLiveViewerUrl(data.liveViewerUrl)
      setSessionStatus("open")
      setStatusMessage("Inicia sesión en LinkedIn — detectaremos automáticamente cuando termines")
      startPolling(data.pageId)
    } catch (err) {
      setSessionStatus("error")
      setError(err instanceof Error ? err.message : "Error")
    }
  }

  const startPolling = (pid: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem("auth_token")
        const res = await fetch(`/api/linkedin/session-status?pageId=${pid}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.status === "connected") {
          clearInterval(pollingRef.current!)
          pollingRef.current = null
          setSessionStatus("connected")
          setSuccess(data.message || "✓ Cuenta conectada exitosamente")
          setLiveViewerUrl(null)
          setPageId(null)
          await fetchAccounts()
        }
      } catch { /* ignorar */ }
    }, 2500)
  }

  const closeModal = async () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    if (pageId) {
      try {
        const token = localStorage.getItem("auth_token")
        await fetch("/api/linkedin/browser-session", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pageId }),
        })
      } catch { /* ignorar */ }
    }
    setSessionStatus("idle")
    setLiveViewerUrl(null)
    setPageId(null)
    setStatusMessage("")
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("¿Desconectar esta cuenta?")) return
    try {
      setError(null)
      const token = localStorage.getItem("auth_token")
      const response = await fetch(`/api/linkedin/accounts/${accountId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error desconectando cuenta")
      }
      setSuccess("✓ Cuenta desconectada")
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error disconnecting account")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cuentas LinkedIn</h2>
          <p className="text-slate-400">Conecta tu cuenta LinkedIn. El sistema captura la sesión automáticamente.</p>
        </div>
        <Button
          onClick={startCloudLogin}
          disabled={sessionStatus === "starting" || sessionStatus === "open"}
          className="gap-2"
        >
          {sessionStatus === "starting"
            ? <><Loader className="w-4 h-4 animate-spin" /> Iniciando...</>
            : <><Plus className="w-4 h-4" /> Conectar cuenta</>}
        </Button>
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
                <TableCell colSpan={4} className="text-center py-16 text-slate-400">
                  <Monitor className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="mb-2 font-medium">No hay cuentas conectadas</p>
                  <p className="text-sm mb-4">Haz clic en "Conectar cuenta" — se abre LinkedIn aquí mismo</p>
                  <Button onClick={startCloudLogin} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" /> Conectar primera cuenta
                  </Button>
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

      {/* Modal Cloud Login */}
      {(sessionStatus === "starting" || sessionStatus === "open") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl"
            style={{ height: "min(90vh, 720px)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                  <Monitor className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-100 text-sm">Login en LinkedIn</p>
                  <p className="text-xs text-slate-400">{statusMessage}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {sessionStatus === "open" && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Esperando login...
                  </div>
                )}
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-full hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 relative bg-slate-950 rounded-b-2xl overflow-hidden">
              {sessionStatus === "starting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <Loader className="w-8 h-8 animate-spin text-blue-400" />
                  <p className="text-slate-400 text-sm">Iniciando navegador en la nube...</p>
                  <p className="text-xs text-slate-600">Suele tardar 5-10 segundos</p>
                </div>
              )}
              {sessionStatus === "open" && liveViewerUrl && (
                <iframe
                  src={liveViewerUrl}
                  className="w-full h-full border-0"
                  title="LinkedIn Login"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
