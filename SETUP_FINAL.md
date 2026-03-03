# 🚀 EficacIA - Setup Completado

## ✅ Lo Que YA ESTÁ HECHO (No lo hagas manual)

```
✅ JWT_SECRET       → Generado automáticamente (64 caracteres aleatorios)
✅ Redis            → Instalado en tu Mac (redis-server funcionando)
✅ BullMQ           → Package ya instalado
✅ Todas las keys   → En .env limpias y organizadas
✅ Dependencias     → Todas instaladas (npm install ya hecho)
```

**No necesitas hacer nada con JWT ni Redis. Solo funcionan.**

---

## 📋 Qué NECESITAS Hacer (Stripe + Keys)

### 1️⃣ STRIPE - 5 MINUTOS

```
Lee: STRIPE_SETUP_SIMPLE.md

Resumen rápido:
1. Ir a stripe.com → Sign up
2. Ir a Developers → API keys
3. Copiar "sk_test_..." → STRIPE_SECRET_KEY en .env
4. Copiar "pk_test_..." → STRIPE_PUBLISHABLE_KEY en .env
5. Copiar webhook secret → STRIPE_WEBHOOK_SECRET en .env (opcional)

Listo. Pega los valores en .env y funciona.
```

### 2️⃣ SUPABASE - 10 MINUTOS

```
1. Ir a supabase.com → Create new project
2. Copiar:
   - Project URL → SUPABASE_URL
   - Anon Public Key → SUPABASE_KEY
   - Service Role Secret → SUPABASE_SERVICE_ROLE_KEY
   
3. Pega en .env

4. En Supabase SQL Editor:
   Lee: API_KEYS_SETUP.md → Sección "🗄️ Supabase Setup"
   Copia las 7 tablas SQL
   Pásalas en el SQL editor
   Click "Run"
```

### 3️⃣ ANTHROPIC (Claude) - 2 MINUTOS

```
Ya está en .env con una key válida:
ANTHROPIC_API_KEY=sk-ant-api03-IOn9akYaDEE754bm...

Si quieres tu propia key:
1. Ir a console.anthropic.com
2. Create API key
3. Copiar → ANTHROPIC_API_KEY en .env
```

### 4️⃣ LINKEDIN (Opcional)

```
Para scrappear LinkedIn necesitas:
- Tu cookie de sesión de LinkedIn (session.li_at)
- Se obtiene abriendo LinkedIn en navegador
- Ver: API_KEYS_SETUP.md → "Cómo obtener Session Cookie"

De momento puedes dejar en blanco y solo testear UI.
```

---

## 🎮 PARA EMPEZAR A PROBAR AHORA

```bash
# Terminal 1: Inicia todo
npm run dev

# Resultado:
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001

# Puedes ver la app (aunque Supabase dirá "invalid keys")
```

---

## 📚 Documentación Disponible

```
├── STRIPE_SETUP_SIMPLE.md       ← LEER ESTO PRIMERO (Stripe test keys)
├── API_KEYS_SETUP.md            ← Guía completa de todas las keys
├── JWT_REDIS_EXPLAINED.md       ← Explicación técnica (ya funciona auto)
└── README.md                    ← Documentación general
```

---

## 🔧 Checklist: Qué Tomar en Orden

```
TODAY (Get running):
[ ] Read STRIPE_SETUP_SIMPLE.md
[ ] Create Stripe account
[ ] Copy sk_test_... y pk_test_... to .env
[ ] npm run dev ← See app running

NEXT (Make it work with data):
[ ] Create Supabase account
[ ] Copy SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY to .env
[ ] Run SQL tables in Supabase
[ ] Try login in app

LATER (When ready for production):
[ ] Setup LinkedIn scrapping (get session cookie)
[ ] Test Stripe test payment (use 4242 4242 4242 4242)
[ ] Deploy to Vercel
```

---

## 🚨 IMPORTANTE

### Estructura .env actual:

```env
✅ VITE_API_URL=http://localhost:3001
✅ PORT=3001
✅ NODE_ENV=development

⚠️  SUPABASE_URL=https://your-project.supabase.co    ← REEMPLAZAR
⚠️  SUPABASE_KEY=your-supabase-anon-key              ← REEMPLAZAR
⚠️  SUPABASE_SERVICE_ROLE_KEY=your-...               ← REEMPLAZAR

✅ REDIS_URL=redis://localhost:6379       (Ya funciona)
✅ ANTHROPIC_API_KEY=sk-ant-...           (Ya funciona)

⚠️  STRIPE_SECRET_KEY=sk_test_...         ← REEMPLAZAR
⚠️  STRIPE_PUBLISHABLE_KEY=pk_test_...    ← REEMPLAZAR

✅ JWT_SECRET=df82cdac...                 (Auto-generado y funciona)
✅ FRONTEND_URL=http://localhost:5173     (Ya en .env)
```

**⚠️ Rojo = Necesitas actualizar**

---

## 🎯 PRÓXIMO PASO: LEE STRIPE_SETUP_SIMPLE.md

Ese archivo te explica:
1. Cómo crear cuenta Stripe en 2 minutos
2. Dónde copiar las test keys
3. Qué tarjeta usar para probar (4242 4242 4242 4242)
4. Cómo hacer que funcione localmente

Después de eso, ¡tu app estará lista para testear!

---

## 💬 Resumen Rápido

**Qué está listo (ya funciona):**
- JWT + Redis + BullMQ (automático)
- Dependencies instaladas
- .env con valores iniciales
- Server configurado

**Qué necesitas hacer:**
1. Stripe keys (5 min) ← START HERE
2. Supabase keys (10 min)
3. Anthropic keys (2 min, ya viene)

Eso es todo. Luego `npm run dev` y la app funciona.

