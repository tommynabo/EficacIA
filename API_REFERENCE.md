# API Reference - EficacIA

## Base URL
```
http://localhost:3001/api
```

## Autenticación
Todos los endpoints (excepto `/auth/register` y `/auth/login`) requieren un JWT token en el header:

```
Authorization: Bearer <tu-jwt-token>
```

---

## 🔐 Autenticación (`/auth`)

### POST `/auth/register`
Crear nueva cuenta

**Request:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123",
  "name": "Juan Pérez"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "uuid",
    "email": "usuario@ejemplo.com",
    "name": "Juan Pérez",
    "subscription_status": "free",
    "settings": {},
    "created_at": "2026-03-03T10:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### POST `/auth/login`
Iniciar sesión

**Request:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Response:** `200 OK`
```json
{
  "user": { ... },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### GET `/auth/me`
Obtener usuario actual

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "usuario@ejemplo.com",
  "name": "Juan Pérez",
  "subscription_status": "free",
  "settings": {},
  "created_at": "2026-03-03T10:00:00Z"
}
```

---

### PUT `/auth/me`
Actualizar perfil

**Request:**
```json
{
  "name": "Juan Pérez Actualizado",
  "settings": {
    "language": "es",
    "theme": "dark"
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "usuario@ejemplo.com",
  "name": "Juan Pérez Actualizado",
  "settings": { ... }
}
```

---

## 💼 LinkedIn (`/linkedin`)

### POST `/linkedin/accounts`
Conectar cuenta de LinkedIn

**Request:**
```json
{
  "sessionCookie": "AQFd5f4...",
  "proxyIp": "192.168.1.1"
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "session_cookie": "AQFd5f4...",
  "proxy_ip": "192.168.1.1",
  "status": "active",
  "last_validated_at": "2026-03-03T10:00:00Z",
  "created_at": "2026-03-03T10:00:00Z"
}
```

---

### GET `/linkedin/accounts`
Listar cuentas de LinkedIn del usuario

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "status": "active",
    "created_at": "2026-03-03T10:00:00Z"
  }
]
```

---

### POST `/linkedin/campaigns`
Crear nueva campaña

**Request:**
```json
{
  "name": "Campaña Tech Q1 2026",
  "linkedInAccountId": "uuid",
  "settings": {
    "daily_limit": 25,
    "message_type": "default",
    "follow_up_enabled": true,
    "follow_up_delay_days": 3
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Campaña Tech Q1 2026",
  "status": "draft",
  "leads_count": 0,
  "sent_count": 0,
  "accepted_count": 0,
  "rejected_count": 0,
  "linkedin_account_id": "uuid",
  "settings": { ... },
  "created_at": "2026-03-03T10:00:00Z"
}
```

---

### GET `/linkedin/campaigns`
Listar campañas del usuario

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Campaña 1",
    "status": "draft",
    "leads_count": 50,
    "sent_count": 0,
    "created_at": "2026-03-03T10:00:00Z"
  }
]
```

---

### GET `/linkedin/campaigns/:campaignId`
Obtener detalles de una campaña

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Campaña 1",
  "status": "draft",
  "leads_count": 50,
  ...
}
```

---

### PUT `/linkedin/campaigns/:campaignId`
Actualizar campaña

**Request:**
```json
{
  "name": "Nombre actualizado",
  "status": "running",
  "settings": { ... }
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Nombre actualizado",
  ...
}
```

---

### POST `/linkedin/campaigns/:campaignId/scrape`
Iniciar scraping de leads

**Request:**
```json
{
  "searchUrl": "https://www.linkedin.com/search/results/people/?keywords=Product%20Manager&geoId=...",
  "maxLeads": 50
}
```

**Response:** `200 OK`
```json
{
  "jobId": "bulk_scrape_1234",
  "message": "Scraping started",
  "status": "processing"
}
```

---

## 👥 Leads (`/leads`)

### GET `/leads/campaigns/:campaignId/leads`
Listar leads de una campaña

**Query params:**
- `status` (opcional): `pending`, `sent`, `accepted`, `rejected`, `error`

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "campaign_id": "uuid",
    "linkedin_profile_url": "https://linkedin.com/in/username",
    "name": "John Doe",
    "title": "Product Manager",
    "company": "Tech Corp",
    "bio": "Passionate about...",
    "status": "pending",
    "ai_message": "Hola John, he visto que trabajas en...",
    "created_at": "2026-03-03T10:00:00Z"
  }
]
```

---

### GET `/leads/leads/:leadId`
Obtener detalles de un lead

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "John Doe",
  ...
}
```

---

### POST `/leads/leads/:leadId/send`
Enviar mensaje a un lead manualmente

**Request:**
```json
{
  "message": "Hola John, he visto tu perfil...",
  "sessionCookie": "AQFd5f4...",
  "profileUrl": "https://linkedin.com/in/username"
}
```

**Response:** `200 OK`
```json
{
  "jobId": "send_msg_5678",
  "message": "Message scheduled for sending",
  "status": "queued"
}
```

---

### POST `/leads/campaigns/:campaignId/send-all`
Enviar a todos los leads pendientes

**Response:** `200 OK`
```json
{
  "message": "Campaign started",
  "leadsScheduled": 45,
  "totalLeads": 50
}
```

---

### POST `/leads/leads/:leadId/regenerate-message`
Regenerar mensaje de IA para un lead

**Response:** `200 OK`
```json
{
  "message": "Nuevo mensaje generado..."
}
```

---

### POST `/leads/campaigns/:campaignId/pause`
Pausar campaña

**Response:** `200 OK`
```json
{
  "campaign": { ... },
  "message": "Campaign paused"
}
```

---

### POST `/leads/campaigns/:campaignId/resume`
Reanudar campaña

**Response:** `200 OK`
```json
{
  "campaign": { ... },
  "message": "Campaign resumed"
}
```

---

## Error Handling

Todos los errores siguen este formato:

**Response:** `400-500`
```json
{
  "error": "Descripción del error",
  "details": "Información adicional (solo en desarrollo)"
}
```

### Ejemplos

**401 Unauthorized:**
```json
{
  "error": "No authorization token"
}
```

**400 Bad Request:**
```json
{
  "error": "LinkedIn session is invalid"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

---

## Testing con cURL

```bash
# Registro
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "name": "Test User"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123"
  }'

# Get user (requiere token)
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <tu-token>"

# Crear campaña
curl -X POST http://localhost:3001/api/linkedin/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tu-token>" \
  -d '{
    "name": "Test Campaign",
    "linkedInAccountId": "uuid-aqui"
  }'
```

---

## Postman Collection

Próximamente: Colección de Postman para importar todos los endpoints
