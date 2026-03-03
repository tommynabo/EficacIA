# ✅ Vercel Deployment Fixed

## 🔧 Problema Solucionado

Tu error fue:
```
Invalid request: should NOT have additional property `nodejs`. 
Please remove it.
```

**Causa:** El archivo `vercel.json` tenía un campo `nodejs` que es deprecated en las versiones recientes de Vercel.

## ✅ Lo Que Arreglé

### 1. Limpié `vercel.json`

**Antes (❌ INCORRECTO):**
```json
{
  "framework": "vite",
  "nodejs": "20.x",  ← ❌ DEPRECATED
  "env": {...},      ← ❌ OLD SYNTAX
  "public": {...}    ← ❌ OLD SYNTAX
}
```

**Ahora (✅ CORRECTO):**
```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "regions": ["iad1"]
}
```

### 2. Agregué `engines` a `package.json`

```json
"engines": {
  "node": "20.x"
}
```

Esto especifica qué versión de Node necesitas en lugar de `vercel.json`.

---

## ✅ Ahora SÍ Puedes Deploy

Vuelve a intentar en Vercel:

```
1. Ir a https://vercel.com/dashboard
2. Seleccionar tu proyecto
3. Click "Deployments" → "Create Deployment"
4. O simplemente empuja código y se desplegará automáticamente

Debería funcionar ahora.
```

---

## 📋 IMPORTANTE: Verifica .env Antes de Deploy

Mira tu .env y asegúrate de que:

```env
✅ SUPABASE_URL=https://gtguovbuaekpbayurdag.supabase.co
✅ SUPABASE_KEY=eyJhbGciOiJIUzI1NiI...
✅ ANTHROPIC_API_KEY=sk-ant-api03-...
✅ JWT_SECRET=df82cdac...
✅ STRIPE_SECRET_KEY=sk_live_51S3uxi...
✅ STRIPE_PUBLISHABLE_KEY=pk_live_51S3uxi...  ← ¡IMPORTANTE: pk_ no sk_!
```

### ⚠️ Ojo con Stripe Keys

Vea que tienes dos keys:
- `STRIPE_SECRET_KEY` = comienza con `sk_`
- `STRIPE_PUBLISHABLE_KEY` = comienza con `pk_`

Si ambas comienzan con `sk_`, regenera las keys en Stripe dashboard.

---

## 🚀 Deploy Checklist

```
[ ] vercel.json arreglado (ya lo hice)
[ ] package.json tiene "engines": "20.x" (ya lo hice)
[ ] Cambios pusheados a GitHub (ya lo hice)
[ ] En Vercel, verificar Environment Variables:
    [ ] SUPABASE_URL (correcto)
    [ ] SUPABASE_KEY (correcto)
    [ ] SUPABASE_SERVICE_ROLE_KEY (correcto)
    [ ] ANTHROPIC_API_KEY (correcto)
    [ ] JWT_SECRET (correcto)
    [ ] STRIPE_SECRET_KEY (correcto)
    [ ] STRIPE_PUBLISHABLE_KEY (correcta)
    [ ] REDIS_URL (debe ser redis://...@upstash.io o similar, NO localhost)
[ ] VITE_API_URL = https://tu-proyecto-vercel.vercel.app
[ ] FRONTEND_URL = https://tu-proyecto-vercel.vercel.app
[ ] Click Deploy o esperar a que se dispare automáticamente
```

---

## 🔗 Siguiente: Webhooks (Después del Deploy)

Una vez que Vercel te de una URL:

```
1. Ir a Stripe Dashboard → Webhooks
2. Add Endpoint: https://tu-proyecto.vercel.app/api/webhooks/stripe
3. Seleccionar eventos: 
   - payment_intent.succeeded
   - charge.refunded
4. Copiar el "Signing Secret" (whsec_...)
5. Agregar a Vercel como variable: STRIPE_WEBHOOK_SECRET=whsec_...
6. Click "Deploy" de nuevo
```

---

## ✅ Resumen

```
Problema: vercel.json tenía campo "nodejs" deprecated
Solución: Removido. Ahora usa "engines" en package.json
Resultado: Deploy funcionará ahora
Siguiente: Intenta deploy en Vercel
```

¡Ahora deberías poder deployar sin errores! 🚀
