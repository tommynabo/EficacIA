import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import { Check, CreditCard, Shield, Zap } from 'lucide-react'

/**
 * Planes hardcoded — evita llamadas al backend que fallan en Vercel
 */
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 4999,
    currency: 'eur',
    features: [
      'Hasta 500 leads/mes',
      'Búsqueda en LinkedIn',
      '1 campaña activa',
      'Soporte por email',
    ],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 8499,
    currency: 'eur',
    features: [
      'Leads ilimitados',
      'Automatización completa',
      'Campañas ilimitadas',
      'API access',
      'Soporte prioritario',
    ],
    popular: true,
  },
]

const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function PricingPage() {
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Inicia el flujo de Stripe Checkout
   * 1. Llama al backend para crear una Checkout Session
   * 2. Redirige al usuario a Stripe para ingresar tarjeta
   * 3. Stripe cobra €0 (trial 7 días) y redirige a /register
   */
  const handleStartTrial = async (planId: string) => {
    setSelectedPlan(planId)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear sesión de pago')
      }

      const { url } = await res.json()

      if (url) {
        // Redirige a Stripe Checkout
        window.location.href = url
      } else {
        throw new Error('No se recibió URL de checkout')
      }
    } catch (err: any) {
      console.error('Checkout error:', err)
      setError(err.message || 'Error procesando el pago. Inténtalo de nuevo.')
    } finally {
      setSelectedPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Planes de EficacIA
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Comienza con <span className="text-blue-400 font-semibold">7 días de prueba gratis</span>.
            Introduce tu tarjeta para empezar — no se cobra nada hasta que termine el trial.
          </p>
        </div>

        {/* Trust badges */}
        <div className="flex justify-center gap-8 mb-12 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            <span>Pago seguro con Stripe</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Cancela cuando quieras</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 max-w-4xl mx-auto p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col p-8 transition-all duration-200
                ${plan.popular
                  ? 'ring-2 ring-blue-500 bg-slate-800 shadow-xl shadow-blue-500/10'
                  : 'bg-slate-900 hover:ring-1 hover:ring-slate-700'
                }`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full">
                  MÁS POPULAR
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">
                    €{(plan.price / 100).toFixed(2)}
                  </span>
                  <span className="text-slate-400">/mes</span>
                </div>
                <p className="text-sm text-blue-400 mt-2">
                  7 días gratis — luego €{(plan.price / 100).toFixed(2)}/mes
                </p>
              </div>

              {/* Features */}
              <div className="flex-1 mb-6">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA Button */}
              <Button
                onClick={() => handleStartTrial(plan.id)}
                disabled={selectedPlan === plan.id}
                className="w-full h-12 text-base font-semibold"
                variant={plan.popular ? 'default' : 'outline'}
              >
                {selectedPlan === plan.id ? (
                  'Redirigiendo a Stripe...'
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Empezar 7 Días Gratis
                  </>
                )}
              </Button>
            </Card>
          ))}
        </div>

        {/* Already have account */}
        <div className="text-center mt-8">
          <p className="text-slate-500">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
              Inicia sesión
            </Link>
          </p>
        </div>

        {/* Promo Code Section */}
        <div className="mt-12 max-w-3xl mx-auto p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <Zap className="w-6 h-6 text-blue-400 mb-3" />
          <h3 className="text-xl font-bold text-white mb-3">¿Tienes un código de prueba?</h3>
          <p className="text-slate-400 mb-4">
            Si tienes un código promocional para una prueba gratuita, puedes registrarte completamente gratis sin ingresar una tarjeta.
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
              <p className="text-slate-400">
                No, durante los 7 días de prueba no se realiza ningún cobro. Tu tarjeta solo se verificará para confirmar que es válida.
                Si cancelas antes de que termine el trial, no se te cobrará nada.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">¿Puedo cambiar de plan?</h3>
              <p className="text-slate-400">
                Sí, puedes cambiar o cancelar tu suscripción en cualquier momento desde tu panel de control.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">¿Es seguro pagar con Stripe?</h3>
              <p className="text-slate-400">
                Sí, usamos Stripe que es el procesador de pagos más confiable del mundo. Tus datos están protegidos con encriptación de nivel bancario.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
