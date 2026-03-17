import React, { useState, useEffect } from 'react'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Card } from '@/src/components/ui/card'
import { AlertCircle, X } from 'lucide-react'

interface CheckoutProps {
  plan: string
  onClose: () => void
  onSuccess: () => void
}

export function PaymentCheckout({ plan, onClose, onSuccess }: CheckoutProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [cardElement, setCardElement] = useState<any>(null)
  const [stripe, setStripe] = useState<any>(null)
  const API_URL = import.meta.env.VITE_API_URL ?? ''

  // Carga Stripe
  useEffect(() => {
    const loadStripe = async () => {
      try {
        // Obtiene el publishable key del backend
        const res = await fetch(`${API_URL}/api/payments/create-payment-intent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({ plan }),
        })

        const data = await res.json()

        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
        }

        // En producción, cargarías Stripe aquí:
        // const stripeJs = await loadStripe(data.publishableKey)
      } catch (error) {
        setError('Error cargando información de pago')
        console.error(error)
      }
    }

    loadStripe()
  }, [plan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // En una implementación real, confirmarías el pago con stripe.confirmCardPayment()
      // Por ahora, simulamos un pago exitoso para desarrollo

      // Espera 2 segundos para simular procesamiento
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Marca como exitoso
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Error procesando pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800">
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">Completar Pago</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Plan Info */}
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <p className="text-sm text-slate-400">Plan Seleccionado</p>
            <p className="text-lg font-semibold text-white capitalize">{plan}</p>
          </div>

          {/* Card Info (Simulado) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Número de Tarjeta
            </label>
            <Input
              type="text"
              placeholder="4242 4242 4242 4242"
              disabled
              className="bg-slate-800 border-slate-700 cursor-not-allowed opacity-50"
            />
            <p className="text-xs text-slate-400 mt-2">
              Integración con Stripe.js en producción
            </p>
          </div>

          {/* Info Message */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>Nota:</strong> Esta es una interfaz de demostración. En producción, la información de la tarjeta será procesada de forma segura por Stripe.
            </p>
          </div>

          {/* Submit Button */}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Procesando...' : `Pagar (7 días gratis)`}
          </Button>

          <p className="text-xs text-center text-slate-400">
            Se te cobrarán después de 7 días. Puedes cancelar en cualquier momento.
          </p>
        </form>
      </Card>
    </div>
  )
}
