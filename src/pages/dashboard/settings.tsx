import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { ShieldAlert, CheckCircle2, Plus, Download, Loader2, Lock, Timer, AlertCircle, Sparkles, Ban, UserCheck, Zap, CreditCard, TrendingUp, ExternalLink, RefreshCw } from "lucide-react"

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get("tab") ?? "profile"
  const setActiveTab = (key: string) => setSearchParams({ tab: key }, { replace: true })

  const [apiKey, setApiKey] = React.useState<string | null>(null)
  const [isLoadingKey, setIsLoadingKey] = React.useState(false)

  // ─── Finanzas / Stripe Connect state ──────────────────────────────────────
  interface ConnectAccountStatus {
    id?: string
    status: 'complete' | 'incomplete' | 'not_created'
    charges_enabled?: boolean
    payouts_enabled?: boolean
    currently_due?: string[]
    past_due?: string[]
    display_name?: string | null
    message?: string
  }
  const [connectStatus, setConnectStatus] = React.useState<ConnectAccountStatus | null>(null)
  const [connectLoading, setConnectLoading] = React.useState(false)
  const [connectOnboarding, setConnectOnboarding] = React.useState(false)
  const [connectMsg, setConnectMsg] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Change password state
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [pwdLoading, setPwdLoading] = React.useState(false)
  const [pwdError, setPwdError] = React.useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess] = React.useState(false)

  // Auto-withdraw state
  interface AWAccount { id: string; profile_name: string; username: string; unipile_account_id?: string; auto_withdraw_invites: boolean; withdraw_after_days: number }
  const [awAccounts, setAwAccounts] = React.useState<AWAccount[]>([])
  const [awLoading, setAwLoading] = React.useState(false)
  const [awSaving, setAwSaving] = React.useState<Record<string, boolean>>({})
  const [awRunning, setAwRunning] = React.useState<Record<string, boolean>>({})
  const [awMsg, setAwMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null)

  // AI assistant prompts state (persisted to backend)
  const [aiPromptSequence, setAiPromptSequence] = React.useState("")
  const [aiPromptUnibox, setAiPromptUnibox] = React.useState("")
  const [aiPromptsLoading, setAiPromptsLoading] = React.useState(false)
  const [aiPromptsSaving, setAiPromptsSaving] = React.useState(false)
  const [aiPromptsMsg, setAiPromptsMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null)

  // AI Credits state
  const [aiCredits, setAiCredits] = React.useState<number | null>(null)
  const [creditsLoading, setCreditsLoading] = React.useState(false)
  const [creditsMsg, setCreditsMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null)

  // Blocked leads state
  interface BlockedLead { id: string; first_name: string | null; last_name: string | null; linkedin_url: string | null; company: string | null; tags: string[] }
  const [blockedLeads, setBlockedLeads] = React.useState<BlockedLead[]>([])
  const [blockedLoading, setBlockedLoading] = React.useState(false)
  const [unblockingId, setUnblockingId] = React.useState<string | null>(null)
  const [blockedMsg, setBlockedMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null)

  const token = () => localStorage.getItem("auth_token")
  const envUrl = import.meta.env.VITE_API_URL || ""

  React.useEffect(() => {
    if (activeTab === "extension") {
      fetchApiKey()
    }
    if (activeTab === "auto-withdraw") {
      loadAWAccounts()
    }
    if (activeTab === "blocked") {
      loadBlockedLeads()
    }
    if (activeTab === "ai-assistant") {
      loadAiPrompts()
    }
    if (activeTab === "credits") {
      // Check if returning from a successful Stripe payment
      const paymentStatus = searchParams.get("payment")
      const sessionId = searchParams.get("session_id")
      if (paymentStatus === "success" && sessionId) {
        syncCreditsAfterPayment(sessionId)
      } else {
        loadAiCredits()
      }
    }
    if (activeTab === "finanzas") {
      // Check if returning from Stripe onboarding
      const onboardingStatus = searchParams.get("onboarding")
      if (onboardingStatus === "success" || onboardingStatus === "refresh") {
        setSearchParams({ tab: "finanzas" }, { replace: true })
      }
      loadConnectStatus()
    }
  }, [activeTab])

  const loadAiCredits = async () => {
    try {
      setCreditsLoading(true)
      const res = await fetch(`${envUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAiCredits(typeof data.ai_credits === "number" ? data.ai_credits : 0)
      }
    } catch { /* silent */ }
    finally { setCreditsLoading(false) }
  }

  // ─── Stripe Connect / Finanzas handlers ──────────────────────────────────
  const loadConnectStatus = async () => {
    setConnectLoading(true)
    setConnectMsg(null)
    try {
      const res = await fetch(`${envUrl}/api/payments/connect-onboarding`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setConnectStatus(data)
    } catch (e: any) {
      setConnectMsg({ type: "error", text: e.message || "Error al obtener estado de la cuenta" })
    } finally {
      setConnectLoading(false)
    }
  }

  const startOnboarding = async () => {
    setConnectOnboarding(true)
    setConnectMsg(null)
    try {
      const res = await fetch(`${envUrl}/api/payments/connect-onboarding`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.url) window.location.href = data.url
    } catch (e: any) {
      setConnectMsg({ type: "error", text: e.message || "Error iniciando onboarding" })
    } finally {
      setConnectOnboarding(false)
    }
  }

  const openStripeDashboard = async () => {
    setConnectMsg(null)
    try {
      const res = await fetch(`${envUrl}/api/payments/connect-onboarding?action=login-link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (e: any) {
      setConnectMsg({ type: "error", text: e.message || "Error generando enlace al dashboard" })
    }
  }

  const syncCreditsAfterPayment = async (sessionId: string) => {
    setCreditsLoading(true)
    setCreditsMsg(null)
    try {
      const res = await fetch(`${envUrl}/api/payments/create-checkout-session?action=credits-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (res.ok) {
        setAiCredits(data.credits)
        if (data.granted) {
          setCreditsMsg({ type: "success", text: "¡+1.000 créditos añadidos a tu cuenta!" })
        } else {
          setCreditsMsg({ type: "success", text: "Pago completado. Tu saldo está actualizado." })
        }
      } else {
        // Fallback: just load current balance
        await loadAiCredits()
        setCreditsMsg({ type: "error", text: data.error || "No se pudieron aplicar los créditos. Contacta con soporte." })
      }
    } catch {
      await loadAiCredits()
    } finally {
      setCreditsLoading(false)
      // Clean up URL params so sync doesn't re-run on refresh
      setSearchParams({ tab: "credits" }, { replace: true })
    }
  }

  const handleBuyCredits = async () => {
    const priceId = import.meta.env.VITE_STRIPE_AI_CREDITS_PRICE_ID
    if (!priceId) {
      setCreditsMsg({ type: "error", text: "El producto de créditos no está configurado (VITE_STRIPE_AI_CREDITS_PRICE_ID)." })
      setTimeout(() => setCreditsMsg(null), 5000)
      return
    }
    try {
      setCreditsMsg(null)
      const res = await fetch(`${envUrl}/api/payments/create-checkout-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, plan: "ai_credits", userId: token() ? JSON.parse(atob(token()!.split(".")[1])).userId : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error creando sesión de pago")
      if (data.url) window.location.href = data.url
    } catch (e: any) {
      setCreditsMsg({ type: "error", text: e.message || "Error al iniciar el pago" })
      setTimeout(() => setCreditsMsg(null), 5000)
    }
  }

  const loadAWAccounts = async () => {
    try {
      setAwLoading(true)
      const res = await fetch(`${envUrl}/api/linkedin/accounts`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAwAccounts((data.accounts || []).map((a: any) => ({
          id: a.id,
          profile_name: a.profile_name,
          username: a.username,
          unipile_account_id: a.unipile_account_id,
          auto_withdraw_invites: a.auto_withdraw_invites ?? false,
          withdraw_after_days: a.withdraw_after_days ?? 15,
        })))
      }
    } catch { /* silent */ }
    finally { setAwLoading(false) }
  }

  const saveAWSettings = async (acc: AWAccount) => {
    try {
      setAwSaving(prev => ({ ...prev, [acc.id]: true }))
      const res = await fetch(`${envUrl}/api/linkedin/accounts?id=${acc.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ auto_withdraw_invites: acc.auto_withdraw_invites, withdraw_after_days: acc.withdraw_after_days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAwMsg({ type: "success", text: `✓ ${acc.profile_name}: auto-withdraw ${acc.auto_withdraw_invites ? "activado" : "desactivado"}` })
      setTimeout(() => setAwMsg(null), 4000)
    } catch (e: any) {
      setAwMsg({ type: "error", text: e.message })
      setTimeout(() => setAwMsg(null), 4000)
    } finally {
      setAwSaving(prev => ({ ...prev, [acc.id]: false }))
    }
  }

  const runWithdrawNow = async (acc: AWAccount) => {
    try {
      setAwRunning(prev => ({ ...prev, [acc.id]: true }))
      const accountParam = acc.unipile_account_id ? `&accountId=${acc.unipile_account_id}` : ""
      const res = await fetch(`${envUrl}/api/linkedin/accounts?action=withdraw&force=true${accountParam}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAwMsg({ type: "success", text: data.message || `${data.totalWithdrawn || 0} invitaciones retiradas` })
      setTimeout(() => setAwMsg(null), 5000)
    } catch (e: any) {
      setAwMsg({ type: "error", text: e.message })
      setTimeout(() => setAwMsg(null), 4000)
    } finally {
      setAwRunning(prev => ({ ...prev, [acc.id]: false }))
    }
  }

  const loadBlockedLeads = async () => {
    setBlockedLoading(true)
    try {
      const res = await fetch(`${envUrl}/api/linkedin/unibox?action=blocked_leads`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (res.ok) {
        const data = await res.json()
        setBlockedLeads(data.leads || [])
      }
    } catch { /* silent */ }
    finally { setBlockedLoading(false) }
  }

  const unblockLead = async (leadId: string) => {
    setUnblockingId(leadId)
    try {
      const res = await fetch(`${envUrl}/api/linkedin/unibox?action=update_lead`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: "pending" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBlockedLeads(prev => prev.filter(l => l.id !== leadId))
      setBlockedMsg({ type: "success", text: "Lead desbloqueado correctamente" })
      setTimeout(() => setBlockedMsg(null), 3000)
    } catch (e: any) {
      setBlockedMsg({ type: "error", text: e.message || "Error al desbloquear" })
      setTimeout(() => setBlockedMsg(null), 3000)
    } finally {
      setUnblockingId(null)
    }
  }

  const fetchApiKey = async () => {
    try {
      setIsLoadingKey(true)
      const token = localStorage.getItem('auth_token')
      const envUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${envUrl}/api/auth/api-key`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setApiKey(data.apiKey)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingKey(false)
    }
  }

  const generateApiKey = async () => {
    try {
      setIsLoadingKey(true)
      const token = localStorage.getItem('auth_token')
      const envUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${envUrl}/api/auth/api-key`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setApiKey(data.apiKey)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingKey(false)
    }
  }

  const loadAiPrompts = async () => {
    try {
      setAiPromptsLoading(true)
      const res = await fetch(`${envUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAiPromptSequence(data.ai_prompt_sequence || "")
        setAiPromptUnibox(data.ai_prompt_unibox || "")
      }
    } catch { /* silent */ }
    finally { setAiPromptsLoading(false) }
  }

  const saveAiPrompts = async () => {
    try {
      setAiPromptsSaving(true)
      const res = await fetch(`${envUrl}/api/auth/me`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ai_prompt_sequence: aiPromptSequence, ai_prompt_unibox: aiPromptUnibox }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAiPromptsMsg({ type: "success", text: "✓ Prompts guardados correctamente" })
      setTimeout(() => setAiPromptsMsg(null), 4000)
    } catch (e: any) {
      setAiPromptsMsg({ type: "error", text: e.message || "Error al guardar" })
      setTimeout(() => setAiPromptsMsg(null), 4000)
    } finally {
      setAiPromptsSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Ajustes</h2>
        <p className="text-slate-400">Configura tu cuenta y preferencias de la extensión.</p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 flex-wrap">
        {[
                { key: "profile", label: "Perfil" }, 
          { key: "extension", label: "Extensión Eficacia", badge: "Nueva" }, 
          { key: "billing", label: "Facturación" },
          { key: "auto-withdraw", label: "Auto-Withdraw" },
          { key: "blocked", label: "Bloqueados" },
          { key: "ai-assistant", label: "IA Assistant" },
          { key: "credits", label: "Créditos IA" },
          { key: "afiliados", label: "🚀 Afiliados" },
          { key: "finanzas", label: "💰 Finanzas" },
        ].map(({ key, label, badge }) => (
          <button
            key={key}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${activeTab === key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {badge && (
              <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {activeTab === "extension" && (
        <div className="space-y-6">
          <Card className="border-violet-500/30 bg-violet-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <CardTitle className="text-violet-400 text-lg">Extensión para Sales Navigator y Apollo</CardTitle>
                  <CardDescription className="text-violet-300/70">
                    Esta extensión está diseñada para funcionar en LinkedIn Sales Navigator y Apollo.io — extrae automáticamente leads de ambas plataformas.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Guía de Instalación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">1</div>
                  <p className="text-sm text-slate-300">Descarga la extensión comprimida (.zip) usando el botón de abajo.</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">2</div>
                  <p className="text-sm text-slate-300">Ve a <code className="bg-slate-950 px-1 py-0.5 rounded text-blue-400">chrome://extensions</code> y activa el "Modo Desarrollador".</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">3</div>
                  <p className="text-sm text-slate-300">Haz clic en "Cargar descomprimido" y selecciona la carpeta de la extensión extraída.</p>
                </div>
                
                <Button 
                  asChild
                  className="w-full mt-4 bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 font-bold py-7 transition-all hover:scale-[1.02] flex items-center justify-center gap-3 active:scale-95 shadow-xl"
                >
                  <a href="/eficacia-extension.zip" download className="flex items-center justify-center w-full gap-3">
                    <Download className="w-6 h-6 shrink-0" />
                    <span className="text-base">Descargar Extensión (.zip)</span>
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Token de Conexión (API Key)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-400">Genera y utiliza este token permanente en la extensión para vincular tu cuenta.</p>
                {isLoadingKey ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                  </div>
                ) : apiKey ? (
                   <div className="flex gap-2">
                     <Input 
                       readOnly 
                       type="password"
                       value={apiKey} 
                       className="bg-slate-950 border-slate-800 font-mono text-xs text-slate-500"
                     />
                     <Button 
                       variant="outline"
                       onClick={() => navigator.clipboard.writeText(apiKey)}
                     >
                       Copiar
                     </Button>
                   </div>
                ) : (
                   <Button onClick={generateApiKey} className="w-full bg-blue-600 hover:bg-blue-500 text-white gap-2">
                     <Plus className="w-4 h-4" /> Generar Token de Conexión
                   </Button>
                )}
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Este token es permanente y seguro. No lo compartas con nadie.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "profile" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualiza tus datos de contacto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Nombre</label>
                  <Input defaultValue="Tomás" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Apellidos</label>
                  <Input defaultValue="Navarro Sarda" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Email</label>
                <Input defaultValue="tomasnivraone@gmail.com" disabled className="bg-slate-900/50 text-slate-500" />
              </div>
              <Button className="mt-4">Guardar Cambios</Button>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400" />
                <CardTitle>Cambiar Contraseña</CardTitle>
              </div>
              <CardDescription>Actualiza tu contraseña de acceso a la plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pwdError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> Contraseña actualizada correctamente.
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Nueva contraseña</label>
                <Input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setPwdError(null); setPwdSuccess(false) }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Confirmar contraseña</label>
                <Input
                  type="password"
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setPwdError(null) }}
                />
              </div>
              <Button
                disabled={pwdLoading || !newPassword || !confirmPassword}
                onClick={async () => {
                  if (newPassword !== confirmPassword) { setPwdError("Las contraseñas no coinciden"); return }
                  if (newPassword.length < 8) { setPwdError("Mínimo 8 caracteres"); return }
                  setPwdLoading(true); setPwdError(null)
                  try {
                    const res = await fetch(`${envUrl}/api/auth/change-password`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ newPassword }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error)
                    setPwdSuccess(true); setNewPassword(""); setConfirmPassword("")
                  } catch (e: any) { setPwdError(e.message) }
                  finally { setPwdLoading(false) }
                }}
                className="gap-2"
              >
                {pwdLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Lock className="w-4 h-4" /> Cambiar Contraseña</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "billing" && (
        <Card className="p-8 flex flex-col items-center justify-center gap-4 border-dashed border-slate-700 bg-slate-900/20">
          <p className="text-slate-400">Gestión de facturación próximamente.</p>
        </Card>
      )}

      {/* ─── AUTO-WITHDRAW TAB ────────────────────────────────────── */}
      {activeTab === "auto-withdraw" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Auto-Withdraw de Invitaciones</h3>
            <p className="text-sm text-slate-400 mt-1">
              Retira automáticamente las invitaciones de conexión enviadas que no han sido aceptadas.
              Mantiene tu índice de aceptación saludable en LinkedIn.
            </p>
          </div>

          {awMsg && (
            <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${
              awMsg.type === "success"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              {awMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {awMsg.text}
            </div>
          )}

          {awLoading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando cuentas...</span>
            </div>
          ) : awAccounts.length === 0 ? (
            <Card className="p-8 flex flex-col items-center justify-center gap-3 border-dashed border-slate-700 text-center">
              <Timer className="w-10 h-10 text-slate-600" />
              <p className="text-slate-400">No hay cuentas de LinkedIn conectadas.</p>
              <Button variant="outline" size="sm" asChild>
                <a href="/dashboard/accounts">Conectar cuenta</a>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {awAccounts.map(acc => (
                <Card key={acc.id} className="border-slate-800 bg-slate-900/40">
                  <CardContent className="pt-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-100">{acc.profile_name || acc.username}</p>
                        <p className="text-xs text-slate-500 mt-0.5">@{acc.username}</p>
                      </div>
                      {/* Toggle */}
                      <button
                        onClick={() => {
                          const updated = { ...acc, auto_withdraw_invites: !acc.auto_withdraw_invites };
                          setAwAccounts(prev => prev.map(a => a.id === acc.id ? updated : a));
                          saveAWSettings(updated);
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          acc.auto_withdraw_invites ? "bg-emerald-500" : "bg-slate-600"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
                          acc.auto_withdraw_invites ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </div>

                    <div className={`space-y-4 transition-opacity ${
                      !acc.auto_withdraw_invites ? "opacity-40 pointer-events-none" : ""
                    }`}>
                      <div className="bg-slate-800/60 rounded-lg p-3 text-xs text-slate-400 border border-slate-700/50">
                        Retira invitaciones enviadas hace más de <strong className="text-slate-200">{acc.withdraw_after_days} días</strong> sin respuesta.
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-slate-300 font-medium">Retirar después de</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number" min={3} max={90}
                              value={acc.withdraw_after_days}
                              onChange={e => setAwAccounts(prev => prev.map(a =>
                                a.id === acc.id
                                  ? { ...a, withdraw_after_days: Math.min(90, Math.max(3, parseInt(e.target.value) || 15)) }
                                  : a
                              ))}
                              className="w-16 text-center bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <span className="text-xs text-slate-500">días sin aceptar</span>
                          </div>
                        </div>
                        <input
                          type="range" min={3} max={90} step={1}
                          value={acc.withdraw_after_days}
                          onChange={e => setAwAccounts(prev => prev.map(a =>
                            a.id === acc.id ? { ...a, withdraw_after_days: parseInt(e.target.value) } : a
                          ))}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                          style={{ background: `linear-gradient(to right, #10b981 0%, #10b981 ${((acc.withdraw_after_days - 3) / 87) * 100}%, #374151 ${((acc.withdraw_after_days - 3) / 87) * 100}%, #374151 100%)` }}
                        />
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>3 días</span>
                          <span className="text-emerald-500/70">15 — Recomendado</span>
                          <span>90 días</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                      <Button
                        size="sm" variant="ghost"
                        disabled={awRunning[acc.id] || !acc.auto_withdraw_invites || !acc.unipile_account_id}
                        onClick={() => runWithdrawNow(acc)}
                        className="text-slate-400 text-xs gap-1.5"
                        title={!acc.unipile_account_id ? "Requiere cuenta Unipile conectada" : ""}
                      >
                        {awRunning[acc.id]
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Ejecutando...</>
                          : <><Timer className="w-3.5 h-3.5" /> Ejecutar ahora</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        disabled={awSaving[acc.id]}
                        onClick={() => saveAWSettings(acc)}
                        className="ml-auto gap-1.5"
                      >
                        {awSaving[acc.id]
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...</>
                          : "Guardar"
                        }
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── BLOCKED LEADS TAB ────────────────────────────────── */}
      {activeTab === "blocked" && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-semibold text-slate-100">Leads Bloqueados</h3>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Contactos bloqueados desde la Unibox. Puedes desbloquearlos en cualquier momento.
            </p>
          </div>

          {blockedMsg && (
            <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${
              blockedMsg.type === "success"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              {blockedMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {blockedMsg.text}
            </div>
          )}

          {blockedLoading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando bloqueados...</span>
            </div>
          ) : blockedLeads.length === 0 ? (
            <Card className="p-10 flex flex-col items-center gap-3 border-dashed border-slate-700 text-center">
              <Ban className="w-10 h-10 text-slate-600" />
              <p className="text-slate-400 text-sm">No tienes ningún contacto bloqueado.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {blockedLeads.map(lead => {
                const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Desconocido"
                return (
                  <Card key={lead.id} className="border-slate-800 bg-slate-900/40">
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                        <Ban className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-100 text-sm truncate">{name}</p>
                        {lead.company && <p className="text-xs text-slate-500 truncate">{lead.company}</p>}
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline truncate block"
                          >
                            {lead.linkedin_url}
                          </a>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={unblockingId === lead.id}
                        onClick={() => unblockLead(lead.id)}
                        className="shrink-0 gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      >
                        {unblockingId === lead.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <UserCheck className="w-3.5 h-3.5" />
                        }
                        Desbloquear
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── AI ASSISTANT TAB ─────────────────────────────────────── */}
      {activeTab === "ai-assistant" && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h3 className="text-lg font-semibold text-slate-100">EficacIA Assistant</h3>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Define el rol y tono permanente del asistente. Estas instrucciones se inyectan automáticamente
              en cada conversación según el contexto. Las únicas variables permitidas son{" "}
              <code className="bg-slate-950 px-1 py-0.5 rounded text-violet-400">{"{{first_name}}"}</code>{" "}y{" "}
              <code className="bg-slate-950 px-1 py-0.5 rounded text-violet-400">{"{{company_name}}"}</code>.
            </p>
          </div>

          {aiPromptsLoading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando prompts...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Prompt 1: Sequences */}
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400">1</div>
                    <CardTitle className="text-violet-300 text-sm">Instrucciones para Secuencias (Frío)</CardTitle>
                  </div>
                  <CardDescription className="text-slate-400 text-xs mt-1">
                    Usado cuando el asistente genera mensajes en el Sequence Builder. Define tu expertise, sector y tono para outreach en frío.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    rows={8}
                    placeholder="Ej: Eres un experto en ventas B2B SaaS. Tu objetivo es generar interés genuino en directores de tecnología de empresas de 50-500 empleados. Usa un tono profesional pero directo, sin jerga corporativa..."
                    value={aiPromptSequence}
                    onChange={e => setAiPromptSequence(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
                  />
                </CardContent>
              </Card>

              {/* Prompt 2: Unibox */}
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">2</div>
                    <CardTitle className="text-blue-300 text-sm">Instrucciones para Unibox (Caliente)</CardTitle>
                  </div>
                  <CardDescription className="text-slate-400 text-xs mt-1">
                    Usado cuando el asistente responde desde la Unibox a contactos que ya han respondido. Define cómo manejar objeciones y avanzar la conversación.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    rows={8}
                    placeholder="Ej: Eres un experto en cierre de ventas consultivas. El contacto ya respondió. Tu objetivo es cualificar al prospecto y acordar una llamada de 15 minutos. Sé empático y adapta el mensaje al contexto de la conversación..."
                    value={aiPromptUnibox}
                    onChange={e => setAiPromptUnibox(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                  />
                </CardContent>
              </Card>

              {/* Save feedback */}
              {aiPromptsMsg && (
                <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${
                  aiPromptsMsg.type === "success"
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-red-400 bg-red-500/10 border-red-500/20"
                }`}>
                  {aiPromptsMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {aiPromptsMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  disabled={aiPromptsSaving}
                  onClick={saveAiPrompts}
                  className="gap-2 bg-violet-600 hover:bg-violet-700"
                >
                  {aiPromptsSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                    : <><Sparkles className="w-4 h-4" /> Guardar Prompts</>
                  }
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── CREDITS TAB ──────────────────────────────────────────────── */}
      {activeTab === "credits" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-100">Créditos IA</h3>
          </div>
          <p className="text-sm text-slate-400 -mt-4">
            Cada vez que el asistente genera un mensaje, se consume 1 crédito. Recarga cuando los necesites.
          </p>

          {/* Current balance card */}
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Zap className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Saldo actual</p>
                {creditsLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400 mt-1" />
                ) : (
                  <p className="text-3xl font-bold text-slate-100">
                    {aiCredits !== null ? aiCredits.toLocaleString() : "—"}
                    <span className="text-sm font-normal text-slate-400 ml-1">créditos</span>
                  </p>
                )}
              </div>
              {aiCredits !== null && aiCredits <= 50 && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {aiCredits === 0 ? "Sin créditos — la IA está bloqueada" : "Saldo bajo"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buy pack card */}
          <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-blue-500/5">
            <CardContent className="pt-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-100">Pack 1.000 créditos IA</span>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">One-time</Badge>
                  </div>
                  <p className="text-sm text-slate-400">
                    Genera hasta 1.000 mensajes adicionales con el asistente IA.
                    Sin suscripción, sin caducidad.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-slate-100">10 €</p>
                  <p className="text-xs text-slate-500">pago único</p>
                </div>
              </div>

              <ul className="space-y-1.5 text-sm text-slate-300">
                {[
                  "1.000 mensajes generados por IA",
                  "Sirve para Unibox, Secuencias y Campaign Builder",
                  "Sin fecha de caducidad",
                  "Pago seguro vía Stripe",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              {creditsMsg && (
                <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${
                  creditsMsg.type === "success"
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-red-400 bg-red-500/10 border-red-500/20"
                }`}>
                  {creditsMsg.type === "success"
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                    : <AlertCircle className="w-4 h-4 shrink-0" />
                  }
                  {creditsMsg.text}
                </div>
              )}

              <Button
                onClick={handleBuyCredits}
                className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white py-5 text-base font-semibold"
              >
                <CreditCard className="w-5 h-5" />
                Comprar 1.000 créditos — 10 €
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── AFILIADOS TAB ────────────────────────────────────────────── */}
      {activeTab === "afiliados" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Programa de Afiliados</h3>
            <p className="text-sm text-slate-400 mt-1">
              Comparte EficacIA con tu red y gana comisiones recurrentes por cada cliente que traigas.
            </p>
          </div>

          {/* Hero CTA */}
          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
            <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <span className="text-3xl">🚀</span>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-base font-bold text-slate-100 mb-1">¡Únete al programa y empieza a ganar!</p>
                <p className="text-sm text-slate-400">Registra tu cuenta de afiliado y obtén tu enlace personalizado con tracking automático.</p>
              </div>
              <a
                href="https://eficacia.getrewardful.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors whitespace-nowrap"
              >
                Crear cuenta de afiliado
              </a>
            </CardContent>
          </Card>

          {/* Tiers */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Niveles de Comisión</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Bronce */}
              <Card className="border-amber-700/40 bg-slate-900/60">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🥉</span>
                    <div>
                      <p className="font-bold text-amber-700">Bronce</p>
                      <p className="text-xs text-slate-500">Nivel inicial</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-amber-600">30%</div>
                  <p className="text-xs text-slate-400">Comisión recurrente por cada pago de tus referidos, mes tras mes.</p>
                  <div className="text-xs text-slate-500 bg-slate-800/60 rounded-lg px-3 py-2">
                    Desde el primer referido
                  </div>
                </CardContent>
              </Card>

              {/* Plata */}
              <Card className="border-slate-400/40 bg-slate-900/60 ring-1 ring-slate-400/20">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🥈</span>
                    <div>
                      <p className="font-bold text-slate-300">Plata</p>
                      <p className="text-xs text-slate-500">Nivel intermedio</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-300">40%</div>
                  <p className="text-xs text-slate-400">Comisión recurrente ampliada al superar el umbral mensual.</p>
                  <div className="text-xs text-slate-500 bg-slate-800/60 rounded-lg px-3 py-2">
                    Al superar <span className="text-slate-300 font-semibold">1.000 €/mes</span> referidos
                  </div>
                </CardContent>
              </Card>

              {/* Oro */}
              <Card className="border-yellow-500/40 bg-gradient-to-br from-yellow-500/5 to-amber-500/5 ring-1 ring-yellow-500/30">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🥇</span>
                    <div>
                      <p className="font-bold text-yellow-400">Oro</p>
                      <p className="text-xs text-slate-500">Nivel élite</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-yellow-400">50%</div>
                  <p className="text-xs text-slate-400">La comisión más alta del programa, para afiliados top.</p>
                  <div className="text-xs text-slate-500 bg-slate-800/60 rounded-lg px-3 py-2">
                    Al superar <span className="text-yellow-400 font-semibold">2.500 €/mes</span> referidos
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* How it works */}
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Cómo funciona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { step: "1", text: "Regístrate como afiliado en el portal de Rewardful y obtén tu enlace único con ?via=tu_codigo." },
                { step: "2", text: "Comparte tu enlace en LinkedIn, tu web o con tu comunidad. El tracking es automático y cookieless." },
                { step: "3", text: "Cuando alguien se suscribe a EficacIA desde tu enlace, la comisión se asigna automáticamente." },
                { step: "4", text: "Cobra mensualmente vía transferencia bancaria cuando alcances el mínimo de pago." },
              ].map(({ step, text }) => (
                <div key={step} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">{step}</div>
                  <p className="text-sm text-slate-400 pt-0.5">{text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── FINANZAS TAB — Stripe Connect V2 ────────────────────────────── */}
      {activeTab === "finanzas" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-semibold text-slate-100">Finanzas y Reparto</h3>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Estado de la cuenta Stripe Connect y configuración del reparto automático del 50%.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadConnectStatus}
              disabled={connectLoading}
              className="gap-1.5 text-slate-400 hover:text-white"
            >
              {connectLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />
              }
              Actualizar
            </Button>
          </div>

          {connectMsg && (
            <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${
              connectMsg.type === "success"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              {connectMsg.type === "success"
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <AlertCircle className="w-4 h-4 shrink-0" />
              }
              {connectMsg.text}
            </div>
          )}

          {connectLoading && !connectStatus ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Consultando estado de la cuenta…</span>
            </div>
          ) : connectStatus ? (
            <div className="space-y-4">

              {/* ── Account status card ─────────────────────────────────── */}
              <Card className={`border ${
                connectStatus.status === "complete"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : connectStatus.status === "incomplete"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-slate-700 bg-slate-900/40"
              }`}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      connectStatus.status === "complete"   ? "bg-emerald-500/10 border border-emerald-500/20"
                      : connectStatus.status === "incomplete" ? "bg-amber-500/10 border border-amber-500/20"
                      : "bg-slate-800 border border-slate-700"
                    }`}>
                      <TrendingUp className={`w-6 h-6 ${
                        connectStatus.status === "complete" ? "text-emerald-400"
                        : connectStatus.status === "incomplete" ? "text-amber-400"
                        : "text-slate-500"
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-100">
                          {connectStatus.status === "not_created"
                            ? "Cuenta Connect no creada"
                            : connectStatus.display_name || `Cuenta ${connectStatus.id}`
                          }
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          connectStatus.status === "complete"   ? "bg-emerald-500/20 text-emerald-400"
                          : connectStatus.status === "incomplete" ? "bg-amber-500/20 text-amber-400"
                          : "bg-slate-700 text-slate-400"
                        }`}>
                          {connectStatus.status === "complete"   ? "✓ Activa"
                          : connectStatus.status === "incomplete" ? "⚠ Incompleta"
                          : "Sin configurar"}
                        </span>
                      </div>
                      {connectStatus.id && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{connectStatus.id}</p>
                      )}
                      {connectStatus.message && (
                        <p className="text-sm text-slate-400 mt-1">{connectStatus.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Requirements warnings */}
                  {(connectStatus.past_due?.length ?? 0) > 0 && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                      <p className="font-semibold mb-1">⛔ Documentos vencidos — la cuenta puede restringirse:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        {connectStatus.past_due!.map(r => <li key={r}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                  {(connectStatus.currently_due?.length ?? 0) > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
                      <p className="font-semibold mb-1">⚠ Información pendiente de enviar:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        {connectStatus.currently_due!.map(r => <li key={r}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    {connectStatus.status !== "complete" && (
                      <Button
                        onClick={startOnboarding}
                        disabled={connectOnboarding}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap flex items-center justify-center"
                      >
                        {connectOnboarding
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo…</>
                          : <><Plus className="w-4 h-4" /> Completar perfil de cobros</>
                        }
                      </Button>
                    )}
                    {connectStatus.status === "complete" && (
                      <Button
                        onClick={openStripeDashboard}
                        variant="outline"
                        className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white whitespace-nowrap flex items-center justify-center"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ir al Dashboard de Stripe
                      </Button>
                    )}
                    {connectStatus.status === "incomplete" && (
                      <Button
                        onClick={openStripeDashboard}
                        variant="outline"
                        className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white whitespace-nowrap flex items-center justify-center"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Abrir Dashboard de Stripe
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* ── Revenue split explainer ─────────────────────────────── */}
              <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Reparto Automático de Ingresos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Plataforma (EficacIA)", pct: "50%", color: "indigo" },
                      { label: "Socio / Colaborador",   pct: "50%", color: "violet" },
                    ].map(({ label, pct, color }) => (
                      <div key={label} className={`p-4 rounded-xl bg-${color}-500/5 border border-${color}-500/20 text-center`}>
                        <p className={`text-3xl font-black text-${color}-400`}>{pct}</p>
                        <p className="text-xs text-slate-400 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 text-xs text-slate-500">
                    <p>• El reparto se ejecuta automáticamente vía webhook <code className="bg-slate-800 px-1 rounded text-slate-300">invoice.paid</code>.</p>
                    <p>• Se deduce la comisión de Stripe antes de calcular el 50% (basado en el BalanceTransaction real).</p>
                    <p>• Las comisiones de afiliados Rewardful ya están descontadas del <code className="bg-slate-800 px-1 rounded text-slate-300">amount_paid</code>.</p>
                    <p>• Cada transferencia es idempotente: si el webhook se reintenta, no se produce doble pago.</p>
                  </div>
                </CardContent>
              </Card>

            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
