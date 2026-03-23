import * as React from "react"
import { Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import {
  Zap, Check, ArrowRight, Shield, TrendingUp,
  Users, DollarSign, BarChart3, Gift, Star,
  ChevronRight, Award, Trophy, Medal
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
          <Link to="/features" className="text-sm text-slate-400 hover:text-white transition-colors">Features</Link>
          <Link to="/pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Precios</Link>
          <Link to="/afiliados" className="text-sm text-white font-medium transition-colors">Afiliados</Link>
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

// ─── Tier data ────────────────────────────────────────────────────────────────

const TIERS = [
  {
    name: "Bronce",
    icon: Medal,
    commission: "30%",
    commissionLabel: "Comisión Recurrente",
    threshold: "Nivel inicial",
    thresholdDesc: "Comienza a ganar desde tu primer referido",
    color: "amber",
    gradientFrom: "from-amber-900/20",
    borderColor: "border-amber-500/30",
    badgeBg: "bg-amber-500/10",
    badgeBorder: "border-amber-500/20",
    badgeText: "text-amber-400",
    perks: ["Dashboard personal de afiliado", "Links de tracking únicos", "Pagos mensuales", "Material de marketing gratuito"],
  },
  {
    name: "Plata",
    icon: Star,
    commission: "40%",
    commissionLabel: "Comisión Recurrente",
    threshold: "+1.000€/mes generados",
    thresholdDesc: "Al superar 1.000€ generados en un mes",
    color: "slate",
    gradientFrom: "from-slate-400/10",
    borderColor: "border-slate-400/40",
    badgeBg: "bg-slate-400/10",
    badgeBorder: "border-slate-400/20",
    badgeText: "text-slate-300",
    perks: ["Todo lo de Bronce", "Materiales co-branded", "Soporte prioritario", "Bonus por volumen trimestral"],
    popular: true,
  },
  {
    name: "Oro",
    icon: Trophy,
    commission: "50%",
    commissionLabel: "Comisión Recurrente",
    threshold: "+2.500€/mes generados",
    thresholdDesc: "Al superar 2.500€ generados en un mes",
    color: "yellow",
    gradientFrom: "from-yellow-900/20",
    borderColor: "border-yellow-500/30",
    badgeBg: "bg-yellow-500/10",
    badgeBorder: "border-yellow-500/20",
    badgeText: "text-yellow-400",
    perks: ["Todo lo de Plata", "Gestor de cuenta dedicado", "Adelanto de comisiones", "Sesiones de estrategia mensuales"],
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AfiliadosPage() {
  const handleJoinClick = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Navbar />

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/25 via-slate-950/0 to-transparent" />
          <div className="absolute top-10 right-1/3 w-72 h-72 bg-indigo-700/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-semibold uppercase tracking-widest mb-8">
            <Gift className="w-3.5 h-3.5" />
            Programa de Afiliados
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter mb-6 leading-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400">
              Gana hasta el
            </span>{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400">
              50% recomendando
            </span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400">
              la herramienta líder
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Recomienda EficacIA a tu red y cobra comisiones recurrentes cada mes que tus referidos sigan siendo clientes. Ingresos pasivos reales, sin complicaciones.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="group w-full sm:w-auto text-base h-12 px-8 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/20"
            >
              <a href="https://eficacia.getrewardful.com/signup" target="_blank" rel="noopener noreferrer">
                Convertirse en Afiliado
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8 border-slate-700 text-slate-300 hover:bg-slate-800/60 hover:text-white">
              Conocer más
            </Button>
          </div>
          {/* Mini stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-12 text-sm text-slate-500">
            <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-indigo-400" /> Comisiones recurrentes</div>
            <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-400" /> Dashboard en tiempo real</div>
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" /> Pagos garantizados</div>
          </div>
        </div>
      </section>

      {/* ─── Benefits ───────────────────────────────────────────────────── */}
      <section className="py-20 border-t border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-3">
              ¿Por qué ser afiliado de EficacIA?
            </h2>
            <p className="text-slate-400 max-w-lg mx-auto">Un programa diseñado para que crecer junto a nosotros sea lo más lucrativo posible.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: TrendingUp,
                title: "Comisiones Recurrentes",
                desc: "Cobras cada mes que tu referido siga activo. No es un pago único: es una renta mensual.",
                color: "indigo",
              },
              {
                icon: BarChart3,
                title: "Dashboard Propio",
                desc: "Visualiza tus clicks, conversiones y ganancias en tiempo real desde tu panel de afiliado.",
                color: "violet",
              },
              {
                icon: DollarSign,
                title: "Pagos Mensuales",
                desc: "Recibes tus comisiones el día 15 de cada mes vía transferencia bancaria o PayPal. Sin mínimos absurdos.",
                color: "emerald",
              },
              {
                icon: Users,
                title: "Soporte Dedicado",
                desc: "Acceo a materiales de marketing, guías de conversión y un equipo que te ayuda a maximizar tus ganancias.",
                color: "amber",
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className={`p-6 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors`}>
                <div className={`w-11 h-11 rounded-xl bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 text-${color}-400`} />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tier Ladder ────────────────────────────────────────────────── */}
      <section className="py-20 border-t border-slate-800/60">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-800/50 text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">
              <Award className="w-3 h-3" /> Estructura de Comisiones
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-3">
              Cuanto más generas, más ganas
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Nuestros tiers escalan automáticamente. Supera los umbrales y tu comisión sube de forma retroactiva ese mes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TIERS.map((tier) => {
              const Icon = tier.icon
              return (
                <div
                  key={tier.name}
                  className={`relative rounded-2xl border p-8 flex flex-col ${tier.gradientFrom} bg-gradient-to-br via-transparent to-transparent ${tier.borderColor} hover:scale-[1.01] transition-all duration-300 ${tier.popular ? 'ring-2 ring-slate-400/30 shadow-xl' : ''}`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-slate-400/20 border border-slate-400/30 text-slate-300 text-xs font-bold rounded-full whitespace-nowrap">
                      MÁS SOLICITADO
                    </div>
                  )}

                  {/* Tier badge */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${tier.badgeBg} border ${tier.badgeBorder} mb-6 w-fit`}>
                    <Icon className={`w-4 h-4 ${tier.badgeText}`} />
                    <span className={`text-sm font-bold ${tier.badgeText}`}>{tier.name}</span>
                  </div>

                  {/* Commission */}
                  <div className="mb-2">
                    <span className="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
                      {tier.commission}
                    </span>
                  </div>
                  <p className="text-white font-semibold mb-1">{tier.commissionLabel}</p>
                  <div className={`inline-flex items-center gap-1.5 text-xs ${tier.badgeText} mb-6`}>
                    <ChevronRight className="w-3 h-3" /> {tier.threshold}
                  </div>
                  <p className="text-slate-500 text-xs mb-6">{tier.thresholdDesc}</p>

                  <div className="h-px bg-slate-800 mb-6" />

                  <ul className="space-y-3 flex-1">
                    {tier.perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {/* Progress example */}
          <div className="mt-10 p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-center">
            <p className="text-slate-400 text-sm">
              💡 <span className="text-white font-medium">Ejemplo:</span> Si generas 3.000€ en suscripciones en un mes, cobras el <span className="text-yellow-400 font-bold">50% = 1.500€</span> ese mes. La siguiente vez que bajes de 2.500€, vuelves a Plata automáticamente.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Steps ──────────────────────────────────────────────────────── */}
      <section className="py-20 border-t border-slate-800/60">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-3">
              Empieza a ganar en 3 pasos
            </h2>
            <p className="text-slate-400">Sin burocracia. Sin esperas. Completamente gratis unirse.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Únete al Programa",
                desc: "Rellena el formulario de registro. Revisamos tu solicitud en menos de 24 horas y te enviamos tus credenciales de acceso.",
                icon: Users,
                cta: true,
              },
              {
                step: "2",
                title: "Promociona EficacIA",
                desc: "Comparte tu link único en LinkedIn, YouTube, tu newsletter o donde quieras. Tenemos materiales listos para ti.",
                icon: TrendingUp,
              },
              {
                step: "3",
                title: "Cobra tus Comisiones",
                desc: "Cada mes que tu referido pague, tú cobras. Automáticamente. El pago llega el día 15 del mes siguiente.",
                icon: DollarSign,
              },
            ].map(({ step, title, desc, icon: Icon, cta }) => (
              <div key={step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold mb-3">
                  {step}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 via-slate-900/60 to-violet-950/60 p-14 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">¿Listo para empezar a ganar?</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Únete a nuestra red de afiliados y construye un ingreso recurrente recomendando la herramienta que ya usan cientos de equipos de ventas.
            </p>
            <Button
              asChild
              size="lg"
              className="group bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-xl shadow-indigo-500/30 h-12 px-10 text-base font-semibold"
            >
              <a href="https://eficacia.getrewardful.com/signup" target="_blank" rel="noopener noreferrer">
                Convertirse en Afiliado
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <p className="text-slate-600 text-xs mt-4">Es completamente gratuito unirse. Sin compromisos.</p>
          </div>
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
            <Link to="/features" className="hover:text-slate-300 transition-colors">Features</Link>
            <Link to="/pricing" className="hover:text-slate-300 transition-colors">Precios</Link>
          </div>
          <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} EficacIA</p>
        </div>
      </footer>
    </div>
  )
}
