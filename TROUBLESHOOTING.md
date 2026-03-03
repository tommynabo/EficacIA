# 🔧 Troubleshooting Guía Completa

Soluciones rápidas para los problemas más comunes.

## 🚨 Frontend - Problemas Comunes

### "Cannot connect to API" / "Network error"

**Síntoma:**
```
Error: Network error
Failed to fetch http://localhost:3001/api/...
```

**Soluciones:**

1. ✅ Verificar que el backend está corriendo:
   ```bash
   ps aux | grep "node\|tsx"
   # Debe mostrar "tsx watch server/index.ts"
   ```

2. ✅ Verificar que está en puerto 3001:
   ```bash
   lsof -i :3001
   # Debe mostrar Node.js en 3001
   ```

3. ✅ Verificar VITE_API_URL:
   ```bash
   # En .env
   VITE_API_URL=http://localhost:3001
   ```

4. ✅ Si aún no funciona, reinicia todo:
   ```bash
   npm run dev
   # Mata Ctrl+C y vuelve a ejecutar
   ```

---

### "Token expired" después de refrescar la página

**Solución:**
```javascript
// Verify token in localStorage
localStorage.getItem('auth_token')

// If not there:
localStorage.removeItem('auth_token')
// Vuelve a hacer login
```

---

### Botones no responden / UI congelada

**Soluciones:**

```bash
# 1. Limpiar caché de Vite
npm run clean

# 2. Reinstalar node_modules
rm -rf node_modules
npm install

# 3. Reiniciar servidor
npm run dev
```

---

## 🚨 Backend - Problemas Comunes

### "EADDRINUSE: address already in use :::3001"

**El puerto 3001 ya está ocupado**

```bash
# Encontrar qué está usando el puerto
lsof -i :3001

# Matar el proceso (reemplaza PID con el número)
kill -9 <PID>

# O cambiar puerto en .env
PORT=3002
```

---

### "Redis connection refused"

**El servidor Redis no está corriendo**

```bash
# macOS - Verificar si Redis está corriendo
brew services list | grep redis
# Output: redis            started

# Si está stopped:
brew services start redis

# Probar conexión
redis-cli ping
# Debe responder: PONG
```

```bash
# Linux
sudo systemctl status redis-server
sudo systemctl start redis-server
```

```bash
# Docker
docker run -d --name eficacia-redis -p 6379:6379 redis:7
```

---

### "Failed to initialize Supabase"

**Variables de Supabase mal configuradas**

```bash
# Verificar en .env
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Deben ser válidas y parecer:
# SUPABASE_URL=https://xxxxx.supabase.co
# SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI...
```

**Soluciones:**

1. Ve a [supabase.com](https://supabase.com) → tu proyecto
2. Settings → API → Copia URL exactamente
3. Copy `anon public` key exactamente
4. Actualiza .env
5. Reinicia servidor

---

### "Anthropic API key is missing or invalid"

**La key de Claude no es válida**

```bash
# Verificar
echo $ANTHROPIC_API_KEY

# Debe empezar con: sk-ant-
# No debe estar vacío
```

**Soluciones:**

1. Ve a [console.anthropic.com](https://console.anthropic.com)
2. API Keys (left menu)
3. Create new API key
4. Copia el valor completo
5. Actualiza .env: `ANTHROPIC_API_KEY=sk-ant-...`

---

### Logs dice "Queues not initialized"

**Los workers no están cargando**

```bash
# Verificar orden de inicialización en server/index.ts
# Debe ser:
1. initSupabase()
2. await initRedis()
3. await initQueues()
4. await initWorkers()
```

**Soluciones:**

```bash
# Reinicia y observa los logs
npm run dev:backend

# Debe mostrar:
# ✓ Supabase initialized
# ✓ Redis initialized
# ✓ Queues initialized
# ✓ Workers initialized
```

---

## 🚨 Base de Datos - Problemas Comunes

### "Table doesn't exist: users"

**El schema SQL no fue ejecut ado**

```bash
# Solución: Ejecutar SQL en Supabase
# 1. Ve a supabase.com → tu proyecto
# 2. SQL Editor → New query
# 3. Copia TODO el contenido de database/schema.sql
# 4. Paste en el editor
# 5. Click "Run"
```

---

### "User not found" después de registro

**El usuario fue creado en Auth pero no en la tabla users**

```sql
-- Verificar en Supabase:
SELECT * FROM public.users;
-- Si está vacío, el trigger no funcionó

-- Ejecutar manualmente:
INSERT INTO public.users (email, name, subscription_status)
VALUES ('test@example.com', 'Test User', 'free');
```

---

### "Column does not exist: status"

**El schema está incompleto**

```bash
# Verificar que todas las migraciones se ejecutaron
# En Supabase → SQL Editor:
SELECT * FROM information_schema.tables WHERE table_name = 'campaigns';
```

---

## 🚨 LinkedIn - Problemas Comunes

### "LinkedIn session is invalid or expired"

**La cookie de sesión expiró**

```bash
# Soluciones:
1. Abre https://linkedin.com en tu navegador
2. Haz login si es necesario
3. Abre DevTools (F12)
4. Application → Cookies → linkedin.com
5. Busca "li_at" y copia el valor completo
6. En EficacIA → Dashboard → Cuentas → Editar
7. Pega la nueva cookie
```

Ver **LINKEDIN_SESSION_COOKIE.md** para detalles.

---

### "Failed to find connect button"

**La estructura del DOM cambió o la página no cargó**

```typescript
// Problema en: server/services/linkedin-scraper.service.ts
// La línea que busca el botón:
const connectButton = await page
  .locator('button')
  .filter({ hasText: /Connect|Conectar/ })

// LinkedIn cambió el nombre del botón → Actualizar regex
```

**Soluciones:**

1. Actualizar regex en `linkedin-scraper.service.ts`
2. Agregar fallback con XPath
3. Usar selector más robusto
4. Crear issue en GitHub

---

### "Scraping timeout"

**La página tarda demasiado en cargar**

```typescript
// En server/config/index.ts
PLAYWRIGHT_TIMEOUT: 30000,  // 30 segundos
DEFAULT_NAVIGATION_TIMEOUT: 30000,

// Aumentar si es necessary:
PLAYWRIGHT_TIMEOUT: 60000, // 60 segundos
```

---

### "Proxy connection failed"

**La IP del proxy es inválida**

```bash
# Verificar IP
curl https://api.ipify.org?format=json

# Si usas Bright Data:
# 1. Ve a Bright Data dashboard
# 2. Verifica que el proxy esté activo
# 3. Copia IP:PORT correcta
# 4. Actualiza en EficacIA
```

---

## 🚨 Colas (BullMQ) - Problemas Comunes

### "Scraping job stuck in 'waiting'"

**El worker no está procesa ndo**

```bash
# Verificar si el worker está activo:
# En logs debe aparecer:
# "✓ Workers initialized"
# Cuando procesa trabajo:
# "Processing scraping job: job_id"
```

**Soluciones:**

```bash
# 1. Reiniciar backend
npm run dev:backend

# 2. Limpiar colas (CUIDADO: pierde jobs pendientes)
redis-cli FLUSHALL

# 3. Verificar logs detallados
# En server/workers/index.ts, hay listeners que loguean
```

---

### "Job failed with: Error: LinkedIn..." repeatedly

**El job reintenta 3 veces (por defecto) y falla**

```bash
# Ver por qué falla:
# - Socket timeout → LinkedIn tarda
# - Invalid session → Cookie expirada
# - DOM changed → Selectores desactualizados
```

**Soluciones:**

1. Revisar error específico en logs
2. Aumentar timeout si es problema de red
3. Renovar cookie si es sessión inválida
4. Actualizar selectores si es DOM

---

## 🚨 Autenticación - Problemas Comunes

### "Invalid email or password"

**Credenciales incorrectas**

```bash
# Verificar en Supabase:
# Auth → Users
# ¿Existe el email?

# Si no existe → Registrarse primero
# Si existe → Verificar que contraseña es correcta
#   (Supabase no te dice la contraseña, solo hashea)
```

---

### "Email already exists"

**Intentaste registrarte con un email que ya existe**

```bash
# Soluciones:
1. Usa otro email
2. O haz login con ese email y contraseña
3. Si olvidaste contraseña, espera feature de reset
```

---

## 🚨 General - Debug Mode

### Ver todos los logs

```bash
# Backend
NODE_DEBUG=* npm run dev:backend

# Verás MUCHO output, útil para troubleshoot
```

### Limpiar todo y empezar de cero

```bash
# 1. Matar procesos
pkill -f "node\|tsx\|vite"

# 2. Limpiar caché
npm run clean

# 3. Limpiar node_modules
rm -rf node_modules

# 4. Limpiar Supabase (PELIGRO)
# En Supabase SQL Editor:
DELETE FROM leads;
DELETE FROM campaigns;
DELETE FROM linkedin_accounts;
DELETE FROM users;

# 5. Limpiar Redis
redis-cli FLUSHALL

# 6. Reinstalar
npm install

# 7. Iniciar
npm run dev
```

---

## ✅ Checklist de Verificación

Cuando algo falle, verifica esto:

- [ ] Backend está corriendo en puerto 3001
- [ ] Frontend está corriendo en puerto 5173
- [ ] Redis está corriendo: `redis-cli ping` → PONG
- [ ] Supabase está configurado en .env
- [ ] ANTHROPIC_API_KEY está en .env
- [ ] JWT_SECRET está en .env
- [ ] Base de datos schema fue ejecutado
- [ ] Archivo .env NO está en .gitignore (debe estar ignorado)
- [ ] Token JWT válido en localStorage
- [ ] Cookie de LinkedIn válida

---

## 🆘 Si Nada Funciona

1. **Leer logs:** Los errores dice exactamente qué falta
2. **Revisar .env:** Copy-paste valores desde dashboard
3. **Limpiar todo:** Ver sección "Debug Mode"
4. **Reiniciar máquina:** Last resort
5. **Canal de soporte:** GitHub issues

---

**Última actualización:** 2026-03-03  
**Versión:** MVP 1.0.0

¡La mayoría de problemas se resuelven verificando las variables de entorno y los servicios corriendo!
