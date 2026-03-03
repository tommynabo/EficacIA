# ⚡ Quick Reference - EficacIA MVP

Chuleta rápida para usuarios y desarrolladores.

---

## 🚀 Empezar en 5 minutos

```bash
# 1. Clone
git clone <repo> && cd eficacia

# 2. Install
npm install

# 3. Setup
cp .env.example .env
# → Edita .env con tus keys

# 4. Redis (elige uno)
# macOS: brew install redis && brew services start redis
# Linux: sudo apt-get install redis-server && sudo systemctl start redis-server
# Docker: docker run -d -p 6379:6379 redis:7

# 5. DB (Supabase)
# Ve a supabase.com → SQL Editor → Copia database/schema.sql

# 6. Run
npm run dev
# Frontend:  http://localhost:5173
# Backend:   http://localhost:3001
```

---

## 📡 API Endpoints Principales

### Autenticación
```bash
POST   /api/auth/register          # Crear cuenta
POST   /api/auth/login             # Iniciar sesión
GET    /api/auth/me                # Datos usuario actual
PUT    /api/auth/me                # Actualizar perfil
```

### LinkedIn
```bash
POST   /api/linkedin/accounts                      # Conectar account
GET    /api/linkedin/accounts                      # Listar accounts
POST   /api/linkedin/campaigns                     # Crear campaña
GET    /api/linkedin/campaigns                     # Listar campaña
POST   /api/linkedin/campaigns/:id/scrape          # Scraping
```

### Leads
```bash
GET    /api/leads/campaigns/:id/leads              # Listar leads
POST   /api/leads/campaigns/:id/send-all           # Enviar campaign
POST   /api/leads/campaigns/:id/pause              # Pausar
POST   /api/leads/campaigns/:id/resume             # Reanudar
```

Ver [API_REFERENCE.md](API_REFERENCE.md) para detalles.

---

## 🔑 Variables de Entorno Críticas

```env
# Backend
PORT=3001
NODE_ENV=development
JWT_SECRET=algo-super-seguro-aqui

# Supabase (obtén en dashboard.supabase.com)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Claude
ANTHROPIC_API_KEY=sk-ant-...

# Redis (si usas local)
REDIS_URL=redis://localhost:6379

# Frontend
VITE_API_URL=http://localhost:3001
```

---

## 🔧 Comandos Útiles

```bash
# Desarrollo
npm run dev                # Todo junto
npm run dev:frontend      # Solo React
npm run dev:backend       # Solo Express

# Build
npm run build             # React build
npm run build:backend     # TypeScript build
npm run lint             # Check tipos

# Limpieza
npm run clean            # Rm dist/
redis-cli FLUSHALL      # Limpiar Redis
```

---

## 🔍 Debugging

### Ver logs del backend
```bash
npm run dev:backend
# Output muestra: ✓ Service initialized, ✗ Errors, etc.
```

### Verificar Redis
```bash
redis-cli ping
# Respuesta: PONG = OK
```

### Ver sesiones de Supabase
```
Super base Dashboard → Auth → Users
```

### Verificar token JWT
```bash
# En browser console:
localStorage.getItem('auth_token')
```

---

## 🤖 Cómo Funciona (Resumen)

```
1. Usuario se registra → JWT token
2. Conecta cuenta LinkedIn → Valida sesión
3. Crea campaña → Nombre + account
4. Pega URL búsqueda → Backend scrapeafila
5. Worker extrae perfiles → Guarda en DB
6. Claude genera mensajes → Automáticamente
7. Usuario inicia campaña → Envíos espaciados
8. Worker envía conexiones → Respeta límites LinkedIn
9. UI muestra progreso → Actualización en tiempo real
```

---

## 🆘 SOS Rápidos

### Error: "Cannot connect to backend"
```bash
# 1. Verificar backend corre
ps aux | grep tsx
# 2. Verificar puerto
lsof -i :3001
# 3. Reiniciar
npm run dev
```

### Error: "Redis connection refused"
```bash
# Iniciar Redis
redis-cli ping
# Si responde PONG = OK
# Si no → instalar redis
```

### Error: "LinkedIn session invalid"
Ver [LINKEDIN_SESSION_COOKIE.md](LINKEDIN_SESSION_COOKIE.md)

### Error: "Supabase connection error"
```bash
# Verificar .env
echo $SUPABASE_URL
# Debe ser: https://xxxxx.supabase.co
```

---

## 📊 Monitoreo en Tiempo Real

### BullMQ (Colas de trabajo)
```bash
# En logs del backend verás:
✓ Scraping completed: job_123
✗ Send message failed: job_456
```

### Database (Supabase)
```
Dashboard → Database → Tables → campaigns/leads
```

### Frontend (React)
```
Devtools → Network → Ver requests API
Devtools → Console → Login state, etc
```

---

## 🎯 Flujo Típico de Uso

### Primer uso:
```
1. http://localhost:5173 → Register
2. Dashboard → Cuentas → Pegar LinkedIn cookie
3. Crear campaña → Nombre + account
4. Pegar URL búsqueda LinkedIn
5. Click "Scraping" → Esperar
6. Click "Send All" → (Opcional, cuidado en testing)
```

### Para testing:
```
✓ Haz scraping con URL
✓ Verifica que aparecen leads
✓ Revisa mensajes generados (column ai_message)
✓ Envía a 1-2 leads para probar
✓ Monitorea colas en Redis
✓ Verifica logs en backend
```

---

## 📁 Estructura Importante

```
src/lib/api.ts              ← Cliente HTTP
src/lib/auth-context.tsx    ← Auth global
src/lib/hooks.ts            ← Custom hooks

server/services/            ← Lógica backend
server/routes/              ← Endpoints
server/workers/             ← Job processors

database/schema.sql         ← BD setup
.env.example                ← Variables ref
```

---

## 🔗 Links Importantes

- [Supabase Dashboard](https://supabase.com)
- [Claude Console](https://console.anthropic.com)
- [Redis CLI](https://redis.io/docs/manual/cli/)
- [Playwright Docs](https://playwright.dev)

---

## 💡 Tips & Tricks

### Para copiar LinkedIn cookie rápido:
```javascript
// En console de LinkedIn:
copy(document.cookie.match(/li_at=([^;]+)/)[1])
// Luego paste en EficacIA
```

### Para limpiar todo y empezar:
```bash
npm run clean
rm -rf node_modules
npm install
redis-cli FLUSHALL
# Luego en Supabase SQL:
DELETE FROM leads;
DELETE FROM campaigns;
DELETE FROM users;
```

### Para ver más logs:
```bash
NODE_DEBUG=* npm run dev:backend
```

---

## 📋 Pre-Launch Checklist

- [ ] .env completado con keys reales
- [ ] Redis corriendo
- [ ] Supabase SQL ejecutado
- [ ] npm run dev sin errores
- [ ] Puedo registarme
- [ ] Puedo conectar LinkedIn
- [ ] Funciona scraping
- [ ] Se generan mensajes
- [ ] Se envían conexiones

---

## 🎓 Conceptos Clave

| Concepto | Qué es |
|----------|--------|
| **JWT** | Token que proves autenticación |
| **BullMQ** | Sistema de colas de trabajo |
| **Playwright** | Navegador automatizado |
| **Claude Haiku** | API de IA para mensajes |
| **Supabase** | DB + Auth como servicio |
| **Redis** | Base de datos para colas |
| **Webhook** | API que LinkedIn llama (future) |

---

## 🚀 Siguientes Pasos

1. **MVP funciona** → Probar con 1-2 perfiles
2. **Agregar pagos** → Stripe integration
3. **Deployment** → Railway/Render
4. **Monitoring** → Sentry
5. **Más features** → Unibox, follow-ups

---

**Última actualización:** 3 Marzo 2026  
**Para ayuda completa:** Ver [INDEX.md](INDEX.md)
