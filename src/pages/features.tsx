import * as React from "react"
import { Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import {
  Zap, Shield, Bot, Target, Clock, Eye, Brain,
  Layers, ArrowRight, Check, Activity, Lock,
  MessageSquare, Sparkles, ChevronRight, Globe
} from "lucide-react"

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">EficacIA</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link to="/features" className="text-sm text-white font-medium transition-colors">Features</Link>
          <Link to="/pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Precios</Link>
          <Link to="/afiliados" className="text-sm text-slate-400 hover:text-white transition-colors">Afiliados</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Iniciar Sesión</Link>
          <Button asChild className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 text-sm h-9 px-4">
            <Link to="/pricing">Empezar Gratis</Link>
          </Button>
        </div>
      </div>
    </nav>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Navbar />

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/25 via-transparent to-transparent" />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-8">
            <Layers className="w-3.5 h-3.5" />
            Desglose Técnico
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter mb-6 leading-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400">
              Tecnología que convierte
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400">
              sin arriesgar tu cuenta
            </span>
          </h1>
          <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            EficacIA no es un bot. Es un sistema de automatización diseñado desde cero para replicar comportamiento humano y mantenerse invisible para los algoritmos de LinkedIn.
          </p>
          <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/20 h-12 px-8 text-base" asChild>
            <Link to="/pricing">Empezar 7 días gratis <ArrowRight className="ml-2 w-4 h-4" /></Link>
          </Button>
        </div>
      </section>

      {/* ─── Anti-ban Section ───────────────────────────────────────────── */}
      <section className="py-24 border-t border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium uppercase tracking-wider mb-6">
                <Shield className="w-3 h-3" /> Tecnología Anti-Bloqueo
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-6">
                Cómo EficacIA protege tu cuenta de LinkedIn
              </h2>
              <p className="text-slate-400 leading-relaxed mb-8">
                LinkedIn detecta bots analizando patrones de comportamiento: velocidad de acciones, intervalos entre clicks, horarios de actividad y más. EficacIA emula el comportamiento humano en cada capa para ser completamente indetectable.
              </p>
              <div className="space-y-4">
                {[
                  {
                    icon: Clock,
                    title: "Delays Aleatorios con Distribución de Gauss",
                    desc: "Cada acción (conexión, mensaje, visita) se ejecuta con un delay aleatorio entre 30 segundos y varios minutos, siguiendo una distribución estadística que imita el ritmo humano real.",
                  },
                  {
                    icon: Activity,
                    title: "Límites Diarios Conservadores y Adaptativos",
                    desc: "Por defecto, EficacIA opera con límites muy por debajo del umbral de alerta de LinkedIn (máx. 25 conexiones/día). Puedes configurarlos, pero el sistema te avisa si te acercas a zonas de riesgo.",
                  },
                  {
                    icon: Globe,
                    title: "IPs Residenciales Rotativas por País",
                    desc: "Todas las sesiones se ejecutan desde IPs residenciales geolocalizadas en el país de tu cuenta, evitando discrepancias de geolocalización que levantan alertas.",
                  },
                  {
                    icon: Eye,
                    title: "Simulación de Comportamiento de Navegador",
                    desc: "Usamos sesiones de browser real (no headless) con movimientos de ratón, scroll y visitas a perfiles aleatorios antes y después de cada acción. LinkedIn ve un humano navegando.",
                  },
                  {
                    icon: Lock,
                    title: "Cifrado de Sesión End-to-End",
                    desc: "Tus credenciales de LinkedIn nunca se almacenan en texto plano. Usamos tokens de sesión encriptados con AES-256, que se invalidan automáticamente tras cada uso.",
                  },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
                      <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual panel */}
            <div className="space-y-4 sticky top-24">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado de Seguridad</span>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Sistema activo y seguro
                  </span>
                </div>
                {[
                  { label: "Detección de bot", status: "PROTEGIDO", ok: true },
                  { label: "Límites diarios", status: "CONSERVADOR", ok: true },
                  { label: "IP residencial", status: "ACTIVA", ok: true },
                  { label: "Simulación humana", status: "ON", ok: true },
                  { label: "Cifrado de sesión", status: "AES-256", ok: true },
                ].map(({ label, status, ok }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">Historial de Actividad</span>
                </div>
                <p className="text-slate-500 text-xs mb-4">Registro de las últimas acciones ejecutadas (simulado)</p>
                {[
                  { time: "hace 2 min", action: "Visita de perfil", user: "Carlos M. · CEO" },
                  { time: "hace 5 min", action: "Conexión enviada", user: "Laura P. · Directora Ventas" },
                  { time: "hace 12 min", action: "Mensaje follow-up", user: "Javier R. · Fundador" },
                  { time: "hace 18 min", action: "Visita de perfil", user: "Ana G. · Head of Sales" },
                ].map(({ time, action, user }) => (
                  <div key={user} className="flex items-start gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-300">{action} — <span className="text-slate-500">{user}</span></p>
                      <p className="text-xs text-slate-600">{time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── AI Assistant Section ───────────────────────────────────────── */}
      <section className="py-24 border-t border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs font-medium uppercase tracking-wider mb-4">
              <Brain className="w-3 h-3" /> AI Assistant
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-4">
              El asistente que escribe como tú
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              No más mensajes genéricos que todos reconocen como automatizados. El AI Assistant de EficacIA aprende tu estilo y genera mensajes que suenan exactamente como tú.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "Personalización por Perfil",
                desc: "Analiza el cargo, empresa, publicaciones recientes y conexiones del prospecto para generar un mensaje relevante y personalizado en segundos.",
                badge: "IA Generativa",
                badgeColor: "violet",
              },
              {
                icon: MessageSquare,
                title: "Biblioteca de Plantillas con IA",
                desc: "Elige entre docenas de plantillas probadas (conexión, follow-up, cierre de reunión) y personalízalas con variables dinámicas o con generación IA.",
                badge: "Templates",
                badgeColor: "indigo",
              },
              {
                icon: Sparkles,
                title: "Respuestas Inteligentes",
                desc: "Cuando un lead responde, el asistente analiza su mensaje y te sugiere 3 respuestas adaptadas al contexto. Elige, edita y envía en segundos.",
                badge: "Sugerencias",
                badgeColor: "purple",
              },
              {
                icon: Target,
                title: "A/B Testing de Mensajes",
                desc: "Prueba dos versiones de un mensaje con una porción de tu audiencia. El sistema identifica automáticamente cuál convierte mejor y escala el ganador.",
                badge: "Optimización",
                badgeColor: "emerald",
              },
              {
                icon: Bot,
                title: "Voz de Marca Personalizada",
                desc: "Alimenta al asistente con ejemplos de tus mejores mensajes pasados. Aprende tu tono, vocabulario y estilo para replicarlo de forma consistente.",
                badge: "Fine-tuning",
                badgeColor: "sky",
              },
              {
                icon: Layers,
                title: "Multiidioma Automático",
                desc: "¿Prospectas en varios mercados? El asistente detecta el idioma del perfil y genera el mensaje directamente en el idioma correcto.",
                badge: "Multi-idioma",
                badgeColor: "amber",
              },
            ].map(({ icon: Icon, title, desc, badge, badgeColor }) => (
              <div key={title} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-indigo-500/30 transition-all duration-200">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-${badgeColor}-500/10 border border-${badgeColor}-500/20 flex items-center justify-center`}>
                    <Icon className={`w-4.5 h-4.5 text-${badgeColor}-400`} />
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-${badgeColor}-500/10 border border-${badgeColor}-500/20 text-${badgeColor}-400`}>
                    {badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Campaign Engine Section ─────────────────────────────────────── */}
      <section className="py-24 border-t border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-medium uppercase tracking-wider mb-4">
              <Target className="w-3 h-3" /> Campaign Engine
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-4">
              Secuencias que se adaptan al comportamiento del lead
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              El Campaign Engine no ejecuta acciones ciegamente. Toma decisiones en función de lo que hace (o no hace) cada prospecto.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              {[
                { title: "Secuencias Multi-Paso", desc: "Conectar → esperar aceptación → mensaje de bienvenida → follow-up día 3 → cierre día 7. Diseña el flujo exacto que quieras." },
                { title: "Condiciones Lógicas", desc: "Si el lead acepta la conexión, envía mensaje A. Si no responde en 48h, envía seguimiento. Si responde negativamente, lo excluye automáticamente." },
                { title: "Exclusión Inteligente", desc: "EficacIA evita enviar mensajes a IDs que ya han respondido, que ya son clientes o que han marcado tu mensaje como spam." },
                { title: "Control de Throttle", desc: "Configura el ritmo de la campaña por día y hora. Puedes pausar entre semana y activar solo en horario laboral de tu mercado objetivo." },
              ].map(({ title, desc }) => (
                <div key={title} className="flex gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                  <Check className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">{title}</p>
                    <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-semibold text-white">Campaña: Directores Ventas SaaS</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Activa</span>
              </div>
              {[
                { step: "Paso 1", action: "Conexión enviada", count: "248 enviados", sub: "127 aceptados (51%)", color: "indigo" },
                { step: "Paso 2", action: "Mensaje de bienvenida", count: "127 enviados", sub: "43 respuestas (34%)", color: "violet" },
                { step: "Paso 3", action: "Follow-up día 3", count: "84 enviados", sub: "18 respuestas (21%)", color: "purple" },
                { step: "Paso 4", action: "CTA para reunión", count: "66 enviados", sub: "12 reuniones agendadas 🎉", color: "emerald" },
              ].map(({ step, action, count, sub, color }) => (
                <div key={step} className="flex items-center gap-4 py-3 border-b border-slate-800 last:border-0">
                  <div className={`w-2 h-2 rounded-full bg-${color}-400 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{step}</span>
                      <span className="text-sm text-white font-medium">{action}</span>
                    </div>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{count}</span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-sm">
                <span className="text-slate-400">Tasa de conversión global</span>
                <span className="text-emerald-400 font-bold">4.8% → Reuniones</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 border-t border-slate-800/60">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">¿Visto suficiente?</h2>
          <p className="text-slate-400 mb-8">Prueba EficacIA 7 días gratis. Sin tarjeta de crédito. Cancela cuando quieras.</p>
          <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/20 h-12 px-8 text-base" asChild>
            <Link to="/pricing">Empezar Prueba Gratuita <ArrowRight className="ml-2 w-4 h-4" /></Link>
          </Button>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">EficacIA</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link to="/" className="hover:text-slate-300 transition-colors">Inicio</Link>
            <Link to="/pricing" className="hover:text-slate-300 transition-colors">Precios</Link>
            <Link to="/afiliados" className="hover:text-slate-300 transition-colors">Afiliados</Link>
          </div>
          <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} EficacIA</p>
        </div>
      </footer>
    </div>
  )
}
