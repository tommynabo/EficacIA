import * as React from "react"
import { Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import {
  Zap, Inbox, Users, Check, ArrowRight, Shield,
  MessageSquare, Brain, Layers, Target, BarChart3,
  Globe, Sparkles, TrendingUp, ChevronRight
} from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 antialiased">

      {/* ─── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">EficacIA</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/features" className="text-sm text-slate-400 hover:text-white transition-colors">Features</Link>
            <Link to="/pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Precios</Link>
            <Link to="/afiliados" className="text-sm text-slate-400 hover:text-white transition-colors">Afiliados</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
              Iniciar Sesión
            </Link>
            <Button asChild className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-indigo-500/20 text-sm h-9 px-4">
              <Link to="/pricing">Empezar Gratis</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950/0 to-transparent" />
          <div className="absolute top-20 left-1/4 w-80 h-80 bg-violet-700/10 rounded-full blur-3xl" />
          <div className="absolute top-10 right-1/4 w-60 h-60 bg-indigo-700/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 leading-none">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400">
              Escala tu Prospección
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400">
              en LinkedIn con IA
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Extrae leads de calidad, lanza campañas ultra-personalizadas y gestiona todas tus conversaciones desde un único Unibox inteligente. Todo sin riesgo de bloqueo.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <Button size="lg" className="group w-full sm:w-auto text-base h-12 px-8 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/20 whitespace-nowrap" asChild>
              <Link to="/pricing">
                Comenzar 3 Días de Prueba
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8 border-slate-700 text-slate-300 hover:bg-slate-800/60 hover:text-white hover:border-slate-600" asChild>
              <Link to="/features">Ver Cómo Funciona</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-400" /> 3 días de prueba gratis</div>
            <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-400" /> Cancela cuando quieras</div>
          </div>
        </div>
      </section>

      {/* ─── Oferta de Lanzamiento ────────────────────────────────────────── */}
      <section className="relative px-6 -mt-16 mb-16 z-20">
        <div className="max-w-4xl mx-auto rounded-2xl border border-violet-500/50 bg-gradient-to-r from-indigo-900/90 to-violet-950/90 p-4 text-center shadow-2xl shadow-violet-500/20 flex flex-col sm:flex-row items-center justify-center gap-4 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-violet-200">
            <span className="text-xl">🚀</span>
            <span className="font-semibold whitespace-nowrap">Oferta de Lanzamiento:</span>
          </div>
          <p className="text-white text-sm md:text-base">
            Los primeros <span className="font-bold text-violet-300">50 usuarios</span> obtienen el Plan SCALE con un <span className="font-bold text-emerald-400">20% extra de descuento</span> de por vida. ¡Quedan pocas plazas!
          </p>
          <Button size="sm" className="bg-violet-500 hover:bg-violet-600 text-white border-0 shrink-0 whitespace-nowrap flex items-center" asChild>
            <Link to="/pricing">Reclamar Oferta</Link>
          </Button>
        </div>
      </section>

      {/* ─── Stats Bar ────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-800/60 bg-slate-900/20">
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "+1.500", label: "mensajes enviados" },
            { value: "40%",  label: "Más tasa de aceptación" },
            { value: "3x",   label: "Más reuniones agendadas" },
            { value: "0",    label: "Cuentas baneadas" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400 mb-1">{stat.value}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Bento Grid ──────────────────────────────────────────────────── */}
      <section className="py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-800/50 text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">
              <Layers className="w-3 h-3" /> Plataforma Completa
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-4">
              Todo lo que necesitas en un solo lugar
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Desde la extracción de leads hasta el cierre de la venta, EficacIA cubre cada paso del proceso.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Campaign Engine — wide card */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 relative overflow-hidden hover:border-indigo-500/40 transition-all duration-300 min-h-[280px] flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-indigo-500/5 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center mb-5">
                  <Target className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
                  Campaign Engine
                </span>
                <h3 className="text-2xl font-bold text-white mb-2">Campañas de Outreach Automatizadas</h3>
                <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
                  Diseña secuencias multi-paso con delays inteligentes. La IA personaliza cada mensaje basándose en el cargo, sector y empresa del prospecto.
                </p>
              </div>
              <div className="relative z-10 flex flex-wrap gap-2 mt-6">
                {["Seguros & Anti-ban", "Delays humanos", "A/B Testing", "Personalización IA"].map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs">{tag}</span>
                ))}
              </div>
            </div>

            {/* AI Assistant */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 relative overflow-hidden hover:border-violet-500/40 transition-all duration-300 min-h-[280px] flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mb-5">
                  <Brain className="w-5 h-5 text-violet-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-3">
                  AI Assistant
                </span>
                <h3 className="text-xl font-bold text-white mb-2">Redacción con IA</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Genera respuestas, follow-ups y mensajes de conexión que suenan 100% humanos. Entrena al asistente con tu voz de marca.
                </p>
              </div>
              <div className="relative z-10 flex items-center gap-2 text-xs text-violet-400 mt-4">
                <Sparkles className="w-3.5 h-3.5" /> Powered by GPT-4o
              </div>
            </div>

            {/* Unibox */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 relative overflow-hidden hover:border-purple-500/40 transition-all duration-300 min-h-[280px] flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center mb-5">
                  <Inbox className="w-5 h-5 text-purple-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium mb-3">
                  Unibox
                </span>
                <h3 className="text-xl font-bold text-white mb-2">Bandeja Unificada Inteligente</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Gestiona todas tus cuentas de LinkedIn desde un solo lugar. Filtra por sentimiento y prioriza los leads más calientes.
                </p>
              </div>
              <div className="relative z-10 flex items-center gap-2 text-xs text-purple-400 mt-4">
                <MessageSquare className="w-3.5 h-3.5" /> Multi-cuenta sin límites
              </div>
            </div>

            {/* Lead Extraction */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 relative overflow-hidden hover:border-emerald-500/40 transition-all duration-300 min-h-[280px] flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 via-transparent to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mb-5">
                  <Users className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                  Lead Finder
                </span>
                <h3 className="text-xl font-bold text-white mb-2">Extracción de Leads de Calidad</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Encuentra tu ICP exacto con filtros avanzados por sector, cargo y empresa. Listas limpias y verificadas.
                </p>
              </div>
              <div className="relative z-10 flex items-center gap-2 text-xs text-emerald-400 mt-4">
                <Globe className="w-3.5 h-3.5" /> LinkedIn + Sales Navigator
              </div>
            </div>

            {/* Analytics */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 relative overflow-hidden hover:border-sky-500/40 transition-all duration-300 min-h-[280px] flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-900/20 via-transparent to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center mb-5">
                  <BarChart3 className="w-5 h-5 text-sky-400" />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium mb-3">
                  Analytics
                </span>
                <h3 className="text-xl font-bold text-white mb-2">Métricas en Tiempo Real</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Tasas de aceptación, respuesta y conversión. Itera rápido con datos claros y accionables.
                </p>
              </div>
              <div className="relative z-10 flex items-center gap-2 text-xs text-sky-400 mt-4">
                <TrendingUp className="w-3.5 h-3.5" /> Dashboards interactivos
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────────────────── */}
      <section className="py-28 border-t border-slate-800/60">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-4">
              En marcha en menos de 10 minutos
            </h2>
            <p className="text-slate-400 text-lg">Sin configuración compleja. Sin conocimientos técnicos.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: Users,      title: "Conecta tu LinkedIn",   desc: "Integra tu cuenta en segundos. Nuestro sistema cloud gestiona las sesiones de forma segura y anónima." },
              { step: "02", icon: Target,     title: "Define tu ICP y lanza", desc: "Filtra por cargo, sector y empresa. Crea tu secuencia con la ayuda de la IA y activa la campaña." },
              { step: "03", icon: TrendingUp, title: "Convierte en clientes",  desc: "Gestiona las respuestas desde el Unibox, filtra los leads calientes y cierra más reuniones." },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative">
                <div className="text-6xl font-black text-indigo-500/10 absolute -top-4 -left-2 select-none">{step}</div>
                <div className="relative pt-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
                  <p className="text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing teaser ──────────────────────────────────────────────── */}
      <section className="py-28 border-t border-slate-800/60">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-800/50 text-slate-400 text-xs font-medium uppercase tracking-wider mb-6">
            <Zap className="w-3 h-3" /> Precios
          </div>
          <h2 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-4">
            Planes transparentes sin sorpresas
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Desde <span className="text-white font-semibold">42€/mes</span>. Incluye 3 días de prueba gratuita.
          </p>
          <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/20 h-12 px-8 text-base whitespace-nowrap" asChild>
            <Link to="/pricing" className="flex items-center justify-center">Ver todos los planes</Link>
          </Button>
        </div>
      </section>

      {/* ─── CTA Banner ──────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 via-slate-900/60 to-violet-950/60 p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-white mb-4">Empieza a prospectar hoy</h2>
            <p className="text-slate-400 text-lg mb-8 max-w-lg mx-auto">
              Únete a los equipos de ventas que ya generan pipeline de forma consistente con EficacIA.
            </p>
            <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/30 h-12 px-8 text-base whitespace-nowrap" asChild>
              <Link to="/pricing">Comenzar Prueba Gratis</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link to="/" className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold tracking-tight">EficacIA</span>
              </Link>
              <p className="text-slate-500 text-sm leading-relaxed">
                La plataforma de prospección LinkedIn con IA más avanzada del mercado hispanohablante.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">Producto</h4>
              <ul className="space-y-3 text-sm text-slate-500">
                <li><Link to="/features" className="hover:text-slate-300 transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="hover:text-slate-300 transition-colors">Precios</Link></li>
                <li><Link to="/afiliados" className="hover:text-slate-300 transition-colors">Afiliados</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">Legal</h4>
              <ul className="space-y-3 text-sm text-slate-500">
                <li><Link to="/privacidad" className="hover:text-slate-300 transition-colors cursor-pointer">Política de Privacidad</Link></li>
                <li><Link to="/terminos" className="hover:text-slate-300 transition-colors cursor-pointer">Términos y Condiciones</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800/60 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-600 text-sm">&copy; {new Date().getFullYear()} EficacIA. Todos los derechos reservados.</p>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-slate-600" />
              <p className="text-slate-600 text-sm">Hecho con ❤️ para equipos de ventas en España y LATAM</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
