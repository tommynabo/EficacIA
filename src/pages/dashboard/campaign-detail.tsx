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
  MoreHorizontal, X, ChevronDown, Settings, BarChart2, Linkedin
} from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SequenceStep {
  id: string
  type: "invitation" | "message"
  content: string
  useAI: boolean
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
  { id: "1", type: "invitation", content: "Hola {{nombre}}, me encantaría conectar contigo y conocer más sobre tu experiencia en {{empresa}}.", useAI: true, delayDays: 0 },
  { id: "2", type: "message", content: "Gracias por aceptar mi invitación, {{nombre}}. Vi que trabajas en {{empresa}} como {{cargo}}. Me gustaría hablar sobre cómo podemos colaborar.", useAI: false, delayDays: 2 },
]

const TOKEN = () => localStorage.getItem("auth_token")
const apiHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` })

// ─── Componente principal ─────────────────────────────────────────────────────

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
  const [showAddLeadModal, setShowAddLeadModal] = React.useState(false)
  const [leadToDelete, setLeadToDelete] = React.useState<string | null>(null)

  // Sequence state
  const [steps, setSteps] = React.useState<SequenceStep[]>(DEFAULT_STEPS)
  const [activeStepId, setActiveStepId] = React.useState<string | null>("1")
  const messageTextareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Compute custom variable names from all loaded leads
  const customVarKeys = React.useMemo(() => {
    const keys = new Set<string>()
    leads.forEach(l => l.custom_vars && Object.keys(l.custom_vars).forEach(k => keys.add(k)))
    return Array.from(keys)
  }, [leads])

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
  })

  // ─── Carga inicial ──────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!id) return
    fetchAll()
  }, [id])

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

  // ─── Acciones campaña ───────────────────────────────────────────────────────

  const saveCampaign = async (extraUpdates?: Partial<Campaign>) => {
    if (!campaign) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/linkedin/campaigns?id=${id}`, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({ sequence: steps, settings, ...extraUpdates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error guardando")
      setCampaign(data.campaign)
      setSuccess("✓ Guardado correctamente")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async () => {
    if (!campaign) return
    const newStatus = campaign.status === "active" ? "paused" : "active"
    const started = newStatus === "active" ? new Date().toISOString() : undefined
    await saveCampaign({ status: newStatus, ...(started ? { started_at: started } : {}) })
  }

  const deleteCampaign = async () => {
    if (!confirm(`¿Eliminar la campaña "${campaign?.name}"? Esta acción no se puede deshacer.`)) return
    await fetch(`/api/linkedin/campaigns?id=${id}`, { method: "DELETE", headers: apiHeaders() })
    navigate("/dashboard/campaigns")
  }

  // ─── Leads ──────────────────────────────────────────────────────────────────

  const removeLeadFromCampaign = async (leadId: string) => {
    try {
      await fetch(`/api/linkedin/campaigns?id=${id}&action=leads&leadId=${leadId}`, {
        method: "DELETE",
        headers: apiHeaders(),
      })
      setLeads(leads.filter(l => l.id !== leadId))
    } catch { /* silent */ }
  }

  // ─── Secuencia ──────────────────────────────────────────────────────────────

  const addStep = () => {
    const newStep: SequenceStep = {
      id: Date.now().toString(),
      type: "message",
      content: "",
      useAI: false,
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
    setSteps(steps.map(s => s.id === stepId ? { ...s, ...updates } : s))
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

  // ─── Render: Loading ────────────────────────────────────────────────────────

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
    if (!search) return true
    const q = search.toLowerCase()
    return (
      `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
      l.company?.toLowerCase().includes(q) ||
      l.linkedin_url?.toLowerCase().includes(q)
    )
  })

  const statusConfig = {
    draft: { label: "Borrador", color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
    active: { label: "Activa", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
    paused: { label: "Pausada", color: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
    completed: { label: "Completada", color: "bg-slate-500/10 border-slate-500/20 text-slate-400" },
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/campaigns"><ArrowLeft className="w-5 h-5" /></Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{campaign.name}</h2>
            <p className="text-sm text-slate-400">{campaign.description || "Sin descripción"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Status pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${statusConfig[campaign.status]?.color}`}>
            <span className="w-2 h-2 rounded-full bg-current opacity-60 shrink-0" />
            {statusConfig[campaign.status]?.label}
          </div>

          <div className="w-px h-7 bg-slate-700 mx-1" />

          {/* Launch / Pause */}
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              campaign.status === "active"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            {campaign.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {campaign.status === "active" ? "Pausar campaña" : "Lanzar campaña"}
          </button>

          {/* Save */}
          <button
            onClick={() => saveCampaign()}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>

          {/* Delete */}
          <button
            onClick={deleteCampaign}
            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Eliminar campaña"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notificaciones */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-3 mb-4">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" /><p className="text-sm text-red-400">{error}</p></div>
        </Card>
      )}
      {success && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-3 mb-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /><p className="text-sm text-emerald-400">{success}</p></div>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-800 mb-6">
        <nav className="flex gap-8">
          {(["leads", "sequences", "options", "analytics"] as const).map(tab => {
            const labels = { leads: "Leads", sequences: "Secuencias", options: "Opciones", analytics: "Analítica" }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-4 text-base font-medium border-b-2 transition-colors ${activeTab === tab ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                {labels[tab]}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ─── Tab: Leads ─────────────────────────────────────────────────────── */}
      {activeTab === "leads" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Buscar lead..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-slate-950 border-slate-800"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Users className="w-4 h-4" />
                <span>{leads.length} leads</span>
              </div>
            </div>
            <Button onClick={() => setShowAddLeadModal(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Añadir Leads
            </Button>
          </div>

          {filteredLeads.length === 0 ? (
            <Card className="p-12 flex flex-col items-center justify-center gap-4 border-dashed border-slate-700 bg-slate-900/20">
              <Users className="w-12 h-12 text-slate-600" />
              <div className="text-center">
                <p className="font-medium text-slate-300 mb-1">Sin leads aún</p>
                <p className="text-sm text-slate-500">Añade leads para empezar tu campaña de outreach</p>
              </div>
              <Button onClick={() => setShowAddLeadModal(true)} variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> Añadir Leads
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-400 tracking-wide">CONTACTO</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-400 tracking-wide">ESTADO</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-400 tracking-wide">EMPRESA</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-400 tracking-wide">CARGO</th>
                      <th className="text-left px-5 py-4 text-sm font-semibold text-slate-400 tracking-wide">EMAIL</th>
                      <th className="text-right px-5 py-4 text-sm font-semibold text-slate-400 tracking-wide">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr key={lead.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                              {(lead.first_name?.[0] || "?").toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-200 text-sm">{lead.first_name} {lead.last_name}</p>
                              {lead.linkedin_url && (
                                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-0.5">
                                  <Linkedin className="w-3 h-3" /> LinkedIn
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={lead.status} sent={lead.sent_message} />
                        </td>
                        <td className="px-5 py-4 text-slate-300 text-sm">{lead.company || "—"}</td>
                        <td className="px-5 py-4 text-slate-400 text-sm">{lead.position || "—"}</td>
                        <td className="px-5 py-4 text-slate-400 text-sm">{lead.email || "—"}</td>
                        <td className="px-5 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400" onClick={() => setLeadToDelete(lead.id)}>
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

      {/* ─── Tab: Secuencias ────────────────────────────────────────────────── */}
      {activeTab === "sequences" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Panel izquierdo - lista de pasos */}
          <div className="lg:col-span-2 space-y-3">
            {steps.map((step, index) => (
              <div key={step.id}>
                {index > 0 && (
                  <div className="flex flex-col items-center py-2 text-slate-500">
                    <div className="h-4 w-px bg-slate-800" />
                    <div className="flex items-center gap-1.5 text-sm font-medium bg-slate-900 px-4 py-1.5 rounded-full border border-slate-800 my-1">
                      <Clock className="w-3.5 h-3.5" />
                      Esperar {formatDelay(step.delayDays, step.delayUnit)}
                    </div>
                    <div className="h-4 w-px bg-slate-800" />
                  </div>
                )}
                <Card
                  onClick={() => setActiveStepId(step.id)}
                  className={`p-4 cursor-pointer transition-all ${activeStepId === step.id ? "border-blue-500 bg-blue-500/5" : "border-slate-700 hover:border-slate-500"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">Paso {index + 1}</Badge>
                      <span className="text-sm font-medium text-slate-300">
                        {step.type === "invitation" ? "✉️ Invitación" : "💬 Mensaje"}
                      </span>
                      {step.useAI && (
                        <Badge variant="outline" className="gap-1 text-xs text-blue-400 border-blue-500/30 bg-blue-500/10 py-0.5 px-2">
                          <Bot className="w-3 h-3" /> IA
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {index > 0 && (
                        <button className="p-1 text-slate-500 hover:text-slate-300" onClick={e => { e.stopPropagation(); moveStep(index, "up") }} title="Subir">↑</button>
                      )}
                      {index < steps.length - 1 && (
                        <button className="p-1 text-slate-500 hover:text-slate-300" onClick={e => { e.stopPropagation(); moveStep(index, "down") }} title="Bajar">↓</button>
                      )}
                      {index > 0 && (
                        <button className="p-1 text-slate-500 hover:text-red-400" onClick={e => { e.stopPropagation(); removeStep(step.id) }} title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 truncate mt-1">{step.content || "Sin contenido aún…"}</p>
                </Card>
              </div>
            ))}

            <Button variant="outline" className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white gap-2" onClick={addStep}>
              <Plus className="w-4 h-4" /> Añadir Paso
            </Button>
          </div>

          {/* Panel derecho - editor del paso */}
          <div className="lg:col-span-3">
            {activeStep ? (
              <Card className="p-6 space-y-5 h-full">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-200">
                    {activeStep.type === "invitation" ? "✉️ Invitación" : "💬 Mensaje"} — Paso {steps.findIndex(s => s.id === activeStep.id) + 1}
                  </h3>
                  {steps.findIndex(s => s.id === activeStep.id) > 0 && (
                    <select
                      value={activeStep.type}
                      onChange={e => updateStep(activeStep.id, { type: e.target.value as "invitation" | "message" })}
                      className="text-xs bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-300"
                    >
                      <option value="invitation">Invitación</option>
                      <option value="message">Mensaje</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Mensaje</label>
                  <textarea
                    ref={messageTextareaRef}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-44"
                    placeholder="Escribe tu mensaje aquí... Usa las variables de abajo para personalizarlo."
                    value={activeStep.content}
                    onChange={e => updateStep(activeStep.id, { content: e.target.value })}
                  />
                  {/* Variable chips — click to insert at cursor */}
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {['nombre', 'apellido', 'empresa', 'cargo', 'sector'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVariable(v)}
                          className="text-xs px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600 font-mono transition-colors"
                          title={`Insertar ${v}`}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                    {customVarKeys.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-slate-500 self-center mr-1">Personalizadas:</span>
                        {customVarKeys.map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariable(v)}
                            className="text-xs px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/40 font-mono transition-colors"
                            title={`Insertar variable personalizada: ${v}`}
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <Bot className={`w-4 h-4 ${activeStep.useAI ? "text-blue-400" : "text-slate-500"}`} />
                    <div>
                      <p className="text-xs font-medium text-slate-200">Personalización con IA</p>
                      <p className="text-xs text-slate-500">EficacIA adapta el mensaje al perfil del lead</p>
                    </div>
                  </div>
                  <Switch checked={activeStep.useAI} onCheckedChange={c => updateStep(activeStep.id, { useAI: c })} />
                </div>

                {steps.findIndex(s => s.id === activeStep.id) > 0 && (
                  <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <p className="text-xs font-medium text-slate-200">Espera antes de este paso</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="999"
                        className="w-16 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-sm text-center text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={activeStep.delayDays}
                        onChange={e => updateStep(activeStep.id, { delayDays: Math.max(1, parseInt(e.target.value) || 1) })}
                      />
                      <select
                        value={activeStep.delayUnit || 'days'}
                        onChange={e => updateStep(activeStep.id, { delayUnit: e.target.value as SequenceStep['delayUnit'] })}
                        className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="minutes">minutos</option>
                        <option value="hours">horas</option>
                        <option value="days">días</option>
                        <option value="weeks">semanas</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <Button onClick={() => saveCampaign()} disabled={saving} className="gap-2 w-full">
                    <Save className="w-4 h-4" />
                    {saving ? "Guardando..." : "Guardar Secuencia"}
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-dashed border-slate-700 bg-slate-900/20">
                <MessageSquare className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-slate-400">Selecciona un paso para editarlo</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Opciones ──────────────────────────────────────────────────── */}
      {activeTab === "options" && (
        <div className="space-y-4 max-w-3xl">
          {/* Cuentas LinkedIn */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-200">Cuentas de LinkedIn</h3>
                <p className="text-xs text-slate-400 mt-0.5">Selecciona las cuentas desde las que se enviará esta campaña</p>
              </div>
            </div>
            {accounts.length === 0 ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-300">No tienes cuentas conectadas. <Link to="/dashboard" className="underline">Conecta una cuenta</Link> primero.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map(acc => (
                  <label key={acc.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 hover:border-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-slate-700"
                      checked={settings.linkedin_account_ids.includes(acc.id)}
                      onChange={e => {
                        setSettings(s => ({
                          ...s,
                          linkedin_account_ids: e.target.checked
                            ? [...s.linkedin_account_ids, acc.id]
                            : s.linkedin_account_ids.filter(id => id !== acc.id),
                        }))
                      }}
                    />
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {acc.profile_name?.[0]?.toUpperCase() || "L"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{acc.profile_name || acc.username}</p>
                      <p className="text-xs text-slate-500">{acc.is_valid ? "✓ Activa" : "⚠ Inactiva"}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* Stop on reply */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200">Parar al recibir respuesta</h3>
                <p className="text-xs text-slate-400 mt-0.5">No enviar más mensajes a un lead si ya ha respondido</p>
              </div>
              <Switch
                checked={settings.stop_on_reply}
                onCheckedChange={v => setSettings(s => ({ ...s, stop_on_reply: v }))}
              />
            </div>
          </Card>

          {/* Límites diarios */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-200 mb-1">Límites diarios</h3>
            <p className="text-xs text-slate-400 mb-4">Controla cuántas acciones se realizan cada día para evitar restricciones de LinkedIn</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { key: "daily_limit_profiles", label: "Perfiles vistos" },
                { key: "daily_limit_messages", label: "Mensajes" },
                { key: "daily_limit_invitations", label: "Invitaciones" },
                { key: "daily_limit_visits", label: "Visitas perfil" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={(settings as any)[key]}
                    onChange={e => setSettings(s => ({ ...s, [key]: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Button onClick={() => saveCampaign()} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar Opciones"}
          </Button>
        </div>
      )}

      {/* ─── Tab: Analítica ─────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={statusConfig[campaign.status]?.color}>
              {statusConfig[campaign.status]?.label}
            </Badge>
            {campaign.started_at && (
              <p className="text-xs text-slate-400">
                Iniciada: {new Date(campaign.started_at).toLocaleDateString("es-ES")}
              </p>
            )}
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Invitaciones", value: 0, icon: Mail, color: "text-blue-400" },
              { label: "Aceptadas", value: 0, icon: CheckCircle2, color: "text-emerald-400" },
              { label: "Mensajes", value: 0, icon: MessageSquare, color: "text-amber-400" },
              { label: "Respondidos", value: 0, icon: TrendingUp, color: "text-purple-400" },
              { label: "Visitas", value: 0, icon: Eye, color: "text-cyan-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="p-4 flex flex-col items-center gap-1">
                <Icon className={`w-5 h-5 ${color} mb-1`} />
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-2xl font-bold text-slate-100">{value}</p>
              </Card>
            ))}
          </div>

          {/* Leads en campaña */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-slate-400" />
              <h3 className="font-semibold text-slate-200">Progreso de Leads</h3>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center">
              {[
                { label: "Total leads", value: leads.length },
                { label: "Mensaje enviado", value: leads.filter(l => l.sent_message).length },
                { label: "Pendientes", value: leads.filter(l => !l.sent_message).length },
                { label: "Con email", value: leads.filter(l => l.email).length },
                { label: "Con LinkedIn", value: leads.filter(l => l.linkedin_url).length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                  <p className="text-xl font-bold text-slate-100">{value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {campaign.status === "draft" && (
            <Card className="p-5 border-dashed border-slate-700 bg-slate-900/20 text-center">
              <Play className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-medium mb-1">La campaña no está activa</p>
              <p className="text-sm text-slate-500 mb-4">Lanza la campaña desde el botón "Lanzar" para ver analíticas en tiempo real</p>
              <Button onClick={toggleStatus} className="gap-2">
                <Play className="w-4 h-4" /> Lanzar Campaña
              </Button>
            </Card>
          )}
        </div>
      )}
      {/* ─── Confirmación: Eliminar lead ──────────────────────────────────────── */}
      {leadToDelete && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setLeadToDelete(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100">¿Eliminar este lead?</h3>
                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <p className="text-sm text-slate-400">El lead será eliminado de esta campaña permanentemente.</p>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => setLeadToDelete(null)}>Cancelar</Button>
              <Button
                className="bg-red-500 hover:bg-red-600 border-0"
                onClick={() => { removeLeadFromCampaign(leadToDelete); setLeadToDelete(null) }}
              >
                Eliminar Lead
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Modal: Importar Leads ───────────────────────────────────────────── */}
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

// ─── Helper: StatusBadge ─────────────────────────────────────────────────────

function StatusBadge({ status, sent }: { status: string; sent: boolean }) {
  if (sent) return <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-xs">✓ Enviado</Badge>
  const map: Record<string, string> = {
    new: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    contacted: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    qualified: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    converted: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  }
  const labels: Record<string, string> = { new: "Nuevo", contacted: "Contactado", qualified: "Cualificado", converted: "Convertido" }
  return <Badge variant="outline" className={`${map[status] || map.new} text-xs`}>{labels[status] || "Nuevo"}</Badge>
}
