import * as React from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { Switch } from "@/src/components/ui/switch"
import { Skeleton } from "@/src/components/ui/skeleton"
import { LeadImportModal } from "@/src/components/lead-import-modal"
import {
  ArrowLeft, Plus, Trash2, Bot, Save, Clock, Search, AlertCircle,
  Play, Pause, CheckCircle2, Users, Mail, MessageSquare, TrendingUp, Eye,
  MoreHorizontal, X, ChevronDown, Settings, BarChart2, Linkedin, Send,
  Zap, Loader2, RefreshCw, Calendar, Sparkles
} from "lucide-react"

// --- Tipos --------------------------------------------------------------------

interface SequenceStep {
  id: string
  type: "invitation" | "message"
  content: string
  delayDays: number
  delayUnit?: 'minutes' | 'hours' | 'days' | 'weeks'
}

function formatDelay(value: number, unit: string = 'days'): string {
  const labels: Record<string, [string, string]> = {
    minutes: ['minuto', 'minutos'],
    hours: ['hora', 'horas'],
    days: ['día', 'días'],
    weeks: ['semana', 'semanas'],
  }
  const [singular, plural] = labels[unit] || labels.days
  return `${value} ${value === 1 ? singular : plural}`
}

interface Campaign {
  id: string
  name: string
  description: string
  status: "draft" | "active" | "paused" | "completed"
  leads_count: number
  created_at: string
  started_at?: string
  sequence: SequenceStep[]
  settings: {
    daily_limit_profiles?: number
    daily_limit_messages?: number
    daily_limit_invitations?: number
    daily_limit_visits?: number
    stop_on_reply?: boolean
    linkedin_account_ids?: string[]
    ai_prompt?: string
  }
  stats?: {
    invitations: number
    messages: number
    accepted: number
    replied: number
    visits: number
  }
}

interface Lead {
  id: string
  first_name: string
  last_name: string
  company: string
  position: string
  linkedin_url: string
  email: string
  status: string
  sent_message: boolean
  sent_at: string | null
  ai_message: string | null
  custom_vars?: Record<string, string>
}

interface LinkedInAccount {
  id: string
  profile_name: string
  username: string
  is_valid: boolean
}

const DEFAULT_STEPS: SequenceStep[] = [
  { id: "1", type: "invitation", content: "Hola {{nombre}}, me encantaría conectar contigo y conocer más sobre tu experiencia en {{empresa}}.", delayDays: 0 },
  { id: "2", type: "message", content: "Gracias por aceptar mi invitación, {{nombre}}. Vi que trabajas en {{empresa}} como {{cargo}}. Me gustaría hablar sobre cómo podemos colaborar.", delayDays: 2 },
]

const TOKEN = () => localStorage.getItem("auth_token")
const apiHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` })

// --- Componente principal -----------------------------------------------------

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [campaign, setCampaign] = React.useState<Campaign | null>(null)
  const [leads, setLeads] = React.useState<Lead[]>([])
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<"leads" | "sequences" | "options" | "analytics">("leads")
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Leads state
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [emailFilter, setEmailFilter] = React.useState(false)
  const [showAddLeadModal, setShowAddLeadModal] = React.useState(false)
  const [cookieUpdateStatus, setCookieUpdateStatus] = React.useState<{type: 'success' | 'error', message: string} | null>(null)
  const [leadToDelete, setLeadToDelete] = React.useState<string | null>(null)
  const [showStatusMenu, setShowStatusMenu] = React.useState(false)

  // Sequence state
  const [steps, setSteps] = React.useState<SequenceStep[]>(DEFAULT_STEPS)
  const [activeStepId, setActiveStepId] = React.useState<string | null>("1")
  const [engineHeartbeat, setEngineHeartbeat] = React.useState<string | null>(null)
  const messageTextareaRef = React.useRef<HTMLTextAreaElement>(null)

  // AI Assistant inline dialog state
  const [aiDialogOpen, setAiDialogOpen] = React.useState(false)
  const [aiObjective, setAiObjective] = React.useState("")
  const [aiGenerating, setAiGenerating] = React.useState(false)

  // Preview state
  const [showPreviewModal, setShowPreviewModal] = React.useState(false)
  const [previewLeadIdx, setPreviewLeadIdx] = React.useState(0)

  // Compute custom variable names from all loaded leads
  const customVarKeys = React.useMemo(() => {
    const keys = new Set<string>()
    leads.forEach(l => l.custom_vars && Object.keys(l.custom_vars).forEach(k => keys.add(k)))
    return Array.from(keys)
  }, [leads])

  const generateForActiveStep = async () => {
    if (!activeStep || !aiObjective.trim()) return
    setAiGenerating(true)
    try {
      const isInvitation = activeStep.type === "invitation"
      const content = `Genera un mensaje de LinkedIn de tipo "${isInvitation ? "invitaci\u00f3n de conexi\u00f3n" : "mensaje de seguimiento"}". Objetivo del usuario: ${aiObjective.trim()}. Devuelve SOLO el texto del mensaje, sin explicaciones, sin comillas, sin sal\u00fados gen\u00e9ricos. ${isInvitation ? "IMPORTANTE: LinkedIn limita las invitaciones a 200 caracteres en total. El mensaje debe ser ultra-conciso, directo y persuasivo. Cuenta los caracteres con precisi\u00f3n." : "El mensaje puede tener varios p\u00e1rrafos cortos si el objetivo lo requiere, pero debe ser claro, personalizado y orientado a la acci\u00f3n. M\u00e1ximo 1500 caracteres."}`
      const r = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        if (r.status === 403 && d.code === 'NO_CREDITS') {
          alert("Has agotado tus créditos. Recarga en Settings → Créditos IA para seguir usando la IA.")
        } else {
          throw new Error(d.error || "Error")
        }
        return
      }
      updateStep(activeStep.id, { content: d.content })
      setAiDialogOpen(false)
      setAiObjective("")
    } catch (e: any) {
      alert("Error generando mensaje: " + e.message)
    } finally {
      setAiGenerating(false)
    }
  }

  const insertVariable = (varName: string) => {
    if (!activeStep) return
    const el = messageTextareaRef.current
    const snippet = `{{${varName}}}`
    if (el) {
      const start = el.selectionStart
      const end = el.selectionEnd
      const newVal = activeStep.content.slice(0, start) + snippet + activeStep.content.slice(end)
      updateStep(activeStep.id, { content: newVal })
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + snippet.length; el.focus() }, 0)
    } else {
      updateStep(activeStep.id, { content: activeStep.content + snippet })
    }
  }

  // Options state
  const [settings, setSettings] = React.useState({
    daily_limit_profiles: 100,
    daily_limit_messages: 40,
    daily_limit_invitations: 40,
    daily_limit_visits: 40,
    stop_on_reply: true,
    linkedin_account_ids: [] as string[],
    timezone: 'UTC',
    ai_prompt: "Analiza el perfil y escribe un comentario de 1-2 oraciones sobre su experiencia reciente o un post interesante.",
  })

  // Schedule state
  const [schedule, setSchedule] = React.useState<{
    enabled: boolean
    timezone: string
    days: number[]
    start_time: string
    end_time: string
  }>({
    enabled: false,
    timezone: 'Europe/Madrid',
    days: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '18:00',
  })

  // --- Carga inicial ----------------------------------------------------------

  React.useEffect(() => {
    if (!id) return
    fetchAll()
  }, [id])

  // Auto-detect cookie from bookmarklet URL hash: #li_at_connect=XXXX
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      
      // Case 1: Detect and save cookie
      const match = hash.match(/li_at_connect=([^&]+)/)
      if (match) {
        const cookie = decodeURIComponent(match[1])
        // Clean the hash but keep #bookmarklet to reopen modal
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#bookmarklet')
        
        if (cookie && cookie.length > 50) {
          saveCookieDirectly(cookie)
        }
      }

      // Case 2: Open modal if #bookmarklet is present
      if (window.location.hash === '#bookmarklet') {
        setShowAddLeadModal(true)
      }
    }
  }, [window.location.hash])

  const saveCookieDirectly = async (liAt: string) => {
    try {
      const response = await fetch('/api/linkedin/accounts', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ li_at: liAt }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        setCookieUpdateStatus({ type: 'success', message: '¡LinkedIn conectado correctamente! Ya puedes usar Sales Navigator.' })
        // Clear message after 5 seconds
        setTimeout(() => setCookieUpdateStatus(null), 5000)
      } else {
        setCookieUpdateStatus({ type: 'error', message: data.error || 'Error al conectar la cookie.' })
      }
    } catch (err) {
      setCookieUpdateStatus({ type: 'error', message: 'Error de red al conectar la cookie.' })
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [campRes, accountsRes] = await Promise.all([
        fetch(`/api/linkedin/campaigns?id=${id}`, { headers: apiHeaders() }),
        fetch(`/api/linkedin/accounts`, { headers: apiHeaders() }),
      ])

      if (!campRes.ok) {
        const d = await campRes.json()
        throw new Error(d.error || "Error cargando campaña")
      }
      const campData = await campRes.json()
      setCampaign(campData.campaign)
      setLeads(campData.leads || [])

      // Cargar secuencia guardada
      const savedSteps = campData.campaign.sequence
      if (savedSteps && Array.isArray(savedSteps) && savedSteps.length > 0) {
        setSteps(savedSteps)
        setActiveStepId(savedSteps[0]?.id || null)
      }

      // Cargar settings guardados
      if (campData.campaign.settings && Object.keys(campData.campaign.settings).length > 0) {
        setSettings({ ...settings, ...campData.campaign.settings })
      }

      // Cargar schedule guardado
      if (campData.campaign.schedule) {
        setSchedule(prev => ({ ...prev, ...campData.campaign.schedule }))
      }

      if (accountsRes.ok) {
        const accData = await accountsRes.json()
        setAccounts(accData.accounts || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado")
    } finally {
      setLoading(false)
    }
  }

  // --- Acciones campaña -------------------------------------------------------

  const saveCampaign = async (extraUpdates?: Partial<Campaign>) => {
    if (!campaign) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/linkedin/campaigns?id=${id}`, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({ name: campaign.name, description: campaign.description, sequence: steps, settings, schedule, ...extraUpdates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error guardando")
      setCampaign(data.campaign)
      if (data.stats && data.stats.heartbeat) {
        setEngineHeartbeat(data.stats.heartbeat);
      }
      setSuccess("\u2713 Guardado correctamente")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (timing?: string) => {
    if (!campaign) return
    const newStatus = campaign.status === "active" ? "paused" : "active"
    const started = newStatus === "active" ? new Date().toISOString() : undefined
    await saveCampaign({ 
      status: newStatus, 
      ...(started ? { started_at: started } : {}),
      ...(timing ? { start_timing: timing } : {})
    })
    setShowStatusMenu(false)
  }

  const deleteCampaign = async () => {
    if (!confirm(`¿Eliminar la campaña "${campaign?.name}"? Esta acción no se puede deshacer.`)) return
    await fetch(`/api/linkedin/campaigns?id=${id}`, { method: "DELETE", headers: apiHeaders() })
    navigate("/dashboard/campaigns")
  }

  // --- Envío directo a un lead específico ------------------------------------

  const [sendingLeadId, setSendingLeadId] = React.useState<string | null>(null)
  const [testLog, setTestLog] = React.useState<Array<{ time: string; type: 'info' | 'success' | 'error'; msg: string }>>([])
  const [showTestPanel, setShowTestPanel] = React.useState(false)

  const addLog = (type: 'info' | 'success' | 'error', msg: string) => {
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setTestLog(prev => [...prev, { time, type, msg }])
  }


  const sendToLead = async (lead: Lead, stepIndex?: number, simulate?: boolean) => {
    if (!campaign || steps.length === 0) return
    const selectedAccounts = campaign.settings?.linkedin_account_ids || []
    if (selectedAccounts.length === 0) {
      addLog('error', '⚠️ Selecciona una cuenta de LinkedIn en la pestaña Opciones.')
      setShowTestPanel(true)
      return
    }
    const step = steps[stepIndex ?? 0]
    if (!step) {
      addLog('error', `⚠ No hay paso ${(stepIndex ?? 0) + 1} en la secuencia.`)
      setShowTestPanel(true)
      return
    }
    setSendingLeadId(lead.id)
    setShowTestPanel(true)
    addLog('info', `${simulate ? '[SIMULACRO] ' : ''}Enviando ${step.type === 'invitation' ? 'invitación' : 'mensaje'} a ${lead.first_name} ${lead.last_name}...`)
    try {
      const res = await fetch(`/api/linkedin/send-action`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          leadId: lead.id,
          accountId: selectedAccounts[0],
          actionType: step.type,
          content: step.content,
          campaignId: campaign.id,
          campaignName: campaign.name,
          simulate: !!simulate,
        }),
      })
      const data = await res.json()
      if (res.status === 202) {
        addLog('info', `⏳ ${data.message || 'Procesando perfil...'} Reintentando en 5s...`)
        setTimeout(() => sendToLead(lead, stepIndex, simulate), 5000)
        return
      } else if (res.ok) {
        addLog('success', `✓ ${data.message || 'Enviado'} — "${(data.message_sent || '').slice(0, 250)}"`)
        fetchAll()
      } else {
        addLog('error', `✗ Error: ${data.error || 'Error desconocido'}`)
      }
    } catch (err: unknown) {
      addLog('error', `✗ Error de red: ${err instanceof Error ? err.message : 'desconocido'}`)
    } finally {
      setSendingLeadId(null)
    }
  }

  // --- Ejecutar motor de campaña manualmente ----------------------------------

  const [runningEngine, setRunningEngine] = React.useState(false)

  const triggerEngineNow = async () => {
    setRunningEngine(true)
    setShowTestPanel(true)
    addLog('info', '⚡ Ejecutando motor de campaña manualmente...')
    try {
      const res = await fetch(`/api/linkedin/campaign-engine`, {
        method: "POST",
        headers: apiHeaders(),
      })
      const data = await res.json()
      if (res.ok) {
        const s = data.stats || {}
        addLog('success', `✓ Motor ejecutado — Campañas: ${s.campaigns || 0}, Procesados: ${s.processed || 0}, Errores: ${s.errors || 0}, Omitidos: ${s.skipped || 0}`)
        fetchAll()
      } else {
        addLog('error', `✗ Error motor: ${data.error || 'Error desconocido'}`)
      }
    } catch (err: unknown) {
      addLog('error', `✗ Error de red: ${err instanceof Error ? err.message : 'desconocido'}`)
    } finally {
      setRunningEngine(false)
    }
  }

  // --- Leads ------------------------------------------------------------------

  const removeLeadFromCampaign = async (leadId: string) => {
    try {
      await fetch(`/api/linkedin/campaigns?id=${id}&action=leads&leadId=${leadId}`, {
        method: "DELETE",
        headers: apiHeaders(),
      })
      setLeads(leads.filter(l => l.id !== leadId))
    } catch { /* silent */ }
  }

  // --- Secuencia --------------------------------------------------------------

  const addStep = () => {
    const newStep: SequenceStep = {
      id: Date.now().toString(),
      type: "message",
      content: "",
      delayDays: 1,
    }
    setSteps([...steps, newStep])
    setActiveStepId(newStep.id)
  }

  const removeStep = (stepId: string) => {
    const updated = steps.filter(s => s.id !== stepId)
    setSteps(updated)
    setActiveStepId(updated[updated.length - 1]?.id || null)
  }

  const updateStep = (stepId: string, updates: Partial<SequenceStep>) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updates } : s))
  }

  const moveStep = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return
    if (direction === "down" && index === steps.length - 1) return
    const newSteps = [...steps]
    const swap = direction === "up" ? index - 1 : index + 1
      ;[newSteps[index], newSteps[swap]] = [newSteps[swap], newSteps[index]]
    setSteps(newSteps)
  }

  const activeStep = steps.find(s => s.id === activeStepId)

  // Substitutes template variables with actual lead data for preview
  const previewMessage = (text: string, lead: Lead | null): string => {
    const decodeEscapes = (t: string) =>
      t.replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    if (!lead) return decodeEscapes(text)
    const varMap: Record<string, string> = {
      nombre:   lead.first_name || '',
      apellido: lead.last_name  || '',
      empresa:  lead.company    || '',
      cargo:    lead.position   || '',
      ...(lead.custom_vars || {}),
    }
    return decodeEscapes(
      text.replace(/\{\{(\w+)\}\}/g, (_m, k) => varMap[k] !== undefined ? varMap[k] : `{{${k}}}`)
    )
  }

  // --- Render: Loading --------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-slate-400">Campaña no encontrada</p>
        <Button asChild variant="outline"><Link to="/dashboard/campaigns">Volver a Campañas</Link></Button>
      </div>
    )
  }

  const filteredLeads = leads.filter(l => {
    if (search) {
      const q = search.toLowerCase()
      const match =
        `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.linkedin_url?.toLowerCase().includes(q)
      if (!match) return false
    }
    if (statusFilter === "sent") {
      if (!l.sent_message) return false
    } else if (statusFilter === "not_sent") {
      if (l.sent_message) return false
    } else if (statusFilter !== "all") {
      if (l.status !== statusFilter) return false
    }
    if (emailFilter && !l.email) return false
    return true
  })

  const statusConfig = {
    draft: { label: "Borrador", variant: "default" as const },
    active: { label: "Activa", variant: "success" as const },
    paused: { label: "Pausada", variant: "secondary" as const },
    completed: { label: "Completada", variant: "outline" as const },
  }

  // --- Render -----------------------------------------------------------------

  return (
    <div className="space-y-0">
      {/* Notificación de actualización de cookie */}
      {cookieUpdateStatus && (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-xl shadow-2xl border backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-5 duration-300 ${
          cookieUpdateStatus.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className={`p-2 rounded-full ${cookieUpdateStatus.type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {cookieUpdateStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold">{cookieUpdateStatus.type === 'success' ? '¡Éxito!' : 'Error'}</span>
            <span className="text-xs opacity-90">{cookieUpdateStatus.message}</span>
          </div>
          <button onClick={() => setCookieUpdateStatus(null)} className="ml-4 p-1 rounded-md hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/campaigns"><ArrowLeft className="w-5 h-5" /></Link>
          </Button>
          <div className="flex flex-col w-[300px] md:w-[400px]">
            <Input 
              value={campaign.name || ""} 
              onChange={(e) => setCampaign({ ...campaign, name: e.target.value } as Campaign)} 
              className="h-9 text-xl font-bold tracking-tight bg-transparent border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 px-2 shadow-none focus-visible:ring-1"
            />
            <Input 
              value={campaign.description || ""} 
              onChange={(e) => setCampaign({ ...campaign, description: e.target.value } as Campaign)} 
              placeholder="Añadir descripción..."
              className="h-7 text-sm text-slate-400 bg-transparent border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 px-2 shadow-none focus-visible:ring-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={statusConfig[campaign.status]?.variant} className="px-3 py-1.5 text-sm font-medium">
            {statusConfig[campaign.status]?.label}
          </Badge>

          <div className="w-px h-7 bg-slate-200 dark:bg-slate-700 mx-1" />

          <Button
            onClick={triggerEngineNow}
            disabled={runningEngine || campaign.status !== 'active'}
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            title="Ejecuta el motor de campaña ahora mismo (sin esperar al cron)"
          >
            <Zap className={`w-4 h-4 ${runningEngine ? "animate-spin" : ""}`} />
            {runningEngine ? "Ejecutando..." : "Ejecutar ahora"}
          </Button>

          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`gap-2 ${campaign.status === "active"
                ? "border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                }`}
            >
              {campaign.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {campaign.status === "active" ? "Pausar campaña" : "Lanzar campaña"}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </Button>
            {showStatusMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowStatusMenu(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {campaign.status !== "active" ? (
                    <>
                      <button onClick={() => toggleStatus('now')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                        <Play className="w-3 h-3 text-emerald-500" /> Iniciar ahora
                      </button>
                      <button onClick={() => toggleStatus('1h')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                        <Clock className="w-3 h-3 text-blue-500" /> En 1 hora
                      </button>
                      <button onClick={() => toggleStatus('1d')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                        <Clock className="w-3 h-3 text-blue-500" /> En 1 día
                      </button>
                      <button onClick={() => toggleStatus('1w')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                        <Clock className="w-3 h-3 text-blue-500" /> En 1 semana
                      </button>
                    </>
                  ) : (
                    <button onClick={() => toggleStatus()} className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 flex items-center gap-2">
                      <Pause className="w-3 h-3" /> Pausar ahora
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <Button
            onClick={() => saveCampaign()}
            disabled={saving}
            className="gap-2 px-6 shadow-md"
          >
            <Save className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>

          <Button
            onClick={deleteCampaign}
            variant="ghost"
            size="icon"
            className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Eliminar campaña"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {showTestPanel && testLog.length > 0 && (
        <Card className="border border-slate-200 dark:border-slate-700 mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Log de envíos</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{testLog.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setTestLog([])} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Limpiar</button>
              <button onClick={() => setShowTestPanel(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-3 space-y-1.5 bg-white dark:bg-slate-950/50 font-mono text-xs">
            {testLog.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-slate-400 dark:text-slate-600 flex-shrink-0">{log.time}</span>
                <span className={log.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : log.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}>
                  {log.msg}
                </span>
              </div>
            ))}
            {(sendingLeadId || runningEngine) && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Procesando...</span>
              </div>
            )}
          </div>
        </Card>
      )}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-3 mb-4">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" /><p className="text-sm text-red-600 dark:text-red-400">{error}</p></div>
        </Card>
      )}
      {success && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-3 mb-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" /><p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p></div>
        </Card>
      )}

      {engineHeartbeat && (
        <div className="flex items-center gap-2 mb-4 px-1 text-[10px] text-slate-400 font-medium">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Motor activo • Última ejecución: {new Date(engineHeartbeat).toLocaleTimeString()}
        </div>
      )}

      <div className="border-b border-slate-200 dark:border-slate-800 mb-6">
        <nav className="flex gap-8">
          {(["leads", "sequences", "options", "analytics"] as const).map(tab => {
            const labels = { leads: "Leads", sequences: "Secuencias", options: "Opciones", analytics: "Analítica" }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-4 text-base font-medium border-b-2 transition-colors ${activeTab === tab ? "border-blue-600 dark:border-blue-500 text-slate-900 dark:text-white" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"}`}
              >
                {labels[tab]}
              </button>
            )
          })}
        </nav>
      </div>

      {activeTab === "leads" && (
        <div className="space-y-4">
          {/* ── Barra de filtros avanzados ──────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "all",       label: "Todos" },
              { key: "new",       label: "Nuevo" },
              { key: "sent",      label: "Enviado" },
              { key: "not_sent",  label: "No enviado" },
              { key: "contacted", label: "Contactado" },
              { key: "qualified", label: "Cualificado" },
              { key: "converted", label: "Convertido" },
            ] as const).map(f => {
              const count =
                f.key === "all"      ? leads.length
                : f.key === "sent"     ? leads.filter(l => l.sent_message).length
                : f.key === "not_sent" ? leads.filter(l => !l.sent_message).length
                : leads.filter(l => l.status === f.key).length
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    statusFilter === f.key
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {f.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    statusFilter === f.key
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                  }`}>{count}</span>
                </button>
              )
            })}
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <button
              onClick={() => setEmailFilter(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                emailFilter
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <Mail className="w-3 h-3" /> Solo con email
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar lead..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Users className="w-4 h-4" />
                <span>{leads.length} leads</span>
              </div>
            </div>
            <Button onClick={() => setShowAddLeadModal(true)} className="gap-2">
              <Plus className="w-4 h-4" /> AÑADIR LEADS
            </Button>
          </div>

          {filteredLeads.length === 0 ? (
            <Card className="p-12 flex flex-col items-center justify-center gap-4 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600" />
              <div className="text-center">
                <p className="font-medium text-slate-600 dark:text-slate-300 mb-1 uppercase">SIN LEADS</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">Añade leads para empezar tu campaña de outreach</p>
              </div>
              <Button onClick={() => setShowAddLeadModal(true)} variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> AÑADIR LEADS
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-500 tracking-wide">CONTACTO</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-500 tracking-wide">ESTADO</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-500 tracking-wide">EMPRESA</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-500 tracking-wide">CARGO</th>
                      <th className="text-center px-5 py-4 text-sm font-semibold text-slate-500 tracking-wide">ENVIAR</th>
                      <th className="text-right px-5 py-4 text-sm font-semibold text-slate-500 tracking-wide">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr key={lead.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold flex-shrink-0 text-white shadow-sm">
                              {(lead.first_name?.[0] || "?").toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{lead.first_name} {lead.last_name}</p>
                              {lead.linkedin_url && (
                                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5">
                                  <Linkedin className="w-3 h-3" /> LinkedIn
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={lead.status} sent={lead.sent_message} />
                        </td>
                        <td className="px-5 py-4 text-slate-700 dark:text-slate-300 text-sm">{lead.company || "—"}</td>
                        <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-sm">{lead.position || "—"}</td>
                        <td className="px-5 py-4">
                          {lead.sent_message ? (
                            <div className="flex justify-center">
                              <Badge variant="success" className="text-[10px] px-2 py-0.5">✓ Enviado</Badge>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5 items-center">
                              <Button
                                onClick={() => sendToLead(lead, 0, false)}
                                disabled={sendingLeadId === lead.id || !lead.linkedin_url}
                                size="sm"
                                className="h-7 px-3 text-[11px] font-semibold w-24 shadow-sm"
                                title={!lead.linkedin_url ? 'Sin URL de LinkedIn' : `Enviar ${steps[0]?.type === 'invitation' ? 'invitación' : 'mensaje'} a ${lead.first_name}`}
                              >
                                {sendingLeadId === lead.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span className="ml-1.5">Enviar</span>
                              </Button>
                              {import.meta.env.VITE_DEV_MODE === 'true' && (
                              <Button
                                onClick={() => sendToLead(lead, 0, true)}
                                disabled={sendingLeadId === lead.id || !lead.linkedin_url}
                                variant="outline"
                                size="sm"
                                className="h-7 px-3 text-[11px] font-medium w-24 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                title="[DEV] Genera el texto con IA y comprueba si funciona sin enviarlo realmente"
                              >
                                <Bot className="w-3.5 h-3.5" />
                                <span className="ml-1.5">Simular</span>
                              </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={() => setLeadToDelete(lead.id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "sequences" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {steps.map((step, index) => (
              <div key={step.id}>
                {index > 0 && (
                  <div className="flex flex-col items-center py-2 text-slate-400 dark:text-slate-500">
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                    <div className="flex items-center gap-1.5 text-sm font-medium bg-slate-50 dark:bg-slate-900 px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 my-1">
                      <Clock className="w-3.5 h-3.5" />
                      Esperar {formatDelay(step.delayDays, step.delayUnit || 'days')}
                    </div>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                  </div>
                )}
                <Card
                  onClick={() => setActiveStepId(step.id)}
                  className={`p-4 cursor-pointer transition-all border-slate-200 dark:border-slate-700 ${activeStepId === step.id ? "border-blue-500 bg-blue-50/30 dark:bg-blue-500/5 ring-1 ring-blue-500/20" : "hover:border-slate-400 dark:hover:border-slate-500 bg-white dark:bg-slate-900"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] px-2 py-0.5 border-slate-200 dark:border-slate-700">Paso {index + 1}</Badge>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {step.type === "invitation" ? "✉️ Invitación" : "💬 Mensaje"}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {index > 0 && (
                        <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" onClick={e => { e.stopPropagation(); moveStep(index, "up") }} title="Subir">↑</button>
                      )}
                      {index < steps.length - 1 && (
                        <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" onClick={e => { e.stopPropagation(); moveStep(index, "down") }} title="Bajar">↓</button>
                      )}
                      {index > 0 && (
                        <button className="p-1 text-slate-400 hover:text-red-500" onClick={e => { e.stopPropagation(); removeStep(step.id) }} title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-1">{step.content || "Sin contenido aún..."}</p>
                </Card>
              </div>
            ))}

            <Button variant="outline" className="w-full border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white gap-2 bg-transparent" onClick={addStep}>
              <Plus className="w-4 h-4" /> AÑADIR PASO
            </Button>
          </div>

          <div className="lg:col-span-3">
            {activeStep ? (
              <Card className="p-6 space-y-5 h-full border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                    {activeStep.type === "invitation" ? "✉️ Invitación" : "💬 Mensaje"} — Paso {steps.findIndex(s => s.id === activeStep.id) + 1}
                  </h3>
                  {steps.findIndex(s => s.id === activeStep.id) > 0 && (
                    <select
                      value={activeStep.type}
                      onChange={e => updateStep(activeStep.id, { type: e.target.value as "invitation" | "message" })}
                      className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="invitation">Invitación</option>
                      <option value="message">Mensaje</option>
                    </select>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Mensaje de Outreach</label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setPreviewLeadIdx(0); setShowPreviewModal(true) }}
                        className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors font-medium"
                      >
                        <Eye className="w-3 h-3" /> Vista Previa
                      </button>
                      <span className="text-slate-300 dark:text-slate-600 text-xs">|</span>
                      <button
                        onClick={() => updateStep(activeStep.id, { content: "" })}
                        className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Limpiar
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <textarea
                      ref={messageTextareaRef}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 pb-10 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none h-44 shadow-inner"
                      placeholder="Escribe tu mensaje aquí... Usa las variables de abajo para personalizarlo."
                      value={activeStep.content}
                      onChange={e => updateStep(activeStep.id, { content: e.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={(e) => { e.preventDefault(); setAiDialogOpen(o => !o); setAiObjective("") }}
                      className="absolute bottom-2 right-2 text-white bg-blue-600 hover:bg-violet-600 transition-colors"
                    >
                      <Sparkles className="w-4 h-4 mr-1" /> IA
                    </Button>
                    {aiDialogOpen && (
                      <div className="absolute bottom-11 right-0 w-72 bg-white dark:bg-slate-900 border border-violet-400/40 rounded-xl shadow-2xl z-30 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-4 h-4 text-violet-500" />
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">EficacIA Assistant</span>
                          <span className="ml-auto text-[10px] text-slate-400">{activeStep?.type === "invitation" ? "Máx. 200 car." : "Máx. 1500 car."}</span>
                          <button onClick={() => setAiDialogOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">¿Cuál es el objetivo de este mensaje?</p>
                        <textarea
                          value={aiObjective}
                          onChange={e => setAiObjective(e.target.value)}
                          placeholder="Ej: Agendar una demo de nuestro SaaS…"
                          rows={2}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none mb-3"
                        />
                        <Button
                          size="sm"
                          disabled={!aiObjective.trim() || aiGenerating}
                          onClick={generateForActiveStep}
                          className="w-full gap-2 bg-violet-500 hover:bg-violet-600 text-white"
                        >
                          {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {aiGenerating ? "Generando…" : "Generar mensaje"}
                        </Button>
                      </div>
                    )}
                  </div>
                  {activeStep.type === "invitation" && (
                    <div className={`text-[11px] mt-2 text-right font-medium ${activeStep.content.length > 200 ? 'text-red-500 transition-colors' : 'text-slate-500'}`}>
                      {activeStep.content.length} / 200 caracteres
                      {activeStep.content.length > 200 && ' ⚠ Supera límite recomendado'}
                    </div>
                  )}

                  <div className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Tiempo de espera</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={activeStep.delayDays}
                          onChange={e => updateStep(activeStep.id, { delayDays: parseInt(e.target.value) || 0 })}
                          className="w-20 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 h-9"
                        />
                        <select
                          value={activeStep.delayUnit || 'days'}
                          onChange={e => updateStep(activeStep.id, { delayUnit: e.target.value as any })}
                          className="flex-1 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                          <option value="minutes">Minutos</option>
                          <option value="hours">Horas</option>
                          <option value="days">Días</option>
                          <option value="weeks">Semanas</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex-1 flex items-end">
                      <p className="text-[11px] text-slate-500 italic mb-2">
                        {activeStep.delayDays === 0 ? "Se envía inmediatamente" : `Se envía ${formatDelay(activeStep.delayDays, activeStep.delayUnit || 'days')} después`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Variables Básicas</span>
                      <div className="flex flex-wrap gap-2">
                        {['nombre', 'apellido', 'empresa', 'cargo', 'sector'].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariable(v)}
                            className="text-[11px] px-2.5 py-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-mono transition-all shadow-sm"
                            title={`Insertar ${v}`}
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider block mb-2">Variables IA Avanzadas</span>
                      <div className="flex flex-wrap gap-2">
                        {['comentario_post', 'especializacion', 'experiencia'].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariable(v)}
                            className="text-[11px] px-2.5 py-1.5 rounded bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/25 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 hover:border-purple-400 dark:hover:border-purple-500/40 font-mono transition-all shadow-sm"
                            title={`Genera contenido con IA: ${v}`}
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {customVarKeys.length > 0 && (
                      <div>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider block mb-2">Personalizadas</span>
                        <div className="flex flex-wrap gap-2">
                          {customVarKeys.map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => insertVariable(v)}
                              className="text-[11px] px-2.5 py-1.5 rounded bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:border-blue-400 dark:hover:border-blue-500/40 font-mono transition-all shadow-sm"
                              title={`Insertar variable: ${v}`}
                            >
                              {`{{${v}}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <Settings className="w-8 h-8 opacity-20" />
                <p>Selecciona un paso para editar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "options" && (
        <div className="max-w-4xl space-y-6">
          <Card className="p-6 border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Cuentas de LinkedIn</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Selecciona las cuentas que utilizará esta campaña</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  onClick={() => {
                    const ids = settings.linkedin_account_ids || []
                    const newIds = ids.includes(acc.id) ? ids.filter(i => i !== acc.id) : [...ids, acc.id]
                    setSettings({ ...settings, linkedin_account_ids: newIds })
                  }}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${settings.linkedin_account_ids.includes(acc.id)
                    ? "bg-blue-50/50 dark:bg-blue-500/5 border-blue-500 shadow-sm"
                    : "bg-white dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${acc.is_valid ? "from-blue-500 to-blue-600" : "from-slate-400 to-slate-500"}`}>
                    {acc.profile_name?.[0] || acc.username?.[0] || "L"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{acc.profile_name || acc.username}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.is_valid ? "bg-emerald-500" : "bg-red-500"}`} />
                      {acc.is_valid ? "Conectada" : "Error de sesión"}
                    </p>
                  </div>
                  <Switch checked={settings.linkedin_account_ids.includes(acc.id)} onCheckedChange={() => { }} />
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="col-span-full py-10 text-center bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-sm text-slate-500">No hay cuentas de LinkedIn conectadas.</p>
                  <Button variant="link" asChild className="text-blue-600"><Link to="/dashboard/settings">Ir a Configuración</Link></Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">Límites Diarios</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Controla el volumen de acciones para evitar restricciones de LinkedIn</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { key: "daily_limit_profiles", label: "Perfiles vistos" },
                { key: "daily_limit_messages", label: "Mensajes" },
                { key: "daily_limit_invitations", label: "Invitaciones" },
                { key: "daily_limit_visits", label: "Visitas perfil" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 block uppercase tracking-tight">{label}</label>
                  <Input
                    type="number"
                    min="1"
                    max="200"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-center font-semibold text-slate-800 dark:text-slate-100"
                    value={(settings as any)[key]}
                    onChange={e => setSettings(s => ({ ...s, [key]: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Horario de Envío */}
          <Card className="p-6 border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 leading-tight">Horario de Envío</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">El motor omitirá esta campaña fuera del horario configurado</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${schedule.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {schedule.enabled ? 'Activo' : 'Inactivo'}
                </span>
                <Switch
                  checked={schedule.enabled}
                  onCheckedChange={v => setSchedule(s => ({ ...s, enabled: v }))}
                />
              </div>
            </div>

            <div className={`space-y-5 transition-opacity duration-200 ${schedule.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              {/* Zona Horaria */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight mb-1.5">Zona Horaria</label>
                <select
                  value={schedule.timezone}
                  onChange={e => setSchedule(s => ({ ...s, timezone: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  <optgroup label="Europa">
                    <option value="Europe/Madrid">Madrid — CET/CEST (UTC+1/+2)</option>
                    <option value="Europe/London">Londres — GMT/BST (UTC+0/+1)</option>
                    <option value="Europe/Paris">París — CET/CEST (UTC+1/+2)</option>
                    <option value="Europe/Berlin">Berlín — CET/CEST (UTC+1/+2)</option>
                    <option value="Europe/Lisbon">Lisboa — WET/WEST (UTC+0/+1)</option>
                  </optgroup>
                  <optgroup label="América Latina">
                    <option value="America/Mexico_City">Ciudad de México — CST/CDT (UTC-6/-5)</option>
                    <option value="America/Bogota">Bogotá — COT (UTC-5)</option>
                    <option value="America/Lima">Lima — PET (UTC-5)</option>
                    <option value="America/Santiago">Santiago — CLT/CLST (UTC-4/-3)</option>
                    <option value="America/Argentina/Buenos_Aires">Buenos Aires — ART (UTC-3)</option>
                    <option value="America/Caracas">Caracas — VET (UTC-4)</option>
                    <option value="America/Sao_Paulo">São Paulo — BRT (UTC-3)</option>
                  </optgroup>
                  <optgroup label="Norteamérica">
                    <option value="America/New_York">Nueva York — EST/EDT (UTC-5/-4)</option>
                    <option value="America/Chicago">Chicago — CST/CDT (UTC-6/-5)</option>
                    <option value="America/Los_Angeles">Los Ángeles — PST/PDT (UTC-8/-7)</option>
                  </optgroup>
                  <option value="UTC">UTC (Universal)</option>
                </select>
              </div>

              {/* Días de la semana */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight mb-2">Días activos</label>
                <div className="flex gap-2">
                  {[{d:1,l:'L'},{d:2,l:'M'},{d:3,l:'X'},{d:4,l:'J'},{d:5,l:'V'},{d:6,l:'S'},{d:0,l:'D'}].map(({d, l}) => {
                    const active = schedule.days.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSchedule(s => ({
                          ...s,
                          days: active ? s.days.filter(x => x !== d) : [...s.days, d]
                        }))}
                        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Franja horaria */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight mb-1.5">Hora de inicio</label>
                  <input
                    type="time"
                    value={schedule.start_time}
                    onChange={e => setSchedule(s => ({ ...s, start_time: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight mb-1.5">Hora de fin</label>
                  <input
                    type="time"
                    value={schedule.end_time}
                    onChange={e => setSchedule(s => ({ ...s, end_time: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>

              {/* Preview */}
              {schedule.enabled && schedule.days.length > 0 && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-4 py-3 text-xs text-blue-400">
                  <span className="font-semibold">Resumen:</span> El motor enviará mensajes de
                  {' '}{schedule.start_time} a {schedule.end_time}
                  {' '}los días{' '}
                  {schedule.days.sort().map(d => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d]).join(', ')}
                  {' '}en zona horaria <span className="font-mono">{schedule.timezone}</span>.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900 border-l-4 border-l-slate-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Estado del Motor</h3>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                <div className={`w-2 h-2 rounded-full ${(settings as any).last_heartbeat_at ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {(settings as any).last_heartbeat_at ? `Activo (${new Date((settings as any).last_heartbeat_at).toLocaleTimeString()})` : 'Esperando ejecución'}
                </span>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => fetchAll()}>Descartar</Button>
            <Button onClick={() => saveCampaign()} disabled={saving} className="gap-2 px-8 shadow-md">
              <Save className="w-4 h-4" />
              {saving ? "Guardando..." : "Guardar Opciones"}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Badge variant={statusConfig[campaign.status]?.variant} className="text-xs px-3 shadow-sm">
              {statusConfig[campaign.status]?.label}
            </Badge>
            {campaign.started_at && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Campaña iniciada: {new Date(campaign.started_at).toLocaleDateString("es-ES")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Invitaciones", value: campaign.stats?.invitations || 0, icon: Mail, color: "text-blue-500 font-bold" },
              { label: "Aceptadas", value: campaign.stats?.accepted || 0, icon: CheckCircle2, color: "text-emerald-500 font-bold" },
              { label: "Mensajes", value: campaign.stats?.messages || 0, icon: MessageSquare, color: "text-amber-500 font-bold" },
              { label: "Respondidos", value: campaign.stats?.replied || 0, icon: TrendingUp, color: "text-purple-500 font-bold" },
              { label: "Visitas", value: campaign.stats?.visits || 0, icon: Eye, color: "text-cyan-500 font-bold" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="p-5 flex flex-col items-center gap-1.5 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <div className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-900 mb-1`}>
                  <Icon className={`w-5 h-5 ${color.split(' ')[0]}`} />
                </div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className={`text-2xl font-black text-slate-900 dark:text-slate-100`}>{value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-6 border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase text-xs tracking-widest">Estado por Leads</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: "Total leads", value: leads.length, bg: "bg-slate-50 dark:bg-slate-950" },
                { label: "Enviado", value: leads.filter(l => l.sent_message).length, bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                { label: "Pendientes", value: leads.filter(l => !l.sent_message).length, bg: "bg-blue-50 dark:bg-blue-500/10" },
                { label: "Con email", value: leads.filter(l => l.email).length, bg: "bg-purple-50 dark:bg-purple-500/10" },
                { label: "Con LinkedIn", value: leads.filter(l => l.linkedin_url).length, bg: "bg-amber-50 dark:bg-amber-500/10" },
              ].map(({ label, value, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-4 border border-slate-100 dark:border-slate-800 text-center transition-transform hover:scale-[1.02]`}>
                  <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none mb-1">{value}</p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-tighter">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {campaign.status === "draft" && (
            <Card className="p-10 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 text-center shadow-inner">
              <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100 dark:border-slate-700">
                <Play className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-slate-600 dark:text-slate-300 font-semibold mb-1">Campaña en fase de borrador</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mb-6 max-w-sm mx-auto">Configura tu secuencia y añade leads antes de lanzar para ver estadísticas de conversión</p>
              <Button onClick={() => toggleStatus('now')} className="gap-2 px-8 shadow-md" size="lg">
                <Play className="w-4 h-4 fill-current" /> Lanzar Campaña
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* \u2500\u2500 Modal: Vista Previa del mensaje con variables sustituidas \u2500\u2500\u2500\u2500 */}
      {showPreviewModal && activeStep && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Vista Previa del Mensaje</h3>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {activeStep.type === "invitation" ? "Invitaci\u00f3n" : "Mensaje"}
                </Badge>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {leads.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                    Previsualizar con lead:
                  </label>
                  <select
                    value={previewLeadIdx}
                    onChange={e => setPreviewLeadIdx(parseInt(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {leads.slice(0, 20).map((l, i) => (
                      <option key={l.id} value={i}>
                        {l.first_name} {l.last_name}{l.company ? ` \u2014 ${l.company}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Sin leads a\u00f1adidos \u2014 las variables aparecer\u00e1n sin sustituir.</p>
              )}

              {/* LinkedIn-style message preview */}
              {(() => {
                const senderAccount = accounts.find(a => a.id === settings.linkedin_account_ids?.[0])
                const senderName = senderAccount?.profile_name || senderAccount?.username || 'Tu cuenta'
                const senderInitials = senderName.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase() || 'TU'
                const msgText = previewMessage(activeStep.content, leads[previewLeadIdx] || null)
                return (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                    {/* LinkedIn header bar */}
                    <div className="bg-[#0a66c2] px-4 py-2.5 flex items-center gap-2">
                      <Linkedin className="w-4 h-4 text-white" />
                      <span className="text-white text-xs font-semibold">LinkedIn · Mensajería</span>
                    </div>
                    {/* Chat area */}
                    <div className="bg-white dark:bg-slate-950 p-5">
                      <div className="flex items-start gap-3">
                        {/* Avatar with initials */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-slate-100 dark:ring-slate-800">
                          {senderInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{senderName}</span>
                            <span className="text-[10px] text-slate-400">Ahora</span>
                          </div>
                          {/* Message bubble */}
                          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {msgText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Char count */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{activeStep.type === "invitation" ? "Invitaci\u00f3n de conexi\u00f3n" : "Mensaje directo"}</span>
                {(() => {
                  const len = previewMessage(activeStep.content, leads[previewLeadIdx] || null).length
                  const overLimit = activeStep.type === "invitation" && len > 200
                  return (
                    <span className={overLimit ? "text-red-500 font-bold" : ""}>
                      {len} caracteres{activeStep.type === "invitation" && " / 200 m\u00e1x."}
                      {overLimit && " \u26a0 Supera l\u00edmite"}
                    </span>
                  )
                })()}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setShowPreviewModal(false)}>Cerrar</Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setShowPreviewModal(false); setAiDialogOpen(true); setAiObjective("") }}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Iterar con IA
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {leadToDelete && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLeadToDelete(null)}
        >
          <Card
            className="border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full space-y-4 shadow-2xl bg-white dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">¿Eliminar este lead?</h3>
                <p className="text-xs text-slate-500">Cuidado: esta acción es irreversible.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Se eliminará permanentemente de esta campaña y de todas las secuencias asociadas.</p>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="ghost" onClick={() => setLeadToDelete(null)} className="font-medium">Cancelar</Button>
              <Button
                variant="destructive"
                className="font-bold shadow-sm"
                onClick={() => { removeLeadFromCampaign(leadToDelete); setLeadToDelete(null) }}
              >
                Eliminar definitivamente
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showAddLeadModal && id && (
        <LeadImportModal
          campaignId={id}
          onClose={() => setShowAddLeadModal(false)}
          onImported={() => { fetchAll() }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status, sent }: { status: string; sent: boolean }) {
  if (sent) return <Badge variant="success" className="text-[10px] px-2 py-0.5 shadow-sm">✓ Enviado</Badge>
  const map: Record<string, string> = {
    new: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400",
    contacted: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400",
    qualified: "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400",
    converted: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  }
  const labels: Record<string, string> = { new: "Nuevo", contacted: "Contactado", qualified: "Cualificado", converted: "Convertido" }
  return <Badge variant="outline" className={`${map[status] || map.new} text-[10px] px-2 py-0.5 font-bold shadow-sm`}>{labels[status] || "Nuevo"}</Badge>
}
