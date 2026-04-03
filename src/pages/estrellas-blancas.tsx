import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CreditCard, Shield, Star, Zap, Loader2 } from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'

// ─── Página oculta — accesible solo mediante link directo ─────────────────────
// No aparece en ningún menú de navegación ni footer.

type BillingPeriod = 'monthly' | 'annual'

const MONTHLY_PRICE = 42
const ANNUAL_PRICE  = 420
const ORIGINAL_MONTHLY = 79
const ORIGINAL_ANNUAL  = 790

const FEATURES = [
  'Leads ilimitados',
  '3 cuentas de LinkedIn',
  'Campañas ilimitadas',
  'Secuencias multi-paso con IA',
  '10.000 créditos IA / mes',
  'AI Assistant incluido',
  'A/B Testing de mensajes',
  'API access',
  'Soporte prioritario',
]

// REQUISITO CRÍTICO: Ambos Payment Links DEBEN tener configurado en Stripe Dashboard:
//   Product → Payment Link → Subscription data → Metadata → plan: estrellas_blancas
// Sin este metadato, el webhook anti-colisión asignará el coste de PRO (7€) en lugar
// del coste real de Estrellas Blancas (20€), afectando el Revenue Split.
const STRIPE_LINKS: Record<BillingPeriod, string> = {
  monthly: 'https://buy.stripe.com/5kQ6oGfKwf8jbSh4jYgQE01',
  annual:  'https://buy.stripe.com/8x2aEWbug6BNg8x03IgQE00',
}

// ─── Navbar ── misma que pricing.tsx ─────────────────────────────────────────

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
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
            Iniciar Sesión
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EstrellasBlancasPage() {
  const [billing, setBilling]   = useState<BillingPeriod>('monthly')
  const [loading, setLoading]   = useState(false)

  const displayPrice    = billing === 'monthly' ? MONTHLY_PRICE : ANNUAL_PRICE
  const originalPrice   = billing === 'monthly' ? ORIGINAL_MONTHLY : ORIGINAL_ANNUAL
  const monthlySavings  = ORIGINAL_MONTHLY - MONTHLY_PRICE                  // 37 €/mes
  const annualSavings   = ORIGINAL_ANNUAL  - ANNUAL_PRICE                   // 370 €/año

  const handleCheckout = () => {
    setLoading(true)
    // Redirige al Payment Link de Stripe que DEBE tener metadata.plan="estrellas_blancas"
    // configurado en Stripe Dashboard para que el webhook identifique el plan correctamente.
    window.location.href = STRIPE_LINKS[billing]
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Navbar />

      {/* Glow — mismo que pricing.tsx */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">

        {/* ── Header ── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-700/50 bg-violet-900/30 text-violet-300 text-xs font-medium uppercase tracking-wider mb-6">
            <Star className="w-3 h-3 fill-violet-300" /> Oferta Especial · Colaboración Exclusiva
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
              Estrellas Blancas
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Acceso completo al plan{' '}
            <span className="text-violet-400 font-semibold">Growth</span>
            {' '}a un precio especial, gracias a la colaboración.{' '}
            <span className="text-white font-semibold">
              Ahorra {billing === 'monthly' ? `${monthlySavings}€/mes` : `${annualSavings}€/año`}
            </span>{' '}
            respecto al precio público.
          </p>
        </div>

        {/* ── Billing toggle — idéntico a pricing.tsx ── */}
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

        {/* ── Card centrada — mismo estilo que la tarjeta popular de pricing.tsx ── */}
        <div className="flex justify-center">
          <div className="w-full max-w-sm">
            <Card className="relative flex flex-col p-8 transition-all duration-300 border ring-2 ring-violet-500/60 bg-slate-800/80 border-violet-500/30 shadow-2xl shadow-violet-500/10 hover:scale-[1.02] hover:shadow-violet-500/25">

              {/* Badge */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-full whitespace-nowrap shadow-lg shadow-indigo-500/30">
                ⭐ COLABORACIÓN ESPECIAL
              </div>

              {/* Collaboration strip — análogo a launchOffer en pricing.tsx */}
              <div className="mb-5 px-4 py-2.5 bg-gradient-to-r from-violet-950/80 to-indigo-950/80 border border-violet-500/40 rounded-xl text-center">
                <p className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-1">
                  🤝 Precio de colaboración — acceso exclusivo
                </p>
                <p className="text-xs text-violet-200/80 leading-snug">
                  Todas las funcionalidades Growth al{' '}
                  <span className="font-semibold text-violet-100">
                    {billing === 'monthly' ? '53% del precio' : '53% del precio'}
                  </span>
                  {' '}público
                </p>
              </div>

              {/* Plan header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-2xl font-bold text-white">EficacIA GROWTH</h3>
                </div>
                <p className="text-slate-400 text-sm mb-4">El preferido por los equipos — precio especial para ti</p>

                {/* Precio con tachado del precio público */}
                <div className="flex items-baseline gap-2">
                  <span className="line-through text-slate-500 text-lg">{originalPrice}€</span>
                  <span className="text-4xl font-bold text-white">€{displayPrice}</span>
                  <span className="text-slate-400 text-sm">{billing === 'annual' ? '/año' : '/mes'}</span>
                </div>

                {/* Equivalencia mensual si es anual */}
                {billing === 'annual' && (
                  <p className="text-xs text-violet-400 mt-2">
                    Equivale a €{Math.round(ANNUAL_PRICE / 12)}/mes · ahorras {annualSavings}€ al año
                  </p>
                )}
                {billing === 'monthly' && (
                  <p className="text-xs text-violet-400 mt-2">
                    3 días gratis — luego €{MONTHLY_PRICE}/mes · ahorras {monthlySavings}€/mes vs precio público
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="h-px mb-6 bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-transparent" />

              {/* Features — misma estructura que pricing.tsx */}
              <ul className="flex-1 space-y-3 mb-8">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-violet-500/20">
                      <Check className="w-3 h-3 text-violet-400" />
                    </div>
                    <span className="text-slate-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA — mismo estilo que el botón popular en pricing.tsx */}
              <Button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full h-12 text-base font-semibold transition-all whitespace-nowrap flex items-center justify-center bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-indigo-500/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Redirigiendo…
                  </>
                ) : (
                  billing === 'monthly' ? 'Empezar 3 días gratis' : 'Activar plan anual'
                )}
              </Button>
            </Card>
          </div>
        </div>

        {/* ── Comparativa de valor ── */}
        <div className="mt-14 max-w-lg mx-auto">
          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
            <p className="text-slate-400 text-sm leading-relaxed">
              El plan Growth tiene un precio público de{' '}
              <span className="line-through text-slate-500">{originalPrice}€/{billing === 'monthly' ? 'mes' : 'año'}</span>.
              {' '}Gracias a la colaboración, tú pagas{' '}
              <span className="text-violet-400 font-semibold">{displayPrice}€/{billing === 'monthly' ? 'mes' : 'año'}</span>
              {' '}— exactamente el mismo producto, las mismas condiciones, el mismo soporte.
            </p>
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="mt-14 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Preguntas Frecuentes</h2>
          <div className="space-y-4">
            {[
              {
                q: '¿Es exactamente el mismo plan que GROWTH?',
                a: 'Sí, 100%. Mismas funcionalidades, mismos límites, mismo soporte prioritario. La única diferencia es el precio, que es especial gracias a la colaboración.',
              },
              {
                q: '¿Puedo cambiar entre mensual y anual?',
                a: 'Sí. Usa el toggle de arriba para seleccionar la modalidad de pago que prefieras. El plan anual se factura en un único pago de 420€ y equivale a pagar solo 35€/mes.',
              },
              {
                q: '¿Se cobra algo durante el trial?',
                a: 'No. Durante los 3 días de prueba no se realiza ningún cobro. Tu tarjeta solo se verifica para confirmar que es válida. Si cancelas antes de que termine, no te cobramos nada.',
              },
              {
                q: '¿Puedo cancelar cuando quiera?',
                a: 'Sí, cancelas desde tu panel de control en cualquier momento. Sin permanencia, sin penalizaciones.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="p-6 rounded-xl bg-slate-900/60 border border-slate-800">
                <h3 className="font-semibold text-white mb-2">{q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer note ── */}
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
