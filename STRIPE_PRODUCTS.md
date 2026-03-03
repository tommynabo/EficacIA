# 🎯 Stripe Products & Prices Created

**Created: 2025-03-03**

## Products

### Starter Plan
- **Product ID:** `prod_U56GC8m0oCm6Gx`
- **Price ID:** `price_1T6w3Y2dSOGFvDre1P8c2t4L`
- **Amount:** €49.99/month
- **Billing:** Monthly recurring
- **Features:**
  - Hasta 500 leads/mes
  - Búsqueda en LinkedIn
  - 1 campaña activa
  - Soporte por email

### Pro Plan
- **Product ID:** `prod_U56G6iE840iR7w`
- **Price ID:** `price_1T6w3Z2dSOGFvDrePckW6jYJ`
- **Amount:** €84.99/month
- **Billing:** Monthly recurring
- **Features:**
  - Leads ilimitados
  - Automatización completa
  - Campañas ilimitadas
  - API access
  - Soporte prioritario

---

## Backend Configuration

The payment route configuration uses these IDs:

```typescript
const PLANS = {
  starter: {
    name: 'Starter',
    priceId: 'price_1T6w3Y2dSOGFvDre1P8c2t4L',
    price: 4999,            // €49.99 in cents
    currency: 'eur',
    features: [...],
    trial_days: 7,
  },
  pro: {
    name: 'Pro',
    priceId: 'price_1T6w3Z2dSOGFvDrePckW6jYJ',
    price: 8499,            // €84.99 in cents
    currency: 'eur',
    features: [...],
    trial_days: 7,
  },
}
```

---

## Webhook Configuration

**Endpoint URL:** `https://eficacia-ia.vercel.app/api/webhooks/stripe`
**Webhook Secret:** `whsec_lkaGLlEjrLLRoHIUb7phKD008Qo2kTAa`

Events enabled:
- ✅ payment_intent.succeeded
- ✅ customer.subscription.updated
- ✅ customer.subscription.deleted
- ✅ charge.failed
- ✅ invoice.payment_succeeded
- ✅ customer.subscription.trial_will_end

---

## Testing

### Test Payment Flow

1. Go to: `http://localhost:5173/pricing`
2. Login with test account
3. Select "Starter" or "Pro" plan
4. Click "7 Días Gratis"
5. Subscription created with 7-day trial

### Test Card Details

Use these for testing:

| Scenario | Card | CVC | Date |
|----------|------|-----|------|
| Success | 4242 4242 4242 4242 | 123 | 12/25 |
| Decline | 4000 0000 0000 0002 | 123 | 12/25 |
| Auth Required | 4000 0025 0000 3155 | 123 | 12/25 |

### Webhook Testing (Local)

```bash
# Terminal 1: Start listening for webhook events
stripe listen --forward-to http://localhost:3001/api/webhooks/stripe

# Terminal 2: Trigger test events
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.created
stripe trigger customer.subscription.deleted
```

---

## Production Checklist

- [x] Create Stripe products
- [x] Create pricing tiers
- [x] Configure webhook secret in `.env`
- [x] Update Vercel environment variables
- [ ] Test webhook on production
- [ ] Test payment flow end-to-end
- [ ] Monitor Stripe dashboard for failed charges

---

## References

- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Webhooks: https://dashboard.stripe.com/webhooks
- Stripe API Keys: https://dashboard.stripe.com/apikeys
- Product Details: https://dashboard.stripe.com/products

---

## Troubleshooting

**Webhook not receiving events:**
- Verify webhook secret in Vercel env vars
- Check endpoint URL is accessible
- Review Stripe Dashboard > Webhooks > Recent Attempts

**Subscription creation fails:**
- Ensure user exists in Supabase
- Check valid plan ID (starter or pro only)
- Verify STRIPE_SECRET_KEY in .env

**Trial not applied:**
- Confirm `trial_period_days: 7` in subscription creation
- Check `trial_ends_at` is set in user record
- Verify webhook processes subscription.created event
