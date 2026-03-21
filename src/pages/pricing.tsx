import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CreditCard, Shield, Zap, Loader2, ArrowLeft, Star } from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import PaymentsService, { STRIPE_PRICES, PlanKey, BillingPeriod } from '@/src/services/payments'

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS: Array<{
  key: PlanKey
  name: string
  tagline: string
  monthlyPrice: number
  annualTotal: number
  popular: boolean
  badge?: string
  accentColor: string
  features: string[]
}> = [
  {
    key: 'pro',
    name: 'Starter',
    tagline: 'Perfecto para empezar',
    monthlyPrice: 49,
    annualTotal: 490,
    popular: false,
    accentColor: 'indigo',
    features: [
      'Hasta 500 leads/mes',
      'Búsqueda LinkedIn básica',
      '1 campaña activa',
      'Secuencias de 3 pasos',
      'Unibox unificado',
      'Soporte por email',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    tagline: 'El preferido por los equipos',
    monthlyPrice: 99,
    annualTotal: 990,
    popular: true,
    badge: 'MÁS POPULAR',
    accentColor: 'violet',
    features: [
      'Hasta 5.000 leads/mes',
      'LinkedIn + Sales Navigator',
      'Campañas ilimitadas',
      'Secuencias multi-paso con IA',
      'AI Assistant incluido',
      'A/B Testing de mensajes',
      'API access',
      'Soporte prioritario',
    ],
  },
  {
    key: 'agency',
    name: 'Scale',
    tagline: 'Para agencias y equipos grandes',
    monthlyPrice: 199,
    annualTotal: 1990,
    popular: false,
    accentColor: 'purple',
    features: [
      'Leads ilimitados',
      'Todo lo del plan Growth',
      'Multi-cuenta LinkedIn',
      'Dashboard de agencia',
      'Whitelabel disponible',
      'Gestor de cuenta dedicado',
      'SLA 99,9% uptime',
      'Onboarding personalizado',
    ],
  },
]

// ─── Navbar shared ────────────────────────────────────────────────────────────

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
          <Link to="/pricing" className="text-sm text-white font-medium transition-colors">Precios</Link>
          <Link to="/afiliados" className="text-sm text-slate-400 hover:text-white transition-colors">Afiliados</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Iniciar Sesión</Link>
          <Button asChild className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 text-sm h-9 px-4">
            <Link to="/register">Registrarse</Link>
          </Button>
        </div>
      </div>
    </nav>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingPeriod>('monthly')
  const [loading, setLoading] = useState<PlanKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async (plan: typeof PLANS[0]) => {
    const priceId = STRIPE_PRICES[plan.key][billing]

    if (!priceId) {
      setError(
        `El plan ${plan.name} (${billing === 'monthly' ? 'mensual' : 'anual'}) ` +
        `no está configurado aún. Contacta con soporte.`,
      )
      return
    }

    setLoading(plan.key)
    setError(null)

    try {
      const url = await PaymentsService.createCheckoutSession(
        priceId,
        plan.key,
        billing,
        localStorage.getItem('eficacia_user_id') ?? undefined,
      )
      window.location.href = url
    } catch (err: any) {
      setError(err.message || 'Error procesando el pago. Inténtalo de nuevo.')
      setLoading(null)
    }
  }

  const annualMonthlyEquivalent = (plan: typeof PLANS[0]) =>
    Math.round(plan.annualTotal / 12)
  const annualSavings = (plan: typeof PLANS[0]) =>
    plan.monthlyPrice * 12 - plan.annualTotal

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Navbar />

      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-800/50 text-slate-400 text-xs font-medium uppercase tracking-wider mb-6">
            <Zap className="w-3 h-3" /> Precios
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
              Planes de EficacIA
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Comienza con{' '}
            <span className="text-indigo-400 font-semibold">7 días de prueba gratis</span>.
            {' '}No se cobra nada hasta que termine el trial.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                billing === 'monthly'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`relative px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                billing === 'annual'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Anual
              <span className="ml-2 inline-block px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded uppercase tracking-wide">
                -17%
              </span>
            </button>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex justify-center gap-8 mb-10 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            <span>Pago seguro con Stripe</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Cancela cuando quieras</span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            <span>+500 equipos confían en nosotros</span>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-8 max-w-4xl mx-auto p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-center text-sm">
            {error}
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isLoading = loading === plan.key
            const displayPrice =
              billing === 'monthly'
                ? plan.monthlyPrice
                : annualMonthlyEquivalent(plan)

            return (
              <Card
                key={plan.key}
                className={`relative flex flex-col p-8 transition-all duration-300 border ${
                  plan.popular
                    ? 'ring-2 ring-violet-500/60 bg-slate-800/80 border-violet-500/30 shadow-2xl shadow-violet-500/10'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-full whitespace-nowrap shadow-lg shadow-indigo-500/30">
                    {plan.badge}
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-4">{plan.tagline}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">€{displayPrice}</span>
                    <span className="text-slate-400 text-sm">/mes</span>
                  </div>
                  {billing === 'annual' ? (
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs text-slate-500 line-through">
                        €{plan.monthlyPrice}/mes sin descuento
                      </p>
                      <p className="text-xs text-emerald-400 font-medium">
                        Facturado €{plan.annualTotal}/año — ahorra €{annualSavings(plan)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-indigo-400 mt-2">
                      7 días gratis — luego €{plan.monthlyPrice}/mes
                    </p>
                  )}
                </div>

                {/* Divider */}
                <div className={`h-px mb-6 ${plan.popular ? 'bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-transparent' : 'bg-slate-800'}`} />

                {/* Features */}
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${plan.popular ? 'bg-violet-500/20' : 'bg-indigo-500/10'}`}>
                        <Check className={`w-3 h-3 ${plan.popular ? 'text-violet-400' : 'text-indigo-400'}`} />
                      </div>
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  onClick={() => handleCheckout(plan)}
                  disabled={loading !== null}
                  className={`w-full h-12 text-base font-semibold transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-indigo-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Redirigiendo…
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Empezar 7 días gratis
                    </>
                  )}
                </Button>
              </Card>
            )
          })}
        </div>

        {/* Promo code */}
        <div className="mt-16 max-w-3xl mx-auto p-8 rounded-2xl bg-gradient-to-br from-indigo-950/40 to-violet-950/40 border border-indigo-500/20">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center mb-4">
            <Zap className="w-5 h-5 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">¿Tienes un código de prueba?</h3>
          <p className="text-slate-400 mb-6 text-sm">
            Si tienes un código promocional puedes registrarte completamente gratis sin ingresar tarjeta de crédito.
          </p>
          <Link to="/register">
            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0">
              Registrarse con Código Gratis
            </Button>
          </Link>
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Preguntas Frecuentes</h2>
          <div className="space-y-4">
            {[
              {
                q: '¿Se cobra algo durante el trial?',
                a: 'No. Durante los 7 días de prueba no se realiza ningún cobro. Tu tarjeta solo se verifica para confirmar que es válida. Si cancelas antes de que termine el trial, no te cobramos nada.',
              },
              {
                q: '¿Puedo cambiar de plan?',
                a: 'Sí, puedes cambiar o cancelar tu suscripción en cualquier momento desde tu panel de control. Los cambios se aplican al siguiente ciclo de facturación.',
              },
              {
                q: '¿Es seguro para mi cuenta de LinkedIn?',
                a: 'Sí. Nuestro sistema simula comportamiento humano con delays aleatorios, límites diarios conservadores y rotación de IPs. Nunca hemos tenido una cuenta baneada por usar EficacIA correctamente.',
              },
              {
                q: '¿Hay descuento para agencias?',
                a: 'Sí, contáctanos directamente para planes de agencia con multi-seat y descuentos por volumen. También ofrecemos whitelabel.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                <h3 className="font-semibold text-white mb-2">{q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="text-center mt-12">
          <p className="text-slate-500 text-sm">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
