/**
 * Payments Service - Maneja todas las llamadas a pagos
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  features: string[]
}

class PaymentsService {
  /**
   * Get all available plans
   */
  static async getPlans(): Promise<Plan[]> {
    const res = await fetch(`${API_URL}/api/payments/plans`)
    if (!res.ok) {
      throw new Error('Error fetching plans')
    }
    return res.json()
  }

  /**
   * Create payment intent
   */
  static async createPaymentIntent(plan: string) {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('No autenticado')

    const res = await fetch(`${API_URL}/api/payments/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Error creando payment intent')
    }

    return res.json()
  }

  /**
   * Create subscription with trial
   */
  static async createSubscription(plan: string, paymentMethodId: string) {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('No autenticado')

    const res = await fetch(`${API_URL}/api/payments/create-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan, paymentMethodId }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Error creando suscripción')
    }

    return res.json()
  }

  /**
   * Get current subscription
   */
  static async getSubscription() {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('No autenticado')

    const res = await fetch(`${API_URL}/api/payments/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      throw new Error('Error obteniendo suscripción')
    }

    return res.json()
  }
}

export default PaymentsService
