import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { BarChart3, Users, MessageSquare, CheckCircle2 } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-slate-400">Métricas de rendimiento de tus campañas.</p>
      </div>

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
  )
}
