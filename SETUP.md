# EficacIA - Sistema de Prospección LinkedIn MVP

Herramienta de automatización avanzada para LinkedIn que realiza scraping inteligente, generación de mensajes personalizados con IA, y automatización de envíos.

## 🏗️ Arquitectura

```
┌─────────────────────┐
│   Frontend (Vite)   │ (Puerto 5173)
│   - React + TS      │
│   - TailwindCSS     │
└──────────┬──────────┘
           │ HTTP/REST
┌──────────▼──────────┐
│  Backend (Express)  │ (Puerto 3001)
│   - Node.js + TS    │
│   - API Routes      │
└──────────┬──────────┘
           │
    ┌──────┴──────┬──────────┬─────────────┐
    │             │          │             │
┌───▼──┐    ┌─────▼──┐ ┌────▼──┐  ┌──────▼──┐
│Redis │    │Supabase│ │Claude │  │Playwright│
│      │    │(DB)    │ │ Haiku │  │Scraper   │
└───┬──┘    └────────┘ └───────┘  └──────────┘
    │
 ┌──▼──────┐
 │ BullMQ  │ (Colas de trabajo)
 │(Workers)│
 └─────────┘
```

## 🚀 Quick Start

### 1. Clonar el repositorio

```bash
git clone <tu-repo>
cd eficacia
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia `.env.example` a `.env` y completa las variables:

```bash
cp .env.example .env
```

**Variables críticas:**

```env
# Backend
PORT=3001
NODE_ENV=development

# Supabase (obtén en dashboard.supabase.com)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis (local o cloud)
REDIS_URL=redis://localhost:6379

# Claude API
ANTHROPIC_API_KEY=your-key

# Frontend
VITE_API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173

# JWT Secret
JWT_SECRET=tu-secret-muy-seguro
```

### 4. Configurar Supabase

#### a) Crear proyecto en Supabase
- Ve a [supabase.com](https://supabase.com) y crea un proyecto
- Copia las credenciales al `.env`

#### b) Crear base de datos
```bash
# Ejecuta el SQL en el editor de Supabase SQL
# Copia todo el contenido de database/schema.sql
# y ejecuta en Supabase > SQL Editor
```

O usa el cliente de Supabase:
```bash
# Instala supabase-cli y ejecuta
supabase db push
```

### 5. Instalar Redis (local)

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu):**
```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
```

**Docker:**
```bash
docker run -d -p 6379:6redis redis:7
```

### 6. Ejecutar desarrollo

```bash
# Inicia frontend + backend simultáneamente
npm run dev

# O en terminales separadas:
# Terminal 1: Frontend
npm run dev:frontend

# Terminal 2: Backend
npm run dev:backend
```

Abre:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001

## 📁 Estructura del Proyecto

```
.
├── src/                          # Frontend (React)
│   ├── pages/
│   │   ├── landing.tsx          # Página de inicio
│   │   ├── auth.tsx             # Login/Register
│   │   └── dashboard/
│   │       ├── accounts.tsx     # Gestión de cuentas LinkedIn
│   │       ├── campaigns.tsx    # Listado de campañas
│   │       ├── sequence-builder.tsx # Crear/editar campaña
│   │       ├── leads.tsx        # Gestión de leads
│   │       ├── unibox.tsx       # Chat con leads
│   │       ├── analytics.tsx    # Estadísticas
│   │       └── settings.tsx     # Configuración
│   ├── components/
│   │   ├── layout.tsx           # Layout principal
│   │   ├── activity-logs.tsx    # Registro de actividad
│   │   └── ui/                  # Componentes UI
│   └── lib/
│       ├── api.ts              # Cliente HTTP
│       ├── auth-context.tsx    # Contexto de autenticación
│       └── hooks.ts            # Custom hooks
│
├── server/                       # Backend (Express + Node.js)
│   ├── index.ts                # Punto de entrada
│   ├── config/
│   │   └── index.ts            # Configuración
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase
│   │   ├── redis.ts            # Cliente Redis
│   │   └── utils.ts            # Utilities
│   ├── middleware/
│   │   └── index.ts            # Auth + error handling
│   ├── routes/
│   │   ├── auth.routes.ts      # Rutas de autenticación
│   │   ├── linkedin.routes.ts  # Rutas LinkedIn + scraping
│   │   └── leads.routes.ts     # Rutas de leads
│   ├── services/
│   │   ├── auth.service.ts        # Lógica de autenticación
│   │   ├── linkedin-data.service.ts # DB operations
│   │   ├── linkedin-scraper.service.ts # Scraping con Playwright
│   │   ├── ai-message.service.ts   # Claude Haiku integration
│   │   ├── queue.service.ts        # BullMQ setup
│   │   └── index.ts                # Exports
│   ├── workers/
│   │   └── index.ts            # Job workers
│   └── types/
│       └── index.ts            # TypeScript types
│
└── database/
    └── schema.sql              # SQL para Supabase

```

## 🔑 Flujo de Datos Principal

### 1. **Registro/Login**
```
Usuario ingresa credenciales
       ↓
Frontend → POST /api/auth/register (email, password, name)
       ↓
Backend valida y crea usuario en Supabase Auth
       ↓
Genera JWT token
       ↓
Frontend almacena token en localStorage
```

### 2. **Conectar Cuenta LinkedIn**
```
Usuario pega session cookie
       ↓
POST /api/linkedin/accounts
       ↓
Backend valida la sesión con Playwright
       ↓
Guarda en DB con estado "active"
```

### 3. **Crear Campaña**
```
Usuario crea campaña
       ↓
POST /api/linkedin/campaigns
       ↓
Backend guarda con status "draft"
```

### 4. **Scraping de Leads**
```
Usuario pega URL de búsqueda LinkedIn
       ↓
POST /api/linkedin/campaigns/{id}/scrape
       ↓
Backend agrega job a cola (BullMQ)
       ↓
Worker de scraping ejecuta:
  - Abre navegador con sesión cookie
  - Navega a URL de búsqueda
  - Extrae perfiles (nombre, título, empresa, bio)
  - Guarda en leads table con status "pending"
  ↓
Automáticamente se encolana análisis de perfil
  - Claude Haiku analiza cada perfil
  - Genera mensaje personalizado
  - Guarda ai_message en DB
```

### 5. **Envío de Mensajes**
```
Usuario inicia campaña
       ↓
POST /api/leads/campaigns/{id}/send-all
       ↓
Backend agrega job para CADA lead a cola
  - Espacia los envíos (respeta limite de 25/día)
  - Añade delays aleatorios entre acciones
  ↓
Worker de envío procesa cada job:
  - Abre navegador
  - Navega a perfil
  - Busca botón "Conectar"
  - Completa mensaje
  - Envía
  - Actualiza status a "sent"
  ↓
Log registrado en actions_logs table
```

## 🔐 Seguridad

- **Autenticación:** JWT tokens con expiración
- **Autorización:** Middleware de Auth en rutas protegidas
- **Base de datos:** Supabase con Row Level Security (RLS)
- **Variables secr etas:** `.env` nunca se commitea
- **CORS:** Configurado solo para FRONTEND_URL

## 🧠 Sistema Self-Healing Básico

El sistema detecta cuando LinkedIn cambia sus selectores CSS:

1. **Watchdog Job:** Corre diariamente en cuentas de prueba
2. **Se detecta fallo:** Si no puede encontrar el botón "Conectar"
3. **Captura screenshot:** Toma screenshot del DOM
4. **Alerta manual:** Envía a Telegram/Discord para revisión manual
5. **Actualización:** Dev actualiza selectores en `dom_selectors` table

## 📊 Monitoreo de Colas

Ver estado de jobs en tiempo real:

```bash
# En desarrollo, los logs muestran:
✓ Scraping completed: job_id
✗ Send message failed: job_id with error details
```

Dashboard de BullMQ (opcional):
```bash
npm install @bull-board/express
# Accede a http://localhost:3001/admin/queues
```

## 🚨 Manejo de Errores

### Errores comunes:

**"LinkedIn session is invalid"**
- Usuario debe obtener una nueva cookie de sesión
- Extraerla desde DevTools: `document.cookie`

**"Redis not initialized"**
- Verificar que Redis está corriendo: `redis-cli ping`
- Debe responder: `PONG`

**"Supabase connection failed"**
- Verificar SUPABASE_URL y SUPABASE_KEY
- Comprobar que el proyecto existe en dashboard.supabase.com

**"Claude API key invalid"**
- Obtener key en console.anthropic.com
- Formato correcto: `sk-ant-...`

## 🔄 Deployement

### Frontend (Vercel)
```bash
git push
# Vercel hace deploy automático de main branch
```

### Backend (Render, Railway o DigitalOcean)

**Render.com example:**
1. Conecta repositorio
2. Build command: `npm run build:backend`
3. Start command: `npm start`
4. Variables de entorno del `.env`
5. Servicio Redis: Render Redis add-on

**Requirements:**
- Node.js 18+
- Redis
- HTTPS obligatorio (para GitHub OAuth, etc)

## 🤝 Contribuir

```bash
# Crear rama feature
git checkout -b feature/nombre

# Commits claros
git commit -m "feat: descripcion del cambio"

# Push y PR
git push origin feature/nombre
```

## 📝 Licencia

Privada - Solo para EficacIA

## 🆘 Soporte

- **Documentación:** Ver /docs
- **Issues:** GitHub issues
- **Email:** support@eficacia.com

---

**Versión:** 1.0.0 MVP  
**Última actualización:** 2026-03-03  
**Maintainer:** EficacIA Team
