/**
 * Payments Service — handles all payment-related API calls.
 */

const API_URL = import.meta.env.VITE_API_URL ?? ''

// ─── Price ID map ──────────────────────────────────────────────────────────────
// Add Stripe Price IDs (price_xxx) to your .env file under these keys.
// Price IDs are NOT secret — they are safe to expose in frontend bundles.
export const STRIPE_PRICES = {
  pro: {
    monthly: import.meta.env.VITE_STRIPE_PRO_MONTHLY ?? '',
    annual:  import.meta.env.VITE_STRIPE_PRO_ANNUAL  ?? '',
  },
  growth: {
    monthly: import.meta.env.VITE_STRIPE_GROWTH_MONTHLY ?? '',
    annual:  import.meta.env.VITE_STRIPE_GROWTH_ANNUAL  ?? '',
  },
  agency: {
    monthly: import.meta.env.VITE_STRIPE_AGENCY_MONTHLY ?? '',
    annual:  import.meta.env.VITE_STRIPE_AGENCY_ANNUAL  ?? '',
  },
} as const

export type PlanKey = keyof typeof STRIPE_PRICES
export type BillingPeriod = 'monthly' | 'annual'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  features: string[]
}

class PaymentsService {
  /**
   * Initiates Stripe Checkout for a subscription.
   *
   * @param priceId  Stripe Price ID (price_xxx) for the selected plan + billing period.
   * @param plan     Plan slug ('pro' | 'growth' | 'agency') — stored in session metadata.
   * @param billing  Billing period — stored in session metadata.
   * @param userId   Optional Supabase user ID — stored in session metadata so the
   *                 webhook can adjudicate the subscription without an extra lookup.
   * @returns        Stripe Hosted Checkout redirect URL.
   */
  static async createCheckoutSession(
    priceId: string,
    plan: string,
    billing: BillingPeriod,
    userId?: string,
  ): Promise<string> {
    const body: Record<string, string> = { priceId, plan, billing }
    if (userId) body.userId = userId

    const res = await fetch(`${API_URL}/api/payments/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Error al crear sesión de pago')
    }

    const { url } = await res.json()
    if (!url) throw new Error('No se recibió URL de checkout')
    return url
  }

  /** @deprecated Use createCheckoutSession instead */
  static async getPlans(): Promise<Plan[]> {
    const res = await fetch(`${API_URL}/api/payments/plans`)
    if (!res.ok) throw new Error('Error fetching plans')
    return res.json()
  }

  /** @deprecated Use createCheckoutSession instead */
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

  /** @deprecated Use createCheckoutSession instead */
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

  static async getSubscription() {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('No autenticado')

    const res = await fetch(`${API_URL}/api/payments/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) throw new Error('Error obteniendo suscripción')
    return res.json()
  }
}

export default PaymentsService
