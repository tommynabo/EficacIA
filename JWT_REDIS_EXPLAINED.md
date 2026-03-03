# 🔐 JWT & Redis Explicado en Detalle

## 🔑 JWT (JSON Web Token) - Autenticación Simple

### ¿Qué es JWT?

JWT es un **"carnet de identidad digital"** que el servidor le da al usuario después del login. Es un documento que dice: *"Este usuario es válido y es quien dice ser"*.

### Flujo de Autenticación en EficacIA:

```
┌──────────────────────────────────────────────────────────┐
│ 1️⃣ USUARIO HACE LOGIN                                     │
├──────────────────────────────────────────────────────────┤
│ Frontend → POST /api/auth/login                           │
│ Body: {                                                   │
│   "email": "tomas@example.com",                           │
│   "password": "secreto123"                                │
│ }                                                         │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 2️⃣ BACKEND VERIFICA EN SUPABASE                           │
├──────────────────────────────────────────────────────────┤
│ - ¿Email existe?                                          │
│ - ¿Contraseña es correcta?                               │
│ ✅ SÍ → Procede                                           │
│ ❌ NO → Devuelve error                                    │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 3️⃣ BACKEND CREA JWT                                       │
├──────────────────────────────────────────────────────────┤
│ Crea token con:                                           │
│ - user_id: "abc-123"                                     │
│ - email: "tomas@example.com"                              │
│ - iat: 1708254396 (created at)                           │
│ - exp: 1708340796 (expires in 24h)                       │
│                                                           │
│ Lo firma con: JWT_SECRET = "mi-clave-super-secreta..."  │
│                                                           │
│ Resultado: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...     │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 4️⃣ BACKEND RESPONDE AL FRONTEND                           │
├──────────────────────────────────────────────────────────┤
│ HTTP 200                                                  │
│ {                                                         │
│   "user": {                                               │
│     "id": "abc-123",                                      │
│     "email": "tomas@example.com",                         │
│     "name": "Tomás"                                       │
│   },                                                      │
│   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."    │
│ }                                                         │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 5️⃣ FRONTEND GUARDA TOKEN                                  │
├──────────────────────────────────────────────────────────┤
│ localStorage.setItem('token',                            │
│   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'             │
│ )                                                         │
│                                                           │
│ ✅ Usuario ahora está "loggeado"                         │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 6️⃣ FRONTEND USA TOKEN EN REQUESTS                         │
├──────────────────────────────────────────────────────────┤
│ GET /api/campaigns                                        │
│ Headers: {                                                │
│   "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5..."  │
│ }                                                         │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 7️⃣ BACKEND VALIDA TOKEN                                   │
├──────────────────────────────────────────────────────────┤
│ authMiddleware:                                           │
│ - Obtiene token del header                               │
│ - Lo verifica con JWT_SECRET                             │
│ - Extrae user_id del payload                             │
│                                                           │
│ Si JWT_SECRET es correcto:                               │
│   ✅ Token válido → Continúa                              │
│   req.user = { id: "abc-123" }                           │
│                                                           │
│ Si alguien intentó falsificar:                           │
│   ❌ Firma no coincide → Error 401                       │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 8️⃣ BACKEND FILTRA POR USER_ID                             │
├──────────────────────────────────────────────────────────┤
│ GET /api/campaigns                                        │
│ SELECT * FROM campaigns                                  │
│ WHERE user_id = req.user.id  ← Solo las de este user   │
│                                                           │
│ Response: Solo 5 campañas del usuario, no todas las      │
│ de otros usuarios (gracias al JWT que validó quién eres)│
└──────────────────────────────────────────────────────────┘
```

### ¿Qué es JWT_SECRET?

Es una **llave maestra secreta** que:
- ✅ Solo el servidor conoce
- ✅ Se usa para **firmar** tokens (crear una firma digital)
- ✅ Se usa para **verificar** que el token no fue modificado
- ✅ similar a tu firma en un cheque - nadie puede falsificarla

**Ejemplo analógico:**
```
Si tu firma es: [una línea ondulada particular]
Nadie más puede hacer esa firma exacta.
Un banco la reconoce como válida.

JWT_SECRET funciona igual:
Certificado que "tomas@example.com" es usuario válido
porque el servidor lo firmó con su clave secreta.
```

### Cómo Protege JWT tu Aplicación

**Escenario: Alguien intenta TRUCAR el token**

```
Token original válido:
┌────────────────────────────────────────────────────────┐
│ Header:    {"alg":"HS256","typ":"JWT"}                 │
│ Payload:   {                                            │
│   "user_id": "123",                                     │
│   "email": "tomas@example.com",                         │
│   "iat": 1708254396                                     │
│ }                                                       │
│ Signature: Tj4WeWrjME5Fv8dH9JkL2m3N4o5P6...            │
│            (creada con JWT_SECRET)                      │
└────────────────────────────────────────────────────────┘

                    ↓

Atacante intenta cambiar user_id:
┌────────────────────────────────────────────────────────┐
│ Header:    {"alg":"HS256","typ":"JWT"}                 │
│ Payload:   {                                            │
│   "user_id": "456",  ← ¡CAMBIÓ!                        │
│   "email": "attacker@evil.com",  ← ¡CAMBIÓ!            │
│   "iat": 1708254396                                     │
│ }                                                       │
│ Signature: Tj4WeWrjME5Fv8dH9JkL2m3N4o5P6...            │
│            (intenta mantener la misma firma)            │
└────────────────────────────────────────────────────────┘

                    ↓

Backend recibe token modificado:
1. Lee el payload: user_id = 456 ✅ (se puede leer)
2. Calcula firma matemática del payload nuevo
   con JWT_SECRET
3. Compara con Signature del token:
   - Firma calculada:  A1B2C3D4E5F6... (diferente)
   - Firma del token:  Tj4WeWrjME5Fv8... (original)
4. ❌ NO COINCIDEN → Token rechazado
5. Error 401 Unauthorized

¿Por qué?
→ Para que alguien cree una firma válida,
  necesitaría saber la JWT_SECRET
→ Solo el servidor la conoce
→ Imposible falsificar sin ella
```

### Generar JWT_SECRET Seguro

**Requisitos:**
- Mínimo 32 caracteres
- Completamente aleatorio
- No predecible

**En macOS/Linux:**

```bash
# Opción 1: OpenSSL (RECOMENDADO)
openssl rand -hex 32

# Ejemplo de salida:
# 8f3a2b9c1d4e7f2a3b5c8d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e

# Opción 2: Si tienes Node.js instalado
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Opción 3: Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**En Windows (PowerShell):**

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object {Get-Random -Maximum 256}))
```

### ¿Qué hacer con el JWT_SECRET?

1. Genera uno con comando anterior
2. Copia el resultado (la cadena de 64 caracteres)
3. Pégalo en tu `.env`:
   ```env
   JWT_SECRET=8f3a2b9c1d4e7f2a3b5c8d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e
   ```
4. **NUNCA** lo compartas ni lo commits a Git
5. En producción: guárdalo en Vercel secrets dashboard

### Cómo se usa en EficacIA

En [server/services/auth.service.ts](server/services/auth.service.ts):

```typescript
import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export class AuthService {
  static async loginUser(email, password) {
    // 1. Valida email y password en Supabase
    const user = await supabase
      .from('users')
      .select()
      .eq('email', email)
      .single();
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      throw new Error('Invalid credentials');
    }
    
    // 2. Crea JWT con informacion del usuario
    const token = jwt.sign(
      {
        user_id: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
      },
      config.JWT_SECRET,  // ← La llave secreta
      { algorithm: 'HS256', expiresIn: '24h' }
    );
    
    // 3. Devuelve al frontend
    return { user, token };
  }
}
```

En [server/middleware/index.ts](server/middleware/index.ts):

```typescript
export function authMiddleware(req, res, next) {
  // 1. Obtiene token del header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];  // "Bearer <token>"
  
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    // 2. Verifica firma con JWT_SECRET
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // 3. Adjunta user_id al request
    req.user = { id: decoded.user_id };
    next();
  } catch (err) {
    // Token inválido, expirado o trucado
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Ejemplos de Errores JWT Comunes

```typescript
// ❌ Token expirado
JWT_EXPIRED: "Token has expired"
// Solución: Usuario needs to login again

// ❌ Token modificado (alguien intentó cambiar payload)
INVALID_SIGNATURE: "invalid signature"
// Solución: Token rechazado, login requerido

// ❌ Token corrompido o malformado
JSON_PARSE_ERROR: "invalid token"
// Solución: Token no es válido, login requerido

// ❌ JWT_SECRET correcto en desarrollo pero diferente en producción
INVALID_SIGNATURE: "invalid signature"
// Solución: Usar el mismo JWT_SECRET en ambos entornos
```

---

## 🗂️ Redis & BullMQ - Cola de Trabajos

### ¿Qué es Redis?

Redis es una **"oficina de correos digital"** donde tu servidor:
- 📬 Recibe pedidos (requests de usuarios)
- 📝 Crea trabajos (jobs) en una cola
- 👥 Delega a trabajadores (workers) que procesan
- 💾 Guarda resultados en la BD

Es una base de datos **en memoria** ultra rápida que maneja colas de trabajo.

### El Problema: Scraping sin Redis

```
Usuario hace click: "Scrape 1000 profiles"

SIN REDIS (síncrono):
┌─────────────────────────────────────────────────────────┐
│ 1. Frontend: POST /api/campaigns/scrape                 │
│    ✅ Request enviado                                   │
│                                                          │
│ 2. Backend: Comienza scraping                           │
│    ⏳ 30 minutos scrapeando                              │
│    🔒 Bloqueado esperando respuesta                      │
│                                                          │
│ 3. Frontend: Spinner infinito                           │
│    ⏳ Esperando respuesta                                │
│    🔒 Usuario no puede hacer nada                        │
│                                                          │
│ 4. Usuario: "¿Qué pasó? ¿Se rompió?"                   │
│    ❌ Timeout después de 2 minutos                       │
│    ❌ Error en pantalla                                  │
│                                                          │
│ ❌ Mala experiencia                                      │
└─────────────────────────────────────────────────────────┘
```

### La Solución: Con Redis + Workers

```
Usuario hace click: "Scrape 1000 profiles"

CON REDIS (asíncrono):
┌─────────────────────────────────────────────────────────┐
│ 1. Frontend: POST /api/campaigns/scrape                 │
│    ✅ Request enviado                                   │
│                                                          │
│ 2. Backend: Crea JOB en Redis                           │
│    └─ "scrape-job-12345"                                │
│    └─ status: "pending"                                 │
│    ✅ INMEDIATAMENTE responde                           │
│                                                          │
│ 3. Backend responde: {"status": "queued", ...}         │
│    ✅ En 0.1 segundo (no 30 minutos)                    │
│                                                          │
│ 4. Frontend: "Scraping en progreso..."                 │
│    ✅ Usuario ve status                                 │
│    ✅ Puede seguir usando la app                        │
│                                                          │
│ 5. Worker (background process):                        │
│    ⏳ Comienza a scrappear (30 minutos)                  │
│    🔄 Sin bloquear nada                                 │
│                                                          │
│ 6. Worker termina:                                      │
│    ✅ Guarda 1000 leads en Supabase                     │
│    ✅ Marca job como "completed"                        │
│                                                          │
│ 7. Frontend pregunta: "¿Terminó?"                      │
│    GET /api/campaigns/12345                            │
│    ✅ Devuelve 1000 leads con mensajes IA               │
│                                                          │
│ ✅ Excelente experiencia                                │
└─────────────────────────────────────────────────────────┘
```

### Arquitectura de Redis en EficacIA

```
                     ┌──────────────────────────┐
                     │   EXPRESS SERVER         │
                     │  (puerto 3001)           │
                     │ Procesa HTTP requests    │
                     └──────────────────────────┘
                              ↓
         ┌────────────────────────────────────────────┐
         │        REDIS QUEUE (BullMQ)                │
         ├────────────────────────────────────────────┤
         │                                             │
         │  📋 Queue "scraping":                      │
         │     ├─ job #1: Scrape URL [pending]       │
         │     ├─ job #2: Scrape URL [pending]       │
         │     └─ job #3: Scrape URL [pending]       │
         │                                             │
         │  💬 Queue "send-message":                  │
         │     ├─ job #1: Send message [active]      │
         │     └─ job #2: Send message [pending]     │
         │                                             │
         │  🧠 Queue "analyze-profile":               │
         │     ├─ job #1: Analyze [pending]          │
         │     ├─ job #2: Analyze [pending]          │
         │     └─ ...                                  │
         │                                             │
         └────────────────────────────────────────────┘
                              ↓
         ┌────────────────────────────────────────────┐
         │      WORKERS (background processes)       │
         ├────────────────────────────────────────────┤
         │                                             │
         │  Worker 1: [🔄] Scraping job #3...       │
         │    └─ Usando Playwright                    │
         │    └─ Abriendo perfiles LinkedIn           │
         │                                             │
         │  Worker 2: [💬] Sending message job #1.. │
         │    └─ Usando Playwright                    │
         │    └─ Haciendo click en LinkedIn           │
         │                                             │
         │  Worker 3: [⏳] Esperando siguiente        │
         │                                             │
         └────────────────────────────────────────────┘
                              ↓
         ┌────────────────────────────────────────────┐
         │      SUPABASE DATABASE                     │
         ├────────────────────────────────────────────┤
         │ INSERT INTO leads (name, title, bio, ...) │
         │ UPDATE campaigns SET leads_count = 50     │
         │ INSERT INTO actions_logs (...)            │
         └────────────────────────────────────────────┘
```

### Las 3 Colas de Trabajo en EficacIA

#### 📡 **Scraping Queue** - Extraer perfiles LinkedIn

```typescript
// User hace POST /api/campaigns/123/scrape
// Body: { searchUrl: "linkedin.com/search/..." }

                        ↓

// Backend crea job en Redis
{
  id: "scrape-1234",
  campaignId: "camp-123",
  searchUrl: "linkedin.com/search/?keywords=...",
  maxLeads: 100,
  status: "pending"
}

                        ↓

// Worker ejecuta:
1. Abre navegador Playwright
2. Va a URL: linkedin.com/search/...
3. Extrae cada perfil:
   - Nombre: "Juan García"
   - Título: "Marketing Manager"
   - Empresa: "TechCorp"
   - Bio: "10 años en marketing..."
4. Guarda en Supabase como LEADS
5. Marca job como "completed"

Resultado: 100 leads en BD (5-10 min)
```

#### 💬 **Send Message Queue** - Enviar conexiones LinkedIn

```typescript
// User hace POST /api/leads/456/send
// Body: { }

                        ↓

// Backend crea job en Redis
{
  id: "send-msg-5678",
  leadId: "lead-456",
  userId: "user-123",
  message: "Hola Juan, vi tu perfil...",
  status: "pending"
}

                        ↓

// Worker ejecuta:
1. Abre navegador Playwright
2. Va a perfil: linkedin.com/in/...
3. Click en "Conectar"
4. Rellena mensaje personalizado
5. Envía conexión
6. Guarda evento en DB
7. Rate limiting: máximo 5/hora, 25/día

Resultado: Conexión enviada (5-10s)
```

#### 🧠 **Analyze Profile Queue** - Generar mensajes IA

```typescript
// Se crea automáticamente cuando se scrappea
// Cada lead nuevo → crea job analyze

                        ↓

// Backend crea job en Redis
{
  id: "analyze-9999",
  leadId: "lead-999",
  name: "Juan García",
  title: "Marketing Manager",
  company: "TechCorp",
  status: "pending"
}

                        ↓

// Worker ejecuta:
1. Obtiene datos del lead
2. Llama a Anthropic Claude API
3. Prompt: "Genera mensaje personalizado en español
   para conectar con Juan García..."
4. Claude responde:
   "Hola Juan! Vi que trabajas en marketing
    en TechCorp. Me interesa conectar porque..."
5. Guarda en BD como "ai_message"

Resultado: Lead con mensaje custom (30s)
```

### Cómo Configurar Redis

#### 🖥️ **Desarrollo Local**

```bash
# 1. Instalar Redis
brew install redis              # macOS
sudo apt-get install redis-server  # Ubuntu/Debian

# 2. Iniciar Redis
redis-server

# 3. En otra terminal, verificar que funciona
redis-cli ping
# Debería responder: PONG

# 4. En tu .env (ya está así):
REDIS_URL=redis://localhost:6379
```

#### ☁️ **Producción (Recomendado: Upstash)**

| Servicio | Precio | Setup | Tiempo |
|----------|--------|-------|--------|
| **Upstash** | Gratis (1GB) | 5 min | **RECOMENDADO** |
| Heroku Redis | $15/mes | 5 min | Alternativa |
| AWS ElastiCache | Variable | 10 min | Escalable |
| Docker | Gratis | 5 min | Local solo |

**Setup con Upstash (RECOMENDADO):**

```bash
1. Ir a https://upstash.com
2. Registrarse
3. Click "Create Database"
4. Seleccionar región (ej: Frankfurt)
5. Click "Create"
6. COPIAR Redis URL:
   redis://default:XXX@XXX.upstash.io:6379
7. En Vercel dashboard → Settings → Environment Variables
   REDIS_URL = <pega la URL>
8. Deploy
```

### Cómo Funciona BullMQ con Redis

```typescript
// server/services/queue.service.ts

import { Queue, Worker } from 'bullmq';

// Conexión a Redis
const redis = { url: process.env.REDIS_URL };

// Crear las colas
const scrapingQueue = new Queue('scraping', { connection: redis });
const sendMessageQueue = new Queue('send-message', { connection: redis });
const analyzeQueue = new Queue('analyze-profile', { connection: redis });

// ===== AGREGAR TRABAJO A LA COLA =====
export async function enqueueScrapeJob(data) {
  // Esto crea un job en Redis y regresa inmediatamente
  const job = await scrapingQueue.add('scrape-linkedin', data, {
    attempts: 3,  // Reintentar hasta 3 veces si falla
    backoff: { type: 'exponential', delay: 2000 }  // Esperar 2s, 4s, 8s...
  });
  
  console.log(`Job queued: ${job.id}`);
  return job;
}

// ===== WORKERS QUE PROCESAN =====
const scrapingWorker = new Worker('scraping', async (job) => {
  console.log(`[Worker] Procesando: ${job.id}`);
  
  const { searchUrl, campaignId } = job.data;
  
  try {
    // Hacer el scraping
    job.updateProgress(10);  // 10% completado
    
    const profiles = await scraper.scrapeSearch(searchUrl);
    
    job.updateProgress(50);  // 50% completado
    
    // Guardar en Supabase
    for (const profile of profiles) {
      await LinkedInDataService.createLead({
        campaign_id: campaignId,
        name: profile.name,
        title: profile.title,
        company: profile.company
      });
    }
    
    job.updateProgress(100);  // 100% - Completado!
    
    return { success: true, count: profiles.length };
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error.message);
    throw error;  // BullMQ reintentará automáticamente
  }
}, { connection: redis });

// Escuchar eventos del worker
scrapingWorker.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completado! Resultados:`, result);
});

scrapingWorker.on('failed', (job, error) => {
  console.log(`❌ Job ${job.id} falló después de 3 reintentos`);
});
```

---

## 📊 Ejemplo Real: Usuario Scrappea 100 Leads

```
═══════════════════════════════════════════════════════════════
⏱️ T=0s - Usuario hace click en "Scrape Leads"
═══════════════════════════════════════════════════════════════

Frontend:
  POST /api/linkedin/campaigns/camp-123/scrape
  Headers: { Authorization: Bearer <JWT_TOKEN> }
  Body: {
    searchUrl: "https://linkedin.com/search/results?keywords=...",
    maxLeads: 100
  }

───────────────────────────────────────────────────────────────

⏱️ T=0.05s - Middleware valida JWT
───────────────────────────────────────────────────────────────

authMiddleware (server/middleware):
  1. Obtiene JWT del header
  2. Verifica firma con JWT_SECRET
  3. Extrae user_id = "user-123"
  4. ✅ Token válido → req.user = { id: "user-123" }

Backend controller:
  1. Valida que campaign sea del usuario
  2. Valida que account LinkedIn exista
  3. ✅ Todo ok → Procede

───────────────────────────────────────────────────────────────

⏱️ T=0.1s - Enqueue job en Redis
───────────────────────────────────────────────────────────────

Backend:
  const job = await queueService.enqueueScrapeJob({
    campaignId: 'camp-123',
    userId: 'user-123',
    searchUrl: 'https://linkedin.com/search/...',
    sessionCookie: 'li_at=xxx...',
    maxLeads: 100
  });

Redis ahora tiene:
  Queue "scraping": [
    {
      id: 'job-99999',
      campaignId: 'camp-123',
      status: 'pending',
      createdAt: '2026-03-03T12:00:00Z'
    }
  ]

Backend responde:
  HTTP 200
  {
    "status": "queued",
    "jobId": "job-99999",
    "message": "Scraping iniciado en segundo plano"
  }

Frontend:
  ✅ Recibió respuesta en 0.1s
  ✅ Muestra: "Scraping en progreso..."
  ✅ Usuario puede hacer otras cosas

───────────────────────────────────────────────────────────────

⏱️ T=0.5s - Worker obtiene job de Redis
───────────────────────────────────────────────────────────────

Worker (background process):
  const job = await scrapingQueue.getNextJob();
  console.log(`Processing: job-99999...`);
  job.updateProgress(5);  // 5% completado

───────────────────────────────────────────────────────────────

⏱️ T=2s - Abre navegador Playwright
───────────────────────────────────────────────────────────────

Worker:
  1. Lanza navegador Chromium
  2. Abre LinkedIn en modo incógnito
  3. Inyecta session cookie (li_at)
  4. Navega a search URL

job.updateProgress(15);  // 15% completado

───────────────────────────────────────────────────────────────

⏱️ T=5s - Comienza a scrapear perfiles
───────────────────────────────────────────────────────────────

Worker extrae información:
  Perfil 1:
    - Nombre: Juan García
    - Título: Marketing Manager
    - Empresa: TechCorp
    - Bio: "10 años en marketing..."
  
  Perfil 2:
    - Nombre: María López
    - Título: Senior DevOps
    - Empresa: StartupXYZ
    ...
  
  Procesados: 20/100
  job.updateProgress(35);  // 35% completado

───────────────────────────────────────────────────────────────

⏱️ T=20s - Guarda resultados en Supabase
───────────────────────────────────────────────────────────────

Worker inserta en Supabase:
  INSERT INTO leads (
    campaign_id, user_id, name, title, company, bio, status
  ) VALUES
    ('camp-123', 'user-123', 'Juan García', '...'),
    ('camp-123', 'user-123', 'María López', '...'),
    ...
  
  Resultado: 100 leads insertados
  job.updateProgress(70);  // 70% completado

───────────────────────────────────────────────────────────────

⏱️ T=25s - Enqueue analyze-profile jobs
───────────────────────────────────────────────────────────────

Worker crea 100 jobs en "analyze-profile" queue:
  for each lead in leads:
    analyzeQueue.add('analyze', {
      leadId: lead.id,
      name: lead.name,
      title: lead.title,
      company: lead.company
    })

Redis ahora tiene en analyze-profile:
  Queue "analyze-profile": [
    { id: 'analyze-1', leadId: 'lead-001', ... },
    { id: 'analyze-2', leadId: 'lead-002', ... },
    ...
    { id: 'analyze-100', leadId: 'lead-100', ... }
  ]

job.updateProgress(85);  // 85% completado

───────────────────────────────────────────────────────────────

⏱️ T=30s - Scraping job finaliza
───────────────────────────────────────────────────────────────

Worker:
  job.updateProgress(100);  // 100%!
  await job.complete({
    success: true,
    leadsScraped: 100,
    campaignId: 'camp-123'
  });

Redis:
  ✅ Job job-99999 marcado como COMPLETED
  Se elimina de la cola

Backend event listener:
  scrapingWorker.on('completed', ...)
  console.log('✅ Scraping completado!');

───────────────────────────────────────────────────────────────

⏱️ T=1min-5min - Analyze workers procesan
───────────────────────────────────────────────────────────────

Worker 1: Procesando analyze-4...
  name: "Juan García"
  API call a Anthropic:
    Prompt: "Por favor crea un mensaje personalizado
             para conectar con Juan García, Marketing
             Manager en TechCorp, especializado en..."
  
  Claude responde:
    "Hola Juan! Vi que trabajas en marketing en TechCorp.
     Me encantaría conectar porque también tengo
     experiencia en growth hacking que podría..."
  
  UPDATE leads SET ai_message = '...'

Worker 2: Procesando analyze-27...
  name: "María López"
  (similar process)

Worker 3: (esperando siguiente)

Resultado: Los 100 leads tienen mensajes personalizados
           después de 3-5 minutos

───────────────────────────────────────────────────────────────

⏱️ T=5min - Frontend polling detecta que terminó
───────────────────────────────────────────────────────────────

Frontend (polling cada 5s):
  GET /api/campaigns/camp-123
  
Backend:
  SELECT * FROM campaigns WHERE id = 'camp-123'
  
  Devuelve:
  {
    id: 'camp-123',
    name: 'Tech Leads',
    status: 'draft',
    leads_count: 100,
    leads: [
      {
        id: 'lead-001',
        name: 'Juan García',
        title: 'Marketing Manager',
        company: 'TechCorp',
        ai_message: 'Hola Juan! Vi que trabajas...',
        status: 'pending'
      },
      ... x100
    ]
  }

Frontend:
  ✅ Muestra 100 leads
  ✅ Cada uno con su mensaje personalizado
  ✅ Usuario puede hacer click "Enviar mensaje"

═══════════════════════════════════════════════════════════════
✅ ÉXITO: Sin bloqueos, buena UX, procesamiento eficiente
═══════════════════════════════════════════════════════════════
```

---

## 🔒 Seguridad: JWT_SECRET y REDIS_URL

### ✅ DO's (Hacer)

```bash
✅ Generar JWT_SECRET aleatorio:
   openssl rand -hex 32

✅ Guardarlo en .env:
   JWT_SECRET=8f3a2b9c1d4e7f2a3b5c8d1e2f3a4b5c...

✅ En producción: agregarlo en Vercel dashboard
   Settings → Environment Variables → Add

✅ Usar .gitignore para .env:
   echo ".env" >> .gitignore
   git add .gitignore
   git commit -m "Add .env to gitignore"

✅ Regenerar si se expone:
   openssl rand -hex 32
   actualizar en Vercel

✅ Usar servicio managed Redis (Upstash) en producción
   Nunca redis:// local en producción
```

### ❌ DON'Ts (No Hacer)

```bash
❌ Usar password simple como JWT_SECRET:
   JWT_SECRET=password123

❌ Usar la palabra "secret":
   JWT_SECRET=my-secret-key

❌ Hardcodear en código:
   // NUNCA HAGAS ESTO
   const JWT_SECRET = "abc123xyz"
   export default {...}

❌ Commitear .env a Git:
   git add .env  ← ¡NO!

❌ Compartir JWT_SECRET:
   Nunca envíes por email, Slack, Discord

❌ Usar mismo secret en dev y prod:
   Regenerar para cada ambiente
```

---

## 📝 Setup Checklist

```
JWT Setup:
[ ] Generar con: openssl rand -hex 32
[ ] Copiar a .env: JWT_SECRET=<valor>
[ ] Verificar que funciona: npm run dev
[ ] En producción: agregar a Vercel secrets

Redis Setup (Desarrollo):
[ ] Instalar: brew install redis
[ ] Iniciar: redis-server
[ ] Verificar: redis-cli ping → PONG
[ ] URL en .env: REDIS_URL=redis://localhost:6379

Redis Setup (Producción):
[ ] Crear cuenta Upstash.com
[ ] Crear base de datos Redis
[ ] Copiar connection URL
[ ] Agregar a Vercel secrets: REDIS_URL=...

Verificar colas funcionan:
[ ] npm run dev
[ ] POST /api/campaigns/scrape (crear job)
[ ] Verificar que job se procesa
[ ] Verificar logs en terminal

Final:
[ ] Todos los leads con mensajes IA
[ ] Scraping tarda 5-10 min (sin bloquear)
[ ] Mensajes personalizados generados
```

---

## 🎓 Preguntas Frecuentes

**P: ¿Qué pasa si olvido JWT_SECRET en .env?**
R: El servidor usará default 'dev-secret-key' en desarrollo. Pero NUNCA hagas eso en producción - los tokens de todos los usuarios usan la misma clave = seguridad rota.

**P: ¿El JWT_SECRET puede ser igual para dev y prod?**
R: NO. Regenera uno nuevo para producción. Si alguien ve el de dev, no tendrá acceso a prod.

**P: ¿Qué pasa si cambio JWT_SECRET?**
R: TODOS los tokens existentes se invalidan. Los usuarios deben hacer login de nuevo. Bien para cuando hay un breach, malo si lo haces accidentalmente.

**P: ¿Redis cuesta dinero?**
R: Upstash es gratis (1GB). Perfect para desarrollo. Si creces: $5-50/mes depending on usage.

**P: ¿Qué pasa si Redis se cae?**
R: Los jobs en cola se pierden. Por eso en producción usas Upstash (managed service con backups).

**P: ¿Los workers siempre están ejecutándose?**
R: En desarrollo: solo si ejecutas `npm run dev:backend`. En producción con Vercel: usas "background jobs" (feature de la plataforma).

**P: ¿Puedo tener múltiples workers?**
R: ✅ SÍ. Varios workers pueden procesar de la misma cola en paralelo.

```typescript
// 3 workers en paralelo
const worker1 = new Worker('scraping', processor, { connection: redis });
const worker2 = new Worker('scraping', processor, { connection: redis });
const worker3 = new Worker('scraping', processor, { connection: redis });

// 3 jobs se procesan al mismo tiempo
```

**P: ¿Cómo monitoreo los jobs?**
R: Usa Bull Board - UI para visualizar colas.

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [
    new BullAdapter(scrapingQueue),
    new BullAdapter(sendMessageQueue),
    new BullAdapter(analyzeQueue),
  ],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
// Go to http://localhost:3001/admin/queues
```

---

## 🚀 Resumen Rápido

| Concepto | Qué es | Para qué | Dónde |
|----------|--------|----------|--------|
| **JWT_SECRET** | Llave maestra | Firmar/verificar tokens | .env |
| **JWT Token** | Carnet digital | Autenticar usuario | localStorage |
| **Redis** | BD en memoria | Almacenar colas | localhost:6379 o Upstash |
| **BullMQ** | Librería de colas | Procesar jobs | en el backend |
| **Worker** | Proceso background | Ejecutar scraping, IA | corriendo en background |
| **Job** | Trabajo en cola | Una tarea específica | en Redis queue |

**Flujo completo:**
```
User login
  ↓
JWT_SECRET firma token
  ↓
Token guardado en localStorage
  ↓
Usuario usa app, hace scraping
  ↓
Backend crea Job en Redis
  ↓
Worker procesa Job
  ↓
Resultados guardados en Supabase
  ↓
Frontend muestra resultados
```

¡Listo! Ya entiendes JWT y Redis. 🎉
