import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CreditCard, Shield, Zap, Loader2 } from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import PaymentsService, { STRIPE_PRICES, PlanKey, BillingPeriod } from '@/src/services/payments'

// ─── Plan definitions ──────────────────────────────────────────────────────────

const PLANS: Array<{
  key: PlanKey
  name: string
  monthlyPrice: number  // €/mes facturado mensualmente
  annualTotal: number   // €/año facturado anualmente (total)
  popular: boolean
  badge?: string
  features: string[]
}> = [
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 42,
    annualTotal: 420,
    popular: false,
    features: [
      'Hasta 2.000 leads/mes',
      'LinkedIn Sales Navigator',
      'Apollo.io integrado',
      '3 campañas activas',
      'Soporte por email',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    monthlyPrice: 79,
    annualTotal: 790,
    popular: true,
    badge: 'MÁS POPULAR',
    features: [
      'Hasta 10.000 leads/mes',
      'Todo lo del plan Pro',
      'Campañas ilimitadas',
      'API access',
      'Automatizaciones avanzadas',
      'Soporte prioritario',
    ],
  },
  {
    key: 'agency',
    name: 'Agency',
    monthlyPrice: 199,
    annualTotal: 1990,
    popular: false,
    features: [
      'Leads ilimitados',
      'Todo lo del plan Growth',
      'Multi-cuenta LinkedIn',
      'Gestor de cuenta dedicado',
      'SLA 99,9 % uptime',
      'Onboarding personalizado',
    ],
  },
]

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
        // Pass userId if the user is already authenticated (upgrade flow).
        // For new-user flows this will be undefined — the webhook handles that via email.
        localStorage.getItem('eficacia_user_id') ?? undefined,
      )
      window.location.href = url
    } catch (err: any) {
      setError(err.message || 'Error procesando el pago. Inténtalo de nuevo.')
      setLoading(null)
    }
  }

  // Annual: price per month equivalent and savings
  const annualMonthlyEquivalent = (plan: typeof PLANS[0]) =>
    Math.round(plan.annualTotal / 12)
  const annualSavings = (plan: typeof PLANS[0]) =>
    plan.monthlyPrice * 12 - plan.annualTotal

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Planes de EficacIA</h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Comienza con{' '}
            <span className="text-blue-400 font-semibold">7 días de prueba gratis</span>.
            {' '}No se cobra nada hasta que termine el trial.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === 'monthly'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === 'annual'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Anual
              <span className="ml-2 inline-block px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded uppercase tracking-wide">
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
                className={`relative flex flex-col p-8 transition-all duration-200 ${
                  plan.popular
                    ? 'ring-2 ring-blue-500 bg-slate-800 shadow-xl shadow-blue-500/10'
                    : 'bg-slate-900 hover:ring-1 hover:ring-slate-700'
                }`}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-3">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">€{displayPrice}</span>
                    <span className="text-slate-400">/mes</span>
                  </div>

                  {billing === 'annual' ? (
                    <div className="mt-2 space-y-0.5">
                      <p className="text-sm text-slate-500 line-through">
                        €{plan.monthlyPrice}/mes sin descuento
                      </p>
                      <p className="text-sm text-green-400 font-medium">
                        Facturado €{plan.annualTotal}/año — ahorra €{annualSavings(plan)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-blue-400 mt-2">
                      7 días gratis — luego €{plan.monthlyPrice}/mes
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  onClick={() => handleCheckout(plan)}
                  disabled={loading !== null}
                  className="w-full h-12 text-base font-semibold"
                  variant={plan.popular ? 'default' : 'outline'}
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

        {/* Already have account */}
        <div className="text-center mt-8">
          <p className="text-slate-500 text-sm">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
              Inicia sesión
            </Link>
          </p>
        </div>

        {/* Promo code */}
        <div className="mt-12 max-w-3xl mx-auto p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <Zap className="w-6 h-6 text-blue-400 mb-3" />
          <h3 className="text-xl font-bold text-white mb-3">¿Tienes un código de prueba?</h3>
          <p className="text-slate-400 mb-4">
            Si tienes un código promocional puedes registrarte completamente gratis sin ingresar tarjeta.
          </p>
          <Link to="/register">
            <Button className="w-full sm:w-auto" variant="default">
              Registrarse con Código Gratis
            </Button>
          </Link>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Preguntas Frecuentes</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-white mb-2">¿Se cobra algo durante el trial?</h3>
              <p className="text-slate-400 text-sm">
                No, durante los 7 días de prueba no se realiza ningún cobro. Tu tarjeta solo se
                verifica para confirmar que es válida. Si cancelas antes de que termine el trial,
                no se te cobrará nada.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">¿Puedo cambiar de plan?</h3>
              <p className="text-slate-400 text-sm">
                Sí, puedes cambiar o cancelar tu suscripción en cualquier momento desde tu panel
                de control.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">¿Qué pasa con el plan anual si cancelo?</h3>
              <p className="text-slate-400 text-sm">
                El acceso se mantiene activo hasta que finalice el período abonado. No se realizan
                reembolsos prorrateados, pero nunca se cobra de más.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">¿Es seguro pagar con Stripe?</h3>
              <p className="text-slate-400 text-sm">
                Sí, usamos Stripe — el procesador de pagos más confiable del mundo. Tus datos están
                protegidos con encriptación de nivel bancario y nunca almacenamos datos de tarjeta.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
