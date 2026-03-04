import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import { Check, AlertCircle } from 'lucide-react'
import { useAuth } from '@/src/contexts/AuthContext'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  features: string[]
}

export default function PricingPage() {
  const { user } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch(`${API_URL}/api/payments/plans`)
        const data = await res.json()
        setPlans(data)

        if (user) {
          const token = localStorage.getItem('auth_token')
          const subRes = await fetch(`${API_URL}/api/payments/subscription`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const subData = await subRes.json()
          setCurrentPlan(subData.subscription_plan || 'free')
        }
      } catch (error) {
        console.error('Error fetching plans:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPlans()
  }, [user])

  const handleSelectPlan = async (planId: string) => {
    if (planId === currentPlan || planId === 'free') {
      return // Already subscribed or free
    }

    setSelectedPlan(planId)

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('No autenticado')
      }

      // Crea la suscripción directamente
      const res = await fetch(`${API_URL}/api/payments/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error en la suscripción')
      }

      const data = await res.json()
      console.log('Subscription created:', data)

      // Refresca la página para actualizar el estado
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error: any) {
      console.error('Error creating subscription:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSelectedPlan(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20">Cargando planes...</div>
  }

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Planes de EficacIA</h1>
          <p className="text-xl text-slate-400">
            Comienza con 7 días gratis en cualquier plan. Sin tarjeta requerida.
          </p>
        </div>

        {/* Current Plan Badge */}
        {user && currentPlan && currentPlan !== 'free' && (
          <div className="mb-8 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <span className="text-blue-300">
              Actualmente en plan: <strong className="capitalize">{currentPlan}</strong>
            </span>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id
            const isFree = plan.id === 'free'

            return (
              <Card
                key={plan.id}
                className={`flex flex-col p-8 ${
                  isCurrentPlan ? 'ring-2 ring-blue-500' : ''
                } ${isFree ? 'bg-slate-900' : 'bg-slate-800'}`}
              >
                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">
                      €{(plan.price / 100).toFixed(2)}
                    </span>
                    <span className="text-slate-400">/mes</span>
                  </div>
                  {isCurrentPlan && (
                    <p className="text-sm text-blue-400 mt-2 font-medium">✓ Plan Actual</p>
                  )}
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
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isCurrentPlan || selectedPlan === plan.id}
                  className="w-full"
                  variant={isCurrentPlan ? 'outline' : 'default'}
                >
                  {isCurrentPlan ? 'Plan Actual' : selectedPlan === plan.id ? 'Procesando...' : '7 Días Gratis'}
                </Button>
              </Card>
            )
          })}
        </div>

        {/* FAQ / Info */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Preguntas Frecuentes</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-white mb-2">¿Puedo cambiar de plan?</h3>
              <p className="text-slate-400">
                Sí, puedes cambiar u cancelar tu suscripción en cualquier momento desde tu panel de control.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">¿Qué pasa después del período de prueba?</h3>
              <p className="text-slate-400">
                Se te cobrará automáticamente el monto mensual después de 7 días. Puedes cancelar antes de que se finalice el período de prueba.
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
