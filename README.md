<div align="center">

# 🚀 EficacIA

## Sistema Inteligente de Prospección LinkedIn

**Automatiza tu outreach en LinkedIn con IA generativa, scraping automatizado y secuencias inteligentes.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-00C853)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E)](https://supabase.com)
[![License](https://img.shields.io/badge/License-Proprietary-FF0000)](#)

**Status:** MVP 1.0.0 ✅ | **Completitud:** 75% | **Ready for Launch:** YES

</div>

---

## 📋 Tabla de Contenidos

- [¿Qué es EficacIA?](#qué-es-eficacia)
- [Features](#features)
- [Quick Start](#quick-start)
- [Documentación](#documentación)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Troubleshooting](#troubleshooting)

---

## ¿Qué es EficacIA?

EficacIA es una plataforma MVP para automatizar prospección en LinkedIn. Combina:

- **Scraping inteligente** de perfiles LinkedIn (Playwright + sesión de usuario)
- **Mensajes personalizados** generados con Claude Haiku
- **Envío automatizado** respetando límites de LinkedIn
- **Sistema de colas** para procesamiento async robusto
- **Self-healing automático** para detectar cambios en LinkedIn

Todo integrado en un frontend React + backend Express con BD PostgreSQL (Supabase).

---

## ✨ Features

### ✅ Implementado (MVP)
- [x] Autenticación con JWT + Supabase
- [x] Gestión de cuentas LinkedIn (session cookies)
- [x] Scraping de búsquedas LinkedIn
- [x] Generación de mensajes con Claude Haiku
- [x] Automatización de envío de conexiones
- [x] Sistema de colas (BullMQ + Redis)
- [x] Dashboard básico
- [x] 18 API endpoints
- [x] Documentación completa
- [x] Setup automático

### ⏳ Próximo (Post-MVP)
- [ ] Integración Stripe (pagos)
- [ ] Self-healing con visión
- [ ] Deployment automatizado
- [ ] Unibox/Chat
- [ ] Follow-up sequences

Ver [STATUS.md](STATUS.md) para más detalles.

---

## 🚀 Quick Start (5 minutos)

### 1. **Clonar y instalar**

```bash
git clone <repo>
cd eficacia
npm install
```

### 2. **Configurar variables de entorno**

```bash
cp .env.example .env
# Edita .env y rellena:
# - SUPABASE_URL y SUPABASE_KEY
# - ANTHROPIC_API_KEY
# - JWT_SECRET
```

### 3. **Instalar Redis**

```bash
# macOS
brew install redis && brew services start redis

# Linux
sudo apt-get install redis-server && sudo systemctl start redis-server

# Docker
docker run -d -p 6379:6379 redis:7
```

### 4. **Iniciar desarrollo**

```bash
npm run dev
# Frontend:  http://localhost:5173
# Backend:   http://localhost:3001
```

### 5. **Crear base de datos**

- Ve a [supabase.com](https://supabase.com)
- Crea un proyecto
- Copia credenciales al .env
- Ve a SQL Editor
- Pega contenido de `database/schema.sql`
- Click "Run"

**¡Listo!** Ahora puedes registrarte y comenzar.

Para más detalles, ver [SETUP.md](SETUP.md) →

---

## 📖 Documentación

Guías completas para toda la stack:

| Documento | Descripción |
|-----------|-------------|
| **[INDEX.md](INDEX.md)** | 📚 Índice navegable de toda la documentación |
| **[SETUP.md](SETUP.md)** | 🔧 Instalación paso a paso |
| **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** | 🏗️ Arquitectura y flujos de datos |
| **[API_REFERENCE.md](API_REFERENCE.md)** | 📡 Todos los endpoints (18) |
| **[LINKEDIN_SESSION_COOKIE.md](LINKEDIN_SESSION_COOKIE.md)** | 🔑 Cómo obtener session cookie |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | 🆘 Problemas comunes y soluciones |
| **[STATUS.md](STATUS.md)** | 📊 Estado actual del proyecto |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────┐
│  Frontend (React + Vite)                │
│  - Login/Register                       │
│  - Dashboard de campañas                │
│  - Gestión de leads                     │
│  - Monitoreo en tiempo real             │
└──────────────┬──────────────────────────┘
               │ HTTP REST + JWT
┌──────────────▼──────────────────────────┐
│  Backend (Express + TypeScript)         │
│  - 18 endpoints API                     │
│  - Autenticación (Supabase Auth)        │
│  - Scraping (Playwright)                │
│  - IA (Claude Haiku)                    │
│  - Colas (BullMQ)                       │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┬─────────────┐
    │          │          │             │
┌───▼──┐  ┌───▼──┐  ┌────▼──┐  ┌──────▼──┐
│Redis │  │Supa- │  │Claude │  │Chromium │
│      │  │base  │  │Haiku  │  │Browser  │
│Queue │  │ DB   │  │API    │  │(Play-   │
│      │  │      │  │       │  │wright)  │
└──────┘  └──────┘  └───────┘  └─────────┘
```

**Flujo:**
1. Usuario crea campaña
2. API enqueues scraping job
3. Worker scrapeafila perfiles
4. Claude genera mensajes
5. Otro worker envía conexiones (spaciadas)
6. Frontend muestra progreso

Ver [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) para detalles.

---

## 💻 Requisitos Sistema

**Mínimo:**
- Node.js 18+
- npm 9+
- Redis 7+
- 2GB RAM libre
- Conexión a internet

**Cuentas necesarias:**
- [Supabase](https://supabase.com) - DB (free tier OK)
- [Anthropic Claude](https://console.anthropic.com) - API key
- LinkedIn - Cuenta personal (para session cookie)

---

## 📁 Estructura

```
eficacia/
├── src/                    # Frontend React
│   ├── pages/             # Páginas principales
│   ├── components/        # Componentes React
│   └── lib/               # Utils, hooks, API
│
├── server/                # Backend Express
│   ├── routes/            # Endpoints API
│   ├── services/          # Lógica del negocio
│   ├── workers/           # BullMQ workers
│   ├── lib/               # Clientes (Supabase, Redis)
│   └── middleware/        # Auth, error handling
│
├── database/              # esquema SQL
├── docs/                  # Documentación
└── package.json          # Dependencias
```

---

## 🔧 Scripts Principales

```bash
# Desarrollo
npm run dev                # Frontend + Backend
npm run dev:frontend       # Solo frontend (5173)
npm run dev:backend        # Solo backend (3001)

# Build
npm run build              # Build frontend
npm run build:backend      # Build backend
npm run lint              # TypeScript check

# Utilidades
npm run clean             # Limpiar dist/
```

---

## 🔑 Variables de Entorno Clave

```env
# Backend
PORT=3001
JWT_SECRET=tu-secret-muy-seguro

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Frontend
VITE_API_URL=http://localhost:3001
```

Ver `.env.example` para template completo.

---

## 🧪 Probar Localmente

### 1. **Registrarse**
```
http://localhost:5173/register
email: test@example.com
password: test123456
name: Test User
```

### 2. **Obtener LinkedIn Cookie**
Ver [LINKEDIN_SESSION_COOKIE.md](LINKEDIN_SESSION_COOKIE.md)

### 3. **Conectar Cuenta**
Dashboard → Cuentas → Pegar cookie → Click "Conectar"

### 4. **Crear Campaña**
Dashboard → Campañas → New → Nombre + Cuenta

### 5. **Scraping**
Pega URL de búsqueda LinkedIn → Click "Scrape"

### 6. **Revisar Leads**
Verás perfiles extraídos con mensajes generados

### 7. **Enviar (Con cuidado)**
Click "Send All" para automatizar envíos

---

## 🆘 Problemas Frecuentes

| Problema | Solución |
|----------|----------|
| `Redis connection refused` | `brew services start redis` (macOS) |
| `Supabase connection error` | Verificar SUPABASE_URL en .env |
| `LinkedIn session invalid` | Renovar cookie (ver LINKEDIN_SESSION_COOKIE.md) |
| `Port 3001 already in use` | `lsof -i :3001` → kill PID |
| `Cannot connect to API` | Verificar backend está corriendo: `ps aux \| grep tsx` |

Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md) para más ayuda →

---

## 📞 Soporte

- **Documentación:** Ver [INDEX.md](INDEX.md)
- **Problemas:** Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **API:** Ver [API_REFERENCE.md](API_REFERENCE.md)
- **Setup:** Ver [SETUP.md](SETUP.md)

---

## 📊 Tech Stack

```
Frontend:
  React 19 + TypeScript
  Vite (bundler)
  React Router
  TailwindCSS
  Lucide Icons

Backend:
  Express.js
  Node.js 18+
  TypeScript
  Supabase (PostgreSQL + Auth)
  BullMQ + Redis
  Playwright (scraping)
  Claude Haiku (IA)
  JWT (auth)

DevOps:
  npm/yarn
  tsx (TS runner)
  concurrently
```

---

## 🎯 Roadmap

**MVP (Ahora)** ✅
- Scraping + IA + Automación

**Post-MVP (Próximo)**
- Pagos (Stripe)
- Self-healing avanzado
- Deployment automatizado

Ver [STATUS.md](STATUS.md) →

---

## 📄 Licencia

Privada - Solo para EficacIA

---

## 👥 Autor

EficacIA Development Team

---

<div align="center">

**Made with ❤️ for LinkedIn Growth**

[Ver Documentación Completa →](INDEX.md)

</div>
