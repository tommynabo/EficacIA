# 💳 Stripe Setup - Guía Simple

## 🚀 5 Minutos a Stripe Funcionando

### ¿Qué es Stripe?

Stripe es una plataforma de pagos. Te permite:
- 💰 Cobrar dinero (tarjetas de crédito)
- 📊 Ver reportes de transacciones  
- 🔒 Seguridad profesional

Para **desarrollo y pruebas**, Stripe te da **claves de TEST** que no son reales. Puedes probar todo sin gastar dinero.

---

## PASO 1: Crear Cuenta Stripe

```
1. Ir a https://stripe.com
2. Click "Sign up" (arriba derecha)
3. Ingresar email (puede ser @gmail.com)
4. Crear contraseña
5. Click "Create account"
6. Verificar email (click al link enviado)
```

**Done** - ¡Cuenta creada! 

---

## PASO 2: Obtener Test Keys

En el Stripe Dashboard:

```
1. Click "Developers" (lado izquierdo)
2. Click "API keys" (en "Developers")
3. Verás dos secciones:
   
   ┌─────────────────────────────────────────┐
   │ TEST MODE (azul)   LIVE MODE (rojo)    │
   ├─────────────────────────────────────────┤
   │ Publishable key: pk_test_5JDKJ...      │
   │ Secret key:      sk_test_rKDFJ...     │
   └─────────────────────────────────────────┘
4. Click en TEST MODE (debe estar seleccionado por defecto)
5. Copiar ambas keys
```

### Dónde Copiar

```
┌──────────────────────────────────────────────┐
│ Publishable key:     pk_test_...             │
│ Copy → Pega en .env:                         │
│ STRIPE_PUBLISHABLE_KEY=pk_test_...         │
├──────────────────────────────────────────────┤
│ Secret key:          sk_test_...             │
│ Copy → Pega en .env:                         │
│ STRIPE_SECRET_KEY=sk_test_...               │
└──────────────────────────────────────────────┘
```

---

## PASO 3: Test Webhook (Opcional pero Recomendado)

El webhook es cómo Stripe te avisa cuando alguien paga.

### Opción A: Local (Easiest)

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe

# Verificar que está instalado
stripe --version

# Logearse en Stripe
stripe login
# (Te abrirá una ventana, click "I'll use the API key" o acepta el prompt)

# Escuchar eventos en tu máquina
stripe listen --forward-to localhost:3001/webhooks/stripe

# Resultado:
# > Ready! Your webhook signing secret is: whsec_test_abc123...

# Copiar ese secret:
STRIPE_WEBHOOK_SECRET=whsec_test_abc123...
```

### Opción B: Dashboard (Más lento)

```
1. Developers → Webhooks
2. Click "Test in development"
3. Click "Add endpoint"
4. Endpoint URL: http://localhost:3001/webhooks/stripe
5. Click "Select events"
6. Seleccionar: "payment_intent.succeeded", "charge.refunded"
7. Click "Add endpoint"
8. Click el endpoint creado
9. "Signing secret" → Click "Reveal"
10. Copiar valor → STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## PASO 4: Update .env

En tu archivo `.env`:

```env
# Stripe Test Keys
STRIPE_SECRET_KEY=sk_test_51NqJkJFzZxcQvKl2pnRWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhI
STRIPE_PUBLISHABLE_KEY=pk_test_51NqJkJFzZxcQvKl2pnRWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhI
STRIPE_WEBHOOK_SECRET=whsec_test_1234567890abcdefghijklmnopqrst
```

---

## PASO 5: Test Payment

### Opción A: Con Stripe CLI (mejor)

```bash
# Terminal 1: Inicia el servidor
npm run dev

# Terminal 2: Escucha webhooks
stripe listen --forward-to localhost:3001/webhooks/stripe

# Terminal 3: Prueba un pago
stripe trigger payment_intent.succeeded
# o
stripe trigger charge.refunded
```

### Opción B: Con Test Card

En tu app, usa esta tarjeta:

```
Número:     4242 4242 4242 4242
Vencimiento: 12/25
CVC:        123
```

---

## 💰 Qué Tarjetas Puedes Usar para Testing

Stripe proporciona tarjetas de test:

| Tarjeta | Resultado |
|---------|-----------|
| `4242 4242 4242 4242` | ✅ Pago exitoso |
| `4000 0000 0000 0002` | ❌ Pago rechazado |
| `4000 0027 6000 3184` | ⚠️ Requiere autenticación 3D |
| `5555 5555 5555 4444` | ✅ MasterCard test |
| `3782 822463 10005` | ✅ American Express test |

**Importante**: Estas tarjetas SOLO funcionan en TEST MODE. En LIVE MODE son rechazadas.

---

## 🔐 Test Keys vs Live Keys

```
TEST MODE (Azul)
├─ pk_test_***
├─ sk_test_***
├─ Puedes probar todo
├─ Transacciones NO reales
└─ NO cobras dinero

LIVE MODE (Rojo)
├─ pk_live_***
├─ sk_live_***
├─ Dinero REAL
├─ Clientes pagan de verdad
└─ Usa SOLO en producción
```

**Regla de oro:**
```
En desarrollo: Usa sk_test_... y pk_test_...
En producción: Usa sk_live_... y pk_live_...

❌ NUNCA uses live keys en development
❌ NUNCA uses test keys en producción
```

---

## 📊 Dashboard Stripe - Qué Ver

En el dashboard principal:

```
┌──────────────────────────────┐
│ Payments                     │  ← Transacciones
│ Customers                    │  ← Clientes
│ Billing                      │  ← Suscripciones
│ Payouts                      │  ← Dinero a tu banco
│ Developers → API keys        │  ← Tus keys
│ Developers → Webhooks        │  ← eventos
│ Developers → Logs            │  ← Debug
└──────────────────────────────┘
```

---

## 🛠️ Cómo Stripe Funciona en EficacIA

```
Usuario en dashboard:
  "Click: Upgrade to Pro ($49/mes)"
          ↓
Frontend abre modal Stripe:
  <StripeForm />
          ↓
Usuario ingresa tarjeta:
  4242 4242 4242 4242
          ↓
Frontend envia al backend:
  POST /api/payments/create-intent
  { amount: 4900, currency: "usd" }
          ↓
Backend (payments.service.ts):
  stripe.paymentIntents.create({
    amount: 4900,
    currency: 'usd',
    customer_id: user_id,
    metadata: { user_id }
  })
          ↓
Frontend recibe intent:
  { clientSecret: "pi_1NqJk..." }
          ↓
Frontend confirma con Stripe:
  stripe.confirmCardPayment(clientSecret, {
    payment_method: { card: ... }
  })
          ↓
Stripe procesa pago:
  ✅ Aprobado o ❌ Rechazado
          ↓
Stripe envía webhook:
  POST /api/webhooks/stripe
  { type: "payment_intent.succeeded", ... }
          ↓
Backend guarda en Supabase:
  UPDATE users SET subscription_status = 'pro'
          ↓
Frontend ve:
  "✅ Bienvenido a EficacIA Pro!"
```

---

## 📋 Checklist: Ready for Testing

```
[ ] Stripe account created
[ ] Publishable key copiado a STRIPE_PUBLISHABLE_KEY
[ ] Secret key copiado a STRIPE_SECRET_KEY
[ ] Webhook secret copiado a STRIPE_WEBHOOK_SECRET (if using local)
[ ] .env actualizado
[ ] npm run dev ejecutándose
[ ] Stripe CLI instalado (brew install stripe/stripe-cli/stripe)
[ ] stripe listen --forward-to localhost:3001/webhooks/stripe ejecutándose
[ ] Listo para probar pagos
```

---

## 🔍 Debugging: Qué Ver si Algo Falla

### Webhook no se recibe

```
Problema: POST /api/webhooks/stripe no se ejecuta
Solución:
1. ¿stripe listen está corriendo?
   ps aux | grep stripe
2. ¿Terminal muestra "Ready!"?
3. ¿Endpoint correcto localhost:3001/webhooks/stripe?
4. Revisar logs:
   stripe logs tail
5. En Dashboard: Developers → Webhooks → ver intentos
```

### Pago se rechaza

```
Problema: Transacción rechazada
Soluciones:
1. ¿Usas tarjeta de test? (4242...)
2. ¿No vencida? (mes/año futura)
3. ¿TEST MODE activado en Dashboard?
4. Revisar: Developers → Logs → última entrada
```

### Keys no funcionan

```
Problema: "Invalid API Key"
Soluciones:
1. Copiar EXACTAMENTE el key (sin espacios)
2. ¿Es sk_test_ no sk_live_?
3. ¿.env tiene STRIPE_SECRET_KEY=sk_test_...?
4. ¿Reiniciaste npm run dev?
5. Ver: config/index.ts → STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY
```

---

## 💡 Tips Stripe

### 1. Mode de Prueba Siempre Activo

```bash
# Ver qué mode estás usando
stripe config:get
# Debería mostrar: account_id_test_...
```

### 2. Fake Customers para Testing

```bash
# Crear customer test
stripe customers create --email test@example.com

# Ver clientes
stripe customers list
```

### 3. Monitorizar Webhooks Local

```bash
# Ver eventos en tiempo real
stripe listen --print-json --format=json

# Filtrar por tipo
stripe listen --events payment_intent.succeeded
```

### 4. Resetear API Keys (Si se Exponen)

```
Dashboard → Settings → API keys → Regenerate
(Todos los apps pierden acceso con keys viejas)
```

---

## 📚 Recursos Rápidos

- **Documentación**: https://stripe.com/docs
- **Tarjetas de test**: https://stripe.com/docs/testing
- **CLI Install**: `brew install stripe/stripe-cli/stripe`
- **Dashboard**: https://dashboard.stripe.com

---

## ✅ Listo!

Ya tienes Stripe listo. Cuando estés en producción:
1. Ir a LIVE MODE en dashboard
2. Copiar keys pk_live_ y sk_live_
3. Cambiar en .env (o Vercel secrets)
4. Deploy
5. ¡Cobrar dinero real! 💰
