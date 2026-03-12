import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { ShieldAlert, CheckCircle2, Plus, Moon, Sun } from "lucide-react"
import { useTheme } from "@/src/contexts/ThemeContext"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState("proxies")

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Ajustes</h2>
        <p className="text-slate-400">Configura tu cuenta y preferencias de seguridad.</p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 flex-wrap">
        {[{ key: "profile", label: "Perfil" }, { key: "proxies", label: "Proxies", badge: "Obligatorio" }, { key: "billing", label: "Facturación" }].map(({ key, label, badge }) => (
          <button
            key={key}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${activeTab === key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {badge && (
              <Badge variant="destructive" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {activeTab === "proxies" && (
        <div className="space-y-6">
          <Card className="border-red-500/30 bg-red-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <CardTitle className="text-red-400">Protección de Cuenta Requerida</CardTitle>
                  <CardDescription className="text-red-300/70">
                    Para evitar baneos en LinkedIn, es obligatorio configurar un proxy residencial antes de iniciar cualquier campaña.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tus Proxies</CardTitle>
                  <CardDescription>Añade y gestiona tus proxies residenciales.</CardDescription>
                </div>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Añadir Proxy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">192.168.1.1:8080</p>
                    <p className="text-xs text-slate-500">España, Madrid • HTTP</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Activo
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "profile" && (
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
      )}

      {activeTab === "billing" && (
        <Card className="p-8 flex flex-col items-center justify-center gap-4 border-dashed border-slate-700 bg-slate-900/20">
          <p className="text-slate-400">Gestión de facturación próximamente.</p>
        </Card>
      )}

      {activeTab === "apariencia" && (
        // Eliminado: subpágina de apariencia
      )}
    </div>
  )
}
