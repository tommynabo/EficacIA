import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { ShieldAlert, CheckCircle2, Plus, Moon, Sun, Download, Loader2 } from "lucide-react"
import { useTheme } from "@/src/contexts/ThemeContext"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState("profile")
  const [apiKey, setApiKey] = React.useState<string | null>(null)
  const [isLoadingKey, setIsLoadingKey] = React.useState(false)

  React.useEffect(() => {
    if (activeTab === "extension") {
      fetchApiKey()
    }
  }, [activeTab])

  const fetchApiKey = async () => {
    try {
      setIsLoadingKey(true)
      const token = localStorage.getItem('auth_token')
      const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
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
      const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
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
          { key: "billing", label: "Facturación" }
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
                  <CardTitle className="text-violet-400 text-lg">Extensión para Sales Navigator</CardTitle>
                  <CardDescription className="text-violet-300/70">
                    Esta extensión está diseñada EXCLUSIVAMENTE para funcionar en la página de resultados de LinkedIn Sales Navigator.
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
                  className="w-full mt-4 bg-white text-black hover:bg-zinc-200 font-bold py-7 transition-all hover:scale-[1.02] flex items-center justify-center gap-3 active:scale-95 shadow-xl shadow-white/5"
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
    </div>
  )
}
