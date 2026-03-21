import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, AlertCircle, Trash2, Loader, CheckCircle2, Monitor, X, Key, Linkedin, Zap, ShieldAlert } from "lucide-react"
import ConnectLinkedInButton from "@/src/components/connect-linkedin-button"

const RISK_THRESHOLD = 15 // acciones/hora — por encima de esto se muestra la advertencia
const MAX_ACTIONS_LIMIT = 120

// ─── Health Score ──────────────────────────────────────────────────────────────
// Score 0-100: penalizes high send rate and pending invitations.
const SAFE_ACTIONS_LIMIT = RISK_THRESHOLD       // 15 actions/hr is safe baseline
const PENALIZE_INVITATIONS_THRESHOLD = 50       // >50 pending = starts hurting score
const PENALIZE_INVITATIONS_DANGER = 150         // >=150 pending = max penalty

function calcHealthScore(actionsPerHour: number, pendingInvitations: number): number {
  // Speed penalty: 0 at safe limit, max 50 points lost at MAX_ACTIONS_LIMIT
  const speedRatio = Math.min(actionsPerHour, MAX_ACTIONS_LIMIT) / MAX_ACTIONS_LIMIT
  const speedPenalty = Math.round(speedRatio * 50)

  // Invitation penalty: 0 below threshold, max 50 points lost at danger level
  const invitationRatio = Math.min(
    Math.max(pendingInvitations - PENALIZE_INVITATIONS_THRESHOLD, 0),
    PENALIZE_INVITATIONS_DANGER - PENALIZE_INVITATIONS_THRESHOLD
  ) / (PENALIZE_INVITATIONS_DANGER - PENALIZE_INVITATIONS_THRESHOLD)
  const invitationPenalty = Math.round(invitationRatio * 50)

  return Math.max(0, 100 - speedPenalty - invitationPenalty)
}

function getHealthColor(score: number): string {
  if (score >= 80) return "#10b981" // emerald-500
  if (score >= 50) return "#f59e0b" // amber-500
  return "#f43f5e"                  // rose-500
}

function getHealthTooltip(actionsPerHour: number, pendingInvitations: number, score: number): string {
  const parts: string[] = []
  if (actionsPerHour > SAFE_ACTIONS_LIMIT) {
    parts.push(`Velocidad agresiva (${actionsPerHour}/hr)`)
  }
  if (pendingInvitations >= PENALIZE_INVITATIONS_THRESHOLD) {
    parts.push(`Muchas invitaciones pendientes (${pendingInvitations})`)
  }
  if (parts.length === 0) {
    return score >= 80 ? "Cuenta sana — comportamiento dentro de los límites seguros" : "Score bajo por factores de actividad"
  }
  return parts.join(" · ")
}

interface HealthBadgeProps {
  score: number
  tooltip: string
}

function HealthBadge({ score, tooltip }: HealthBadgeProps) {
  const color = getHealthColor(score)
  return (
    <div className="relative group inline-flex">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
        style={{ background: color, boxShadow: `0 0 0 3px ${color}33` }}
      >
        {score}
      </div>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl max-w-xs text-center">
        {tooltip}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-700" />
      </div>
    </div>
  )
}

interface LinkedInAccount {
  id: string
  team_id: string
  username: string
  profile_name: string
  is_valid: boolean
  created_at: string
  max_actions_per_hour: number
  auto_withdraw_invites: boolean
  withdraw_after_days: number
}

type SessionStatus = "idle" | "starting" | "open" | "connected" | "error"

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Cloud Login state
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus>("idle")
  const [screenshot, setScreenshot] = React.useState<string | null>(null)
  const [pageId, setPageId] = React.useState<string | null>(null)
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const viewerRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const BROWSER_W = 1280
  const BROWSER_H = 720

  // Manual cookie state
  const [showCookieForm, setShowCookieForm] = React.useState(false)
  const [cookieValue, setCookieValue] = React.useState("")
  const [cookieLoading, setCookieLoading] = React.useState(false)

  // Throttle control state
  const [throttleAccount, setThrottleAccount] = React.useState<LinkedInAccount | null>(null)
  const [throttleValue, setThrottleValue] = React.useState(5)
  const [throttleSaving, setThrottleSaving] = React.useState(false)
  const [showRiskModal, setShowRiskModal] = React.useState(false)

  // Auto-withdraw settings are now managed from Settings → Auto-Withdraw tab

  // Pending invitations per account (accountId → count), used to calculate health score
  const [pendingInvitations, setPendingInvitations] = React.useState<Record<string, number>>({})

  const fetchPendingInvitations = async (accountList: LinkedInAccount[]) => {
    const token = localStorage.getItem("auth_token")
    const results: Record<string, number> = {}
    await Promise.all(
      accountList.map(async (account) => {
        try {
          const res = await fetch(
            `/api/linkedin/accounts?action=pending_invitations&id=${account.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (res.ok) {
            const data = await res.json()
            results[account.id] = typeof data.count === "number" ? data.count : 0
          } else {
            results[account.id] = 0
          }
        } catch {
          results[account.id] = 0
        }
      })
    )
    setPendingInvitations(results)
  }

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
      const fetchedAccounts = data.accounts || []
      setAccounts(fetchedAccounts)
      // Load pending invitations in background for health score
      fetchPendingInvitations(fetchedAccounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading accounts")
    } finally {
      setIsLoading(false)
    }
  }

  // Sincronizar cuentas de Unipile con nuestro backend
  const syncUnipileAccounts = async () => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch("/api/unipile?action=sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.synced > 0) {
        setSuccess(`✓ ${data.synced} cuenta(s) de LinkedIn sincronizada(s).`)
        await fetchAccounts()
      }
      return data
    } catch {
      // Silencioso - sync es best-effort
      return null
    }
  }

  React.useEffect(() => {
    fetchAccounts().then(() => {
      // Sincronizar cuentas de Unipile automáticamente al cargar la página
      syncUnipileAccounts()
    })
  }, [])
  React.useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  // Detectar retorno desde Unipile (?unipile=success en la URL)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("unipile") === "success") {
      // Limpiar parámetro de la URL sin recargar
      window.history.replaceState({}, "", window.location.pathname)
      setSuccess("Sincronizando cuenta de LinkedIn...")
      syncUnipileAccounts()
    }
  }, [])

  const startCloudLogin = async () => {
    try {
      setSessionStatus("starting")
      setError(null)
      setSuccess(null)

      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/linkedin/browser-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      })
      const data = await response.json()
      if (!response.ok) {
        const msg = data.error || `Error ${response.status} al iniciar sesión`
        setSessionStatus("error")
        setError(`No se pudo abrir el navegador: ${msg}`)
        return
      }

      setPageId(data.pageId)
      setSessionStatus("open")
      startPolling(data.pageId)
    } catch (err) {
      setSessionStatus("error")
      setError(err instanceof Error ? `Error de red: ${err.message}` : "Error desconocido")
    }
  }

  const startPolling = (pid: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    let pollCount = 0
    const MAX_POLLS = 30 // ~36 seconds before giving up

    pollingRef.current = setInterval(async () => {
      pollCount++
      try {
        const token = localStorage.getItem("auth_token")
        const res = await fetch(`/api/linkedin/browser-session?pageId=${pid}&_=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.image) {
          setScreenshot(data.image)
          pollCount = 0 // reset timeout when we get a screenshot
        }
        if (data.status === "connected") {
          clearInterval(pollingRef.current!)
          pollingRef.current = null
          setSessionStatus("connected")
          setSuccess(data.message || "✓ Cuenta conectada exitosamente")
          setScreenshot(null)
          setPageId(null)
          await fetchAccounts()
        } else if (!res.ok && pollCount > 5) {
          // After 5 consecutive errors, abort
          clearInterval(pollingRef.current!)
          pollingRef.current = null
          setSessionStatus("error")
          setError(`El navegador en la nube no responde: ${data.error || `HTTP ${res.status}`}. Prueba "Conectar por cookie" como alternativa.`)
          setScreenshot(null)
          setPageId(null)
        }
      } catch { /* ignorar errores de red transitorios */ }

      // If we've been polling too long without a screenshot, suggest manual
      if (pollCount >= MAX_POLLS) {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
        setSessionStatus("error")
        setError("El navegador en la nube tardó demasiado. Usa 'Conectar por cookie' para conectar tu cuenta directamente.")
        setScreenshot(null)
        setPageId(null)
      }
    }, 1200)
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
    setScreenshot(null)
    setPageId(null)
  }

  const sendInput = (body: object) => {
    const token = localStorage.getItem("auth_token")
    fetch("/api/linkedin/browser-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => { })
  }

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    viewerRef.current?.focus()
    if (!imgRef.current || !pageId) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (BROWSER_W / rect.width))
    const y = Math.round((e.clientY - rect.top) * (BROWSER_H / rect.height))
    sendInput({ action: "input", type: "click", pageId, x, y })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    if (!pageId) return
    if (e.key === "Enter") sendInput({ action: "input", type: "key", pageId, key: "Return", keyCode: 13 })
    else if (e.key === "Tab") sendInput({ action: "input", type: "key", pageId, key: "Tab", keyCode: 9 })
    else if (e.key === "Backspace") sendInput({ action: "input", type: "key", pageId, key: "Backspace", keyCode: 8 })
    else if (e.key === "Escape") sendInput({ action: "input", type: "key", pageId, key: "Escape", keyCode: 27 })
    else if (e.key.length === 1) sendInput({ action: "input", type: "text", pageId, text: e.key })
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("¿Desconectar esta cuenta?")) return
    try {
      setError(null)
      const token = localStorage.getItem("auth_token")
      const response = await fetch(`/api/linkedin/accounts?id=${accountId}`, {
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

  const openThrottleModal = (account: LinkedInAccount) => {
    setThrottleAccount(account)
    setThrottleValue(account.max_actions_per_hour ?? 5)
    setShowRiskModal(false)
  }

  const commitThrottleSave = async (value: number) => {
    if (!throttleAccount) return
    try {
      setThrottleSaving(true)
      setError(null)
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`/api/linkedin/accounts?id=${throttleAccount.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_actions_per_hour: value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error guardando configuración")
      setSuccess(`✓ Velocidad actualizada a ${value} acciones/hora para ${throttleAccount.profile_name || throttleAccount.username}`)
      setAccounts(prev => prev.map(a => a.id === throttleAccount.id ? { ...a, max_actions_per_hour: value } : a))
      setThrottleAccount(null)
      setShowRiskModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setThrottleSaving(false)
    }
  }

  const handleThrottleSave = () => {
    if (throttleValue > RISK_THRESHOLD) {
      setShowRiskModal(true)
    } else {
      commitThrottleSave(throttleValue)
    }
  }

  const submitCookieManually = async (e: React.FormEvent) => {    e.preventDefault()
    const val = cookieValue.trim()
    if (!val) return
    try {
      setCookieLoading(true)
      setError(null)
      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/linkedin/accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ li_at: val }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al conectar")
      setSuccess(data.message || "✓ Cuenta conectada")
      setShowCookieForm(false)
      setCookieValue("")
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setCookieLoading(false)
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cuentas LinkedIn</h2>
          <p className="text-slate-400">Conecta tu cuenta LinkedIn. El sistema captura la sesión automáticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowCookieForm(true); setError(null) }}
            className="gap-1.5 text-slate-400 hover:text-slate-200 text-xs"
          >
            <Key className="w-3.5 h-3.5" /> Conectar por cookie
          </Button>
          <ConnectLinkedInButton
            onSuccess={() => {
              setSuccess("Enlace generado. Completa el login en la pestaña abierta.")
            }}
            onError={(msg) => setError(msg)}
          />
          <Button
            onClick={startCloudLogin}
            disabled={sessionStatus === "starting" || sessionStatus === "open"}
            className="gap-2"
          >
            {sessionStatus === "starting"
              ? <><Loader className="w-4 h-4 animate-spin" /> Iniciando...</>
              : <><Plus className="w-4 h-4" /> Cloud Login</>}
          </Button>
        </div>
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
              <TableHead>VELOCIDAD</TableHead>
              <TableHead>SALUD</TableHead>
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
                  <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-slate-400">
                  <Linkedin className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="mb-2 font-medium">No hay cuentas conectadas</p>
                  <p className="text-sm mb-4">Conecta tu LinkedIn de forma segura con Unipile</p>
                  <ConnectLinkedInButton
                    onSuccess={() => setSuccess("Enlace generado. Completa el login en la pestaña abierta.")}
                    onError={(msg) => setError(msg)}
                  />
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
                  <TableCell>
                    <button
                      onClick={() => openThrottleModal(account)}
                      className="flex items-center gap-1.5 group"
                      title="Configurar velocidad de envío"
                    >
                      {(() => {
                        const v = account.max_actions_per_hour ?? 5
                        const isRisky = v > RISK_THRESHOLD
                        return (
                          <Badge className={`gap-1 cursor-pointer transition-opacity group-hover:opacity-80 ${
                            isRisky
                              ? "bg-red-500/10 border-red-500/30 text-red-400"
                              : v > 8
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-slate-700/50 border-slate-600/50 text-slate-400"
                          }`}>
                            {isRisky && <ShieldAlert className="w-3 h-3" />}
                            {!isRisky && <Zap className="w-3 h-3" />}
                            {v}/hr
                          </Badge>
                        )
                      })()}
                    </button>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const pending = pendingInvitations[account.id] ?? 0
                      const actions = account.max_actions_per_hour ?? 5
                      const score = calcHealthScore(actions, pending)
                      const tooltip = getHealthTooltip(actions, pending, score)
                      return <HealthBadge score={score} tooltip={tooltip} />
                    })()}
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

      {/* Modal: Configurar velocidad de envío */}
      {throttleAccount && !showRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Velocidad de Envío</h3>
              </div>
              <button onClick={() => setThrottleAccount(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs text-slate-400 mb-1">Cuenta: <span className="text-slate-300 font-medium">{throttleAccount.profile_name || throttleAccount.username}</span></p>
                <p className="text-xs text-slate-500">El motor de campañas procesará como máximo este número de acciones por hora para esta cuenta.</p>
              </div>

              {/* Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400">Acciones por hora</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_ACTIONS_LIMIT}
                      value={throttleValue}
                      onChange={e => setThrottleValue(Math.min(MAX_ACTIONS_LIMIT, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-16 text-center bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-500">acciones/hr</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={MAX_ACTIONS_LIMIT}
                  step={1}
                  value={throttleValue}
                  onChange={e => setThrottleValue(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${
                      throttleValue > RISK_THRESHOLD ? "#ef4444" : throttleValue > 8 ? "#f59e0b" : "#3b82f6"
                    } 0%, ${
                      throttleValue > RISK_THRESHOLD ? "#ef4444" : throttleValue > 8 ? "#f59e0b" : "#3b82f6"
                    } ${(throttleValue / MAX_ACTIONS_LIMIT) * 100}%, #374151 ${(throttleValue / MAX_ACTIONS_LIMIT) * 100}%, #374151 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>1 — Seguro</span>
                  <span className="text-amber-500/70">{RISK_THRESHOLD} — Límite recomendado</span>
                  <span className="text-red-500/70">{MAX_ACTIONS_LIMIT}</span>
                </div>
              </div>

              {/* Indicador de nivel de riesgo */}
              <div className={`flex items-start gap-2 rounded-lg p-3 border text-xs ${
                throttleValue > RISK_THRESHOLD
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : throttleValue > 8
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              }`}>
                {throttleValue > RISK_THRESHOLD
                  ? <><ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span><strong>Peligroso</strong> — Por encima de {RISK_THRESHOLD}/hr, LinkedIn puede detectar actividad automatizada y suspender tu cuenta.</span></>
                  : throttleValue > 8
                  ? <><Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span><strong>Moderado</strong> — Velocidad razonable. Monitorea la actividad de tu cuenta.</span></>
                  : <><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span><strong>Conservador</strong> — Muy seguro. Comportamiento similar al humano.</span></>
                }
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setThrottleAccount(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={throttleSaving}
                  onClick={handleThrottleSave}
                  className={`gap-1.5 ${throttleValue > RISK_THRESHOLD ? "bg-red-600 hover:bg-red-700" : ""}`}
                >
                  {throttleSaving ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Guardando...</> : "Guardar velocidad"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Advertencia de riesgo de baneo */}
      {showRiskModal && throttleAccount && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-red-500/50 rounded-xl w-full max-w-md shadow-2xl shadow-red-500/10">
            <div className="bg-red-500/10 border-b border-red-500/30 px-5 py-4 flex items-center gap-3 rounded-t-xl">
              <div className="w-9 h-9 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-red-300 text-sm">Riesgo de Bloqueo de Cuenta</h3>
                <p className="text-xs text-red-400/70">Velocidad configurada: {throttleValue} acciones/hora</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Estás configurando una velocidad de envío <strong className="text-red-400">muy agresiva</strong>. LinkedIn podría detectar comportamiento automatizado y <strong className="text-red-400">suspender o banear permanentemente tu cuenta</strong>.
              </p>
              <p className="text-xs text-slate-500">
                EficacIA no se hace responsable de posibles baneos, restricciones o pérdidas de acceso derivadas de una configuración de velocidad superior al umbral seguro ({RISK_THRESHOLD} acciones/hora).
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="button"
                  onClick={() => { commitThrottleSave(throttleValue) }}
                  disabled={throttleSaving}
                  className="w-full bg-red-600 hover:bg-red-700 text-white border-0 gap-2"
                >
                  {throttleSaving ? <><Loader className="w-4 h-4 animate-spin" /> Guardando...</> : <><ShieldAlert className="w-4 h-4" /> Proceder bajo mi responsabilidad</>}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowRiskModal(false); setThrottleValue(RISK_THRESHOLD) }}
                  className="w-full text-slate-300 hover:text-slate-100"
                >
                  Cancelar (volver a modo seguro)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: conectar por cookie manual */}
      {showCookieForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Conectar con cookie li_at</h3>
              </div>
              <button onClick={() => setShowCookieForm(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitCookieManually} className="p-5 space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-3 text-xs text-slate-400 space-y-1.5 border border-slate-700/50">
                <p className="font-medium text-slate-300">Cómo obtener tu cookie li_at:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Abre LinkedIn en tu navegador e inicia sesión</li>
                  <li>Pulsa F12 → pestaña <span className="font-mono bg-slate-700 px-1 rounded">Application</span></li>
                  <li>En el menú lateral: <span className="font-mono bg-slate-700 px-1 rounded">Cookies → https://www.linkedin.com</span></li>
                  <li>Busca la cookie <span className="font-mono bg-slate-700 px-1 rounded">li_at</span> y copia su valor</li>
                </ol>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Pega el valor de la cookie li_at:</label>
                <textarea
                  value={cookieValue}
                  onChange={e => setCookieValue(e.target.value)}
                  placeholder="AQEDARxxxxxx..."
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-mono"
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCookieForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={cookieLoading || !cookieValue.trim()} className="gap-1.5">
                  {cookieLoading ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Validando...</> : "Conectar cuenta"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overlay de viewer en pantalla completa */}
      {(sessionStatus === "starting" || sessionStatus === "open") && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black select-none"
          ref={viewerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={{ outline: "none" }}
        >
          {/* Barra superior */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                <Monitor className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-100">Navegador seguro — LinkedIn</p>
                <p className="text-xs text-slate-400">
                  {sessionStatus === "starting"
                    ? "Iniciando navegador en la nube..."
                    : "Haz clic en el navegador y escribe — cerraremos esto cuando detectemos tu login"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {sessionStatus === "open" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Detectando login...
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

          {/* Área de screenshot */}
          <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
            {sessionStatus === "starting" || !screenshot ? (
              <div className="flex flex-col items-center gap-4">
                <Loader className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-slate-400 text-sm">Iniciando navegador en la nube...</p>
                <p className="text-slate-600 text-xs">Suele tardar 5-10 segundos</p>
              </div>
            ) : (
              <img
                ref={imgRef}
                src={`data:image/jpeg;base64,${screenshot}`}
                className="max-w-full max-h-full object-contain"
                style={{ cursor: "crosshair" }}
                onClick={handleImgClick}
                draggable={false}
                alt="LinkedIn browser"
              />
            )}
          </div>
        </div>
      )}

    </div>
  )
}
