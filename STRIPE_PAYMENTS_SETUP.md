# 🔐 Stripe Payments Setup - EficacIA

## Overview
Sistema de pagos integrado con Stripe para manejar:
- Suscripciones de 7 días gratis
- Payment Intents con trial period
- Webhooks para actualizaciones de estado
- Planes: Starter ($29.99), Pro ($79.99), Enterprise ($299.99)

---

## 1. Backend API Endpoints

### `POST /api/payments/create-payment-intent`
Crea un PaymentIntent para checkout

**Request:**
```bash
curl -X POST http://localhost:3001/api/payments/create-payment-intent \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"plan": "pro"}'
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "publishableKey": "pk_live_xxx"
}
```

### `POST /api/payments/create-subscription`
Crea una suscripción con trial period

**Request:**
```bash
curl -X POST http://localhost:3001/api/payments/create-subscription \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"plan": "pro", "paymentMethodId": "pm_xxx"}'
```

### `GET /api/payments/plans`
Obtiene todos los planes disponibles

```bash
curl http://localhost:3001/api/payments/plans
```

**Response:**
```json
[
  {
    "id": "starter",
    "name": "Starter",
    "price": 2999,
    "currency": "usd",
    "features": [...]
  },
  ...
]
```

### `GET /api/payments/subscription`
Obtiene la suscripción actual del usuario

**Request:**
```bash
curl http://localhost:3001/api/payments/subscription \
  -H "Authorization: Bearer {token}"
```

### `POST /api/webhooks/stripe`
Webhook para procesar eventos de Stripe

**Eventos procesados:**
- `payment_intent.succeeded` - Pago completado
- `customer.subscription.updated` - Suscripción actualizada
- `customer.subscription.deleted` - Suscripción cancelada
- `charge.failed` - Pago fallido

---

## 2. Setup en Stripe Dashboard

### Paso 1: Obtener API Keys

1. Ve a https://dashboard.stripe.com/apikeys
2. Copia:
   - **Secret Key**: `sk_live_...` (ya tiene en .env)
   - **Publishable Key**: `pk_live_...` (ya tiene en .env)

### Paso 2: Crear Webhook para Desarrollo (Local)

1. Instala `stripe-cli`:
   ```bash
   brew install stripe/stripe-cli/stripe  # macOS
   ```

2. Autentica Stripe CLI:
   ```bash
   stripe login
   ```

3. Reenvía eventos locales:
   ```bash
   stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
   ```

4. El CLI mostrará un token, guárdalo para después

### Paso 3: Test Webhook Localmente

```bash
# En otra terminal, mientras stripe listen está activo:
stripe trigger payment_intent.succeeded
```

---

## 3. Setup en Vercel (Producción)

### Paso 1: Deploy a Vercel

```bash
git push  # Vercel auto-despliega
```

Obtén tu URL (ej: `https://eficacia-xyz.vercel.app`)

### Paso 2: Configurar Webhook en Stripe

1. Ve a https://dashboard.stripe.com/webhooks
2. **Add endpoint**
3. URL: `https://tu-url-vercel.vercel.app/api/webhooks/stripe`
4. Events to send:
   - ✓ `payment_intent.succeeded`
   - ✓ `customer.subscription.updated`
   - ✓ `customer.subscription.deleted`
   - ✓ `charge.failed`
5. Creates → `whsec_xxx`

### Paso 3: Agregar Webhook Secret a Vercel

1. Ve a https://vercel.com/dashboard/projects/eficacia
2. Settings → Environment Variables
3. Agrega:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```
4. Redeploy

---

## 4. Frontend - Usar los Componentes

### Precio Page (Público)

```tsx
import PricingPage from './pages/pricing'

<Route path="/pricing" element={<PricingPage />} />
```

Usuarios pueden:
- Ver todos los planes
- Ver su plan actual
- Cambiar de plan

### Payment Checkout

```tsx
import { PaymentCheckout } from '@/src/components/payment-checkout'

<PaymentCheckout 
  plan="pro" 
  onClose={() => setShowCheckout(false)}
  onSuccess={() => {
    // Refresca subscription
    window.location.reload()
  }}
/>
```

### Check Current Subscription

```tsx
import PaymentsService from '@/src/services/payments'

const subscription = await PaymentsService.getSubscription()
console.log(subscription.subscription_plan)  // 'starter', 'pro', etc.
console.log(subscription.trial_ends_at)      // '2025-03-10T...'
```

---

## 5. Testing Checklist

### Local (Development)

- [ ] Crear payment intent: `POST /api/payments/create-payment-intent`
- [ ] Ver planes: `GET /api/payments/plans`
- [ ] Ver subscription: `GET /api/payments/subscription`  
- [ ] Stripe CLI webhook escucha eventos: `stripe listen`
- [ ] Test evento: `stripe trigger payment_intent.succeeded`
- [ ] Usuario se actualiza en Supabase (check DB)

### Producción (Vercel)

- [ ] URL de Vercel desplegada
- [ ] Webhook configurado en Stripe Dashboard
- [ ] STRIPE_WEBHOOK_SECRET en Vercel env vars
- [ ] Test payment real (tarjeta 4242... de prueba)
- [ ] Check que webhook se ejecutó
- [ ] Usuario en Supabase actualizado con subscription_plan

---

## 6. Test Cards

Use estas tarjetas para testing en Stripe:

| Escenario | Tarjeta |
|-----------|---------|
| Success | `4242 4242 4242 4242` |
| Decline | `4000 0000 0000 0002` |
| Auth Required | `4000 0025 0000 3155` |
| Expired | `4000 0000 0000 0069` |

CVC: Cualquiera (ej: 123)
Fecha: Futuro (ej: 12/25)

---

## 7. Billing Update

Cuando el usuario paga, Supabase se actualiza automáticamente:

```sql
UPDATE users SET
  subscription_plan = 'pro',
  subscription_status = 'active',
  trial_ends_at = NOW() + INTERVAL '7 days'
WHERE id = '{user_id}'
```

Verifica en Supabase > SQL Editor:

```sql
SELECT * FROM users WHERE id = 'tu-id';
```

Expected output:
```
id: uuid
email: user@example.com
subscription_plan: pro
subscription_status: active
trial_ends_at: 2025-03-10 12:00:00+00
stripe_customer_id: cus_xxxxx
created_at: 2025-03-03...
```

---

## 8. Troubleshooting

### Webhook no se ejecuta

- [ ] Verifica STRIPE_WEBHOOK_SECRET en Vercel
- [ ] Revisa logs en Vercel (Deployments → Logs)
- [ ] Endpoint URL correcta en Stripe Dashboard
- [ ] Eventos seleccionados en webhook

### Payment Intent falla

- [ ] Verifica STRIPE_SECRET_KEY en .env
- [ ] Token JWT válido (`Authorization: Bearer {token}`)
- [ ] Usuario existe en Supabase
- [ ] Plan válido existe

### Usuario no se actualiza

- [ ] Check Supabase logs
- [ ] Webhook received (check Stripe Dashboard > Events)
- [ ] UserId en metadata correcto
- [ ] RLS policies en Supabase (si aplicable)

---

## 9. Próximas Mejoras

- [ ] Actualizar card en file para cuenta
- [ ] Invoices históricos
- [ ] Descuentos y cupones
- [ ] Facturación automática
- [ ] Portal de Stripe para customers (billing, cancel, etc.)

---

## Referencias

- [Stripe Docs](https://stripe.com/docs)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Payment Intents](https://stripe.com/docs/payments/payment-intents)
- [Subscriptions](https://stripe.com/docs/billing/subscriptions/overview)
