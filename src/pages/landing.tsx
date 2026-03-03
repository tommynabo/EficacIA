import * as React from "react"
import { Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Zap, CheckCircle2, Bot, Inbox, Users } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">EficacIA</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Iniciar Sesión
            </Link>
            <Button asChild>
              <Link to="/register">Empezar Gratis</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
              Automatización de LinkedIn que <span className="text-blue-500">no falla</span>.
            </h1>
            <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              Extrae leads, crea secuencias ultra-personalizadas con IA y gestiona todas tus conversaciones desde un Unibox inteligente.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="w-full sm:w-auto text-base h-12 px-8" asChild>
                <Link to="/register">Comenzar Prueba de 7 Días</Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8">
                Ver Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-900/20 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Users}
              title="Extracción de Leads"
              description="Encuentra a tu cliente ideal con filtros avanzados y exporta listas limpias listas para prospectar."
            />
            <FeatureCard 
              icon={Bot}
              title="Secuencias con IA"
              description="Personaliza cada mensaje de conexión basándote en el perfil del prospecto. Aumenta tu tasa de aceptación un 40%."
            />
            <FeatureCard 
              icon={Inbox}
              title="Unibox Inteligente"
              description="Gestiona múltiples cuentas desde una sola bandeja. Filtra por sentimiento y prioriza los leads calientes."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Precios Simples y Transparentes</h2>
          <p className="text-slate-400 mb-12">Todo lo que necesitas para escalar tus ventas B2B.</p>
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="text-left">
                <h3 className="text-2xl font-bold mb-2">Plan Pro</h3>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-5xl font-extrabold tracking-tight">49€</span>
                  <span className="text-slate-400">/mes</span>
                </div>
                <ul className="space-y-3">
                  {[
                    "Cuentas ilimitadas",
                    "Secuencias con IA generativa",
                    "Unibox centralizado",
                    "Soporte prioritario",
                    "Gestión de Proxies dedicada"
                  ].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-300">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="w-full md:w-auto">
                <Button size="lg" className="w-full md:w-64 h-14 text-lg" asChild>
                  <Link to="/register">Empezar Ahora</Link>
                </Button>
                <p className="text-sm text-slate-500 mt-4 text-center">Cancela en cualquier momento.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6">
        <Icon className="w-6 h-6 text-blue-500" />
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  )
}
