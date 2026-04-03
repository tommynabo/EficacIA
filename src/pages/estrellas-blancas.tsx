import React, { useState } from 'react'
import { Check, CreditCard, Shield, Star, Zap } from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'

// ─── Oferta Especial Estrellas Blancas ────────────────────────────────────────
// Página OCULTA — accesible sólo mediante link directo.
// No está enlazada en ningún menú de navegación ni footer.
// Mismas condiciones que el plan GROWTH, precio especial: 42€/mes o 420€/año.

type BillingPeriod = 'monthly' | 'annual'

const ESTRELLAS_FEATURES = [
  'Leads ilimitados',
  '3 cuentas de LinkedIn',
  'Campañas ilimitadas',
  'Secuencias multi-paso con IA',
  '10.000 créditos IA',
  'AI Assistant incluido',
  'A/B Testing de mensajes',
  'API access',
  'Soporte prioritario',
]

export default function EstrellasBlancasPage() {
  const [billing, setBilling] = useState<BillingPeriod>('monthly')

  const price = billing === 'monthly' ? 42 : 420
  const period = billing === 'monthly' ? '/mes' : '/año'
  const monthlyEquivalent = billing === 'annual' ? Math.round(420 / 12) : null

  const handleCheckout = () => {
    // Stripe Payment Links — incluyen subscription_data.metadata.plan para el webhook
    if (billing === 'monthly') {
      window.location.href = 'https://buy.stripe.com/5kQ6oGfKwf8jbSh4jYgQE01' // Mensual 42€
    } else {
      window.location.href = 'https://buy.stripe.com/8x2aEWbug6BNg8x03IgQE00' // Anual 420€
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col items-center justify-center px-4 py-20">

      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-700/50 bg-amber-900/30 text-amber-300 text-xs font-medium uppercase tracking-wider mb-6">
            <Star className="w-3 h-3 fill-amber-300" /> Oferta Especial
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-amber-200 to-amber-500">
              Estrellas Blancas
            </span>
          </h1>
          <p className="text-slate-400 text-base max-w-sm mx-auto">
            Acceso exclusivo reservado para miembros seleccionados. Todas las funcionalidades Growth a un precio especial.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === 'monthly'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === 'annual'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow'
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

        {/* Pricing card */}
        <Card className="relative flex flex-col p-8 border ring-2 ring-amber-500/50 bg-slate-800/80 border-amber-500/30 shadow-2xl shadow-amber-500/10">

          {/* Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full whitespace-nowrap shadow-lg shadow-amber-500/30">
            ⭐ ESPECIAL ESTRELLAS BLANCAS
          </div>

          {/* Plan header */}
          <div className="mb-6 pt-2">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              <h2 className="text-2xl font-bold text-white">Especial Estrellas Blancas</h2>
            </div>
            <p className="text-slate-400 text-sm mb-5">Acceso completo Growth — precio exclusivo para ti</p>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-white">€{price}</span>
              <span className="text-slate-400 text-sm">{period}</span>
            </div>
            {monthlyEquivalent && (
              <p className="text-xs text-amber-400 mt-2">
                Equivale a €{monthlyEquivalent}/mes — ahorras €{42 * 12 - 420} al año
              </p>
            )}
            {billing === 'monthly' && (
              <p className="text-xs text-amber-400 mt-2">
                3 días gratis — luego €42/mes
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="h-px mb-6 bg-gradient-to-r from-amber-500/30 via-orange-500/30 to-transparent" />

          {/* Features */}
          <ul className="space-y-3 mb-8 flex-1">
            {ESTRELLAS_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-amber-400" />
                </div>
                <span className="text-sm text-slate-300">{feature}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Button
            onClick={handleCheckout}
            className="w-full py-3 font-semibold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white border-0 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02]"
          >
            <Zap className="w-4 h-4 mr-2" />
            {billing === 'monthly' ? 'Empezar prueba gratuita' : 'Activar plan anual'}
          </Button>
        </Card>

        {/* Trust badges */}
        <div className="flex justify-center gap-6 mt-6 text-sm text-slate-500">
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-4 h-4" />
            <span>Pago seguro con Stripe</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            <span>Cancela cuando quieras</span>
          </div>
        </div>

      </div>
    </div>
  )
}
