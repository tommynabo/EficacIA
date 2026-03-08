import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import {
  BarChart3, Users, MessageSquare, CheckCircle2, TrendingUp,
  Send, Activity, Zap
} from "lucide-react"

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = React.useState<"resumen" | "actividad">("resumen")
  const [campaigns, setCampaigns] = React.useState<any[]>([])
  const [loadingActivity, setLoadingActivity] = React.useState(false)

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: "Borrador", color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
    active: { label: "Activa", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
    paused: { label: "Pausada", color: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
    completed: { label: "Completada", color: "bg-slate-500/10 border-slate-500/20 text-slate-400" },
  }

  const fetchCampaignActivity = async () => {
    setLoadingActivity(true)
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch("/api/linkedin/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch { /* silent */ } finally {
      setLoadingActivity(false)
    }
  }

  React.useEffect(() => {
    if (activeTab === "actividad" && campaigns.length === 0) {
      fetchCampaignActivity()
    }
  }, [activeTab])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-slate-400">Métricas de rendimiento de tus campañas.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-8">
          {(["resumen", "actividad"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
            >
              {tab === "resumen" ? "Resumen" : "Actividad"}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Tab: Resumen ─────────────────────────────────────────── */}
      {activeTab === "resumen" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Invitaciones Enviadas</CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">1,248</div>
                <p className="text-xs text-emerald-400 mt-1">+12% desde el mes pasado</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Tasa de Aceptación</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">34.2%</div>
                <p className="text-xs text-emerald-400 mt-1">+4.1% desde el mes pasado</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Mensajes Enviados</CardTitle>
                <MessageSquare className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">842</div>
                <p className="text-xs text-slate-500 mt-1">En los últimos 30 días</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Tasa de Respuesta</CardTitle>
                <BarChart3 className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">12.8%</div>
                <p className="text-xs text-emerald-400 mt-1">+2.4% desde el mes pasado</p>
              </CardContent>
            </Card>
          </div>

          <Card className="min-h-[400px] flex items-center justify-center border-dashed border-slate-700 bg-slate-900/20">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-300">Gráfico de Conversión</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-2">
                Aquí se integrará Recharts para mostrar la evolución temporal de aceptaciones y respuestas.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Tab: Actividad ───────────────────────────────────────── */}
      {activeTab === "actividad" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Envíos y actividad por campaña</p>
            <button
              onClick={fetchCampaignActivity}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              ↻ Actualizar
            </button>
          </div>

          {loadingActivity ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <Card className="p-14 flex flex-col items-center justify-center gap-4 border-dashed border-slate-700 bg-slate-900/20">
              <Activity className="w-12 h-12 text-slate-600" />
              <div className="text-center">
                <p className="font-medium text-slate-300 mb-1">Sin actividad registrada</p>
                <p className="text-sm text-slate-500">Crea campañas y lánzalas para ver la actividad aquí</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign: any) => {
                const total = campaign.leads_count || 0
                const sent = campaign.leads_sent || 0
                const pct = total > 0 ? Math.round((sent / total) * 100) : 0
                const sc = statusConfig[campaign.status] || statusConfig.draft
                return (
                  <Card key={campaign.id} className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                          <Zap className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-100 truncate">{campaign.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {campaign.description || "Sin descripción"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className={sc.color}>{sc.label}</Badge>
                        <span className="text-xs text-slate-500">
                          {new Date(campaign.created_at).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    </div>

                    {/* Metric boxes */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
                      {[
                        { icon: Send, label: "Invitaciones", value: 0, color: "text-blue-400" },
                        { icon: CheckCircle2, label: "Aceptadas", value: 0, color: "text-emerald-400" },
                        { icon: MessageSquare, label: "Mensajes", value: 0, color: "text-purple-400" },
                        { icon: TrendingUp, label: "Respuestas", value: 0, color: "text-amber-400" },
                        { icon: Users, label: "Leads totales", value: total, color: "text-cyan-400" },
                      ].map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="bg-slate-800/40 rounded-lg p-3 text-center">
                          <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                          <p className="text-lg font-bold text-slate-100">{value}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                        <span>Cobertura de leads</span>
                        <span className="font-mono">{pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

            <CardTitle className="text-sm font-medium text-slate-400">Invitaciones Enviadas</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1,248</div>
            <p className="text-xs text-emerald-400 mt-1">+12% desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Tasa de Aceptación</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">34.2%</div>
            <p className="text-xs text-emerald-400 mt-1">+4.1% desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Mensajes Enviados</CardTitle>
            <MessageSquare className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">842</div>
            <p className="text-xs text-slate-500 mt-1">En los últimos 30 días</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Tasa de Respuesta</CardTitle>
            <BarChart3 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">12.8%</div>
            <p className="text-xs text-emerald-400 mt-1">+2.4% desde el mes pasado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-[400px] flex items-center justify-center border-dashed border-slate-700 bg-slate-900/20">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Gráfico de Conversión</h3>
          <p className="text-sm text-slate-500 max-w-sm mt-2">
            Aquí se integrará Recharts para mostrar la evolución temporal de aceptaciones y respuestas.
          </p>
        </div>
      </Card>
    </div>
  )
}
