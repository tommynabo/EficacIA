# 🚀 MVP v2 - Plan Detallado (5 Pasos)

**Objetivo:** De autenticación funcional → Sistema completo de scraping y automatización LinkedIn.  
**Timeline:** 2 semanas (5 días por paso)  
**Status:** Inicio Inmediato

---

## 📌 PASO 1: LinkedIn Session Connection (Días 1-5)

### Qué Hace:
Usuario conecta su cuenta LinkedIn (session cookie) al sistema. Sistema valida y guarda.

### Arquitectura:

```
Frontend (UI)
  ↓ POST session_cookie
Backend → Valida en LinkedIn
  ↓
Supabase (linkedin_accounts tabla)
  ↓ Responde a frontend
UI muestra: ✅ Cuenta conectada
```

### Tareas de Implementación:

#### 1.1 Backend - Validar Session (server/routes/linkedin.routes.ts)

```typescript
// POST /api/linkedin/validate-session
router.post('/validate-session', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionCookie } = req.body
    const userId = req.userId

    if (!sessionCookie) {
      return res.status(400).json({ error: 'Session cookie requerido' })
    }

    // Validar que la cookie sea válida haciendo una petición a LinkedIn
    const response = await fetch('https://www.linkedin.com/voyager/api/feed/timelines', {
      headers: {
        'cookie': `li_at=${sessionCookie}`,
        'User-Agent': 'Mozilla/5.0...'
      }
    })

    if (response.status === 401) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' })
    }

    // Extraer info del usuario LinkedIn (nombre, profile URL)
    // Por ahora, guardar cookie sin más info
    const { data: account, error } = await supabase
      .from('linkedin_accounts')
      .insert({
        user_id: userId,
        session_cookie: sessionCookie,
        is_valid: true,
        last_validated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    res.json({ 
      success: true, 
      account,
      message: 'Cuenta LinkedIn conectada exitosamente' 
    })
  } catch (error: any) {
    console.error('Session validation error:', error)
    res.status(500).json({ error: error.message })
  }
})
```

#### 1.2 Frontend - Form para Conectar (src/pages/dashboard/accounts.tsx)

Ya está hecho. Solo necesita:
- Mejorar error handling
- Mostrar estado de validación en tiempo real

```typescript
// Actualizar el handleConnectAccount existente para usar /validate-session
const handleConnectAccount = async (e: React.FormEvent) => {
  e.preventDefault()
  
  if (!sessionCookie.trim()) {
    setError("Por favor ingresa la session cookie de LinkedIn")
    return
  }

  try {
    setIsConnecting(true)
    setError(null)
    
    // Usar el nuevo endpoint de validación
    const response = await fetch(`${API_URL}/api/linkedin/validate-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ sessionCookie })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Error validando sesión')
    }

    const data = await response.json()
    setSessionCookie("")
    setError(null)
    // Mostrar success message
    alert('✅ Cuenta LinkedIn conectada')
    await fetchAccounts()
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Error conectando')
  } finally {
    setIsConnecting(false)
  }
}
```

#### 1.3 Base de Datos - Verificar Schema

En Supabase, tabla `linkedin_accounts` debe tener:
```sql
- id (UUID)
- user_id (UUID, FK → users)
- session_cookie (TEXT, encrypted)
- is_valid (BOOLEAN)
- last_validated_at (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Testing:
- [ ] Conectar account con cookie válida
- [ ] Rechazar cookie inválida
- [ ] Guardado en BD
- [ ] UI muestra cuenta conectada

---

## 📌 PASO 2: Leads Manual Import (Días 6-10)

### Qué Hace:
Usuario importa leads manualmente (CSV o form) y aparecen en tabla de Leads.

### Tareas:

#### 2.1 Backend - Bulk Import (ya existe parcialmente)

```typescript
// POST /api/linkedin/import-leads
router.post('/import-leads', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { leads: inputLeads } = req.body

    if (!inputLeads || !Array.isArray(inputLeads)) {
      return res.status(400).json({ error: 'Array de leads requerido' })
    }

    // Obtener equipo del usuario
    const { data: userTeams, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (!userTeams?.length) {
      // Crear equipo automáticamente si no existe
      const { data: newTeam } = await supabase
        .from('teams')
        .insert({
          name: `${userId}-default-team`,
          owner_id: userId,
          description: 'Equipo por defecto'
        })
        .select()
        .single()
      var teamId = newTeam.id
    } else {
      var teamId = userTeams[0].id
    }

    // Validar y preparar leads
    const leadsToInsert = inputLeads.map((lead: any) => ({
      team_id: teamId,
      source: 'manual_import',
      first_name: lead.first_name?.trim() || lead.firstName?.trim() || '',
      last_name: lead.last_name?.trim() || lead.lastName?.trim() || '',
      email: lead.email?.trim() || '',
      company: lead.company?.trim() || '',
      position: lead.position || lead.title || '',
      linkedin_url: lead.linkedin_url || lead.linkedinURL || '',
      phone: lead.phone || '',
      notes: lead.notes || '',
      status: 'new',
      created_at: new Date().toISOString()
    })).filter(l => l.email || l.first_name) // Solo si tiene email o nombre

    if (leadsToInsert.length === 0) {
      return res.status(400).json({ error: 'Ningún lead válido en los datos' })
    }

    // Insertar
    const { data: inserted, error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select()

    if (insertError) throw insertError

    res.json({
      success: true,
      message: `${inserted.length} leads importados`,
      leads: inserted
    })
  } catch (error: any) {
    console.error('Import leads error:', error)
    res.status(500).json({ error: error.message })
  }
})
```

#### 2.2 Frontend - CSV Import Modal

```typescript
// En src/pages/dashboard/leads.tsx

const [csvData, setCsvData] = React.useState('')

const handleCSVImport = async () => {
  if (!csvData.trim()) {
    alert('Por favor ingresa datos de leads')
    return
  }

  try {
    setImporting(true)
    
    // Parsear CSV simple (formato: first_name,last_name,email,company,position)
    const lines = csvData.trim().split('\n')
    const leads = lines.map(line => {
      const [first, last, email, company, position] = line.split(',').map(v => v.trim())
      return { first_name: first, last_name: last, email, company, position }
    })

    const response = await fetch(`${API_URL}/api/linkedin/import-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ leads })
    })

    if (!response.ok) throw new Error('Error importando')

    const data = await response.json()
    alert(`✅ ${data.message}`)
    setCsvData('')
    await fetchLeads()
  } catch (error) {
    alert(`Error: ${error.message}`)
  } finally {
    setImporting(false)
  }
}
```

#### 2.3 Testing CSV Format:
```csv
first_name,last_name,email,company,position
Juan,Pérez,juan@empresa.com,TechCorp,Sales Director
Maria,García,maria@empresa.com,TechCorp,Manager
```

### Testing:
- [ ] Importar 3 leads desde CSV
- [ ] Ver en tabla Leads
- [ ] Filtrar por estado
- [ ] Buscar por nombre

---

## 📌 PASO 3: Campaigns Básicas (Días 11-15)

### Qué Hace:
Usuario crea campaña, selecciona leads, define mensaje plantilla.

#### 3.1 Crear Campaña (Backend)

```typescript
// POST /api/linkedin/campaigns
router.post('/campaigns', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { name, description, leadIds } = req.body

    // Obtener equipo
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    const teamId = teams[0].id

    // Crear campaña
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        team_id: teamId,
        name: name.trim(),
        description,
        status: 'draft',
        leads_count: leadIds?.length || 0
      })
      .select()
      .single()

    if (error) throw error

    res.json({ success: true, campaign })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})
```

#### 3.2 Frontend - Campaign Page

```typescript
// src/pages/dashboard/campaigns.tsx

const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
const [selectedLeads, setSelectedLeads] = React.useState<string[]>([])
const [campaignName, setCampaignName] = React.useState('')

const handleCreateCampaign = async () => {
  if (!campaignName || selectedLeads.length === 0) {
    alert('Ingresa nombre y selecciona leads')
    return
  }

  try {
    const response = await fetch(`${API_URL}/api/linkedin/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({
        name: campaignName,
        leadIds: selectedLeads
      })
    })

    const data = await response.json()
    alert('✅ Campaña creada')
    fetchCampaigns()
  } catch (error) {
    alert(`Error: ${error.message}`)
  }
}
```

### Testing:
- [ ] Crear campaña vacía
- [ ] Seleccionar leads para campaña
- [ ] Ver en tabla Campaigns
- [ ] Editar campaña

---

## 📌 PASO 4: AI Personalization (Días 16-20)

### Qué Hace:
Sistema genera mensaje personalizado usando Claude AI para cada lead.

#### 4.1 Backend - Message Generation

```typescript
// POST /api/linkedin/campaigns/{campaignId}/generate-message
router.post('/campaigns/:campaignId/generate-message', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params
    const { leadId, campaignContext } = req.body

    // Obtener lead info
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    // Prompt para Claude
    const prompt = `
Eres un especialista en LinkedIn outreach. Genera un mensaje personalizado y profesional para:

Nombre: ${lead.first_name} ${lead.last_name}
Posición: ${lead.position}
Empresa: ${lead.company}
Contexto de campaña: ${campaignContext || 'Networking profesional'}

El mensaje debe:
- Ser corto (2-3 líneas)
- Personalizado (mencionar su empresa/posición)
- Profesional pero amable
- Generar engagement

Responde SOLO con el mensaje, sin explicaciones.`

    // Llamar Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const aiData = await response.json()
    const message = aiData.content[0].text

    // Guardar en lead como draft
    await supabase
      .from('leads')
      .update({ message_draft: message })
      .eq('id', leadId)

    res.json({ success: true, message })
  } catch (error: any) {
    console.error('AI generation error:', error)
    res.status(500).json({ error: error.message })
  }
})
```

#### 4.2 Frontend - Show Generated Messages

```typescript
const [generatedMessages, setGeneratedMessages] = React.useState<Map<string, string>>(new Map())

const generateMessage = async (leadId: string) => {
  try {
    const response = await fetch(`${API_URL}/api/linkedin/campaigns/${campaignId}/generate-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ leadId, campaignContext: 'Prospecting ventas' })
    })

    const data = await response.json()
    setGeneratedMessages(prev => new Map(prev).set(leadId, data.message))
  } catch (error) {
    alert(`Error generando mensaje: ${error.message}`)
  }
}
```

### Testing:
- [ ] Generar mensaje para 1 lead
- [ ] Verificar que es personalizado
- [ ] Editar mensaje manualmente
- [ ] Regenerar mensaje

---

## 📌 PASO 5: Automation Sequences (Días 21-25)

### Qué Hace:
Sistema envía mensajes automáticamente a leads conectados a LinkedIn.

#### 5.1 Backend - Send Message

```typescript
// POST /api/linkedin/leads/{leadId}/send
router.post('/leads/:leadId/send', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { leadId } = req.params
    const { message, accountId } = req.body

    // Obtener lead
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    // Obtener cuenta LinkedIn conectada
    const { data: account } = await supabase
      .from('linkedin_accounts')
      .select('*')
      .eq('id', accountId)
      .single()

    if (!account.is_valid) {
      return res.status(400).json({ error: 'Cuenta LinkedIn no válida' })
    }

    // Usar Playwright para enviar mensaje
    const { chromium } = await import('playwright')
    
    const browser = await chromium.launch()
    const context = await browser.createBrowserContext({
      extraHTTPHeaders: {
        'cookie': `li_at=${account.session_cookie}`
      }
    })
    const page = await context.newPage()

    try {
      // Navegar a LinkedIn profile del lead y enviar mensaje
      await page.goto(`https://www.linkedin.com/in/${lead.linkedin_url}`)
      
      // Buscar botón "Enviar mensaje"
      await page.click('[aria-label*="Message"]')
      
      // Escribir y enviar
      await page.type('[contenteditable="true"]', message)
      await page.press('[contenteditable="true"]', 'Enter')

      // Marcar como enviado
      await supabase
        .from('leads')
        .update({ status: 'contacted', sent_at: new Date().toISOString() })
        .eq('id', leadId)

      res.json({ success: true, message: 'Mensaje enviado' })
    } finally {
      await browser.close()
    }
  } catch (error: any) {
    console.error('Send message error:', error)
    res.status(500).json({ error: 'Error enviando mensaje' })
  }
})
```

#### 5.2 Frontend - Send UI

```typescript
const handleSendMessage = async (leadId: string) => {
  try {
    const response = await fetch(`${API_URL}/api/linkedin/leads/${leadId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ 
        message: generatedMessages.get(leadId),
        accountId: selectedAccount.id
      })
    })

    const data = await response.json()
    alert('✅ Mensaje enviado a ' + leadName)
    
    // Actualizar estado del lead
    setLeads(leads.map(l => 
      l.id === leadId ? { ...l, status: 'contacted' } : l
    ))
  } catch (error) {
    alert(`Error: ${error.message}`)
  }
}
```

#### 5.3 Activity Logs - Mostrar Reales

Ahora que hay actividad real, actualizar `activity-logs.tsx`:

```typescript
export function ActivityLogs() {
  const [logs, setLogs] = React.useState<LogEntry[]>([])

  React.useEffect(() => {
    // Polling cada 5 segundos
    const interval = setInterval(async () => {
      const response = await fetch(`${API_URL}/api/activity-logs`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      })
      const data = await response.json()
      setLogs(data.logs || [])
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // ... resto del componente
}
```

### Testing:
- [ ] Enviar 1 mensaje a 1 lead
- [ ] Verificar estado cambió a "contacted"
- [ ] Ver en Activity Logs
- [ ] Enviar a múltiples leads

---

## 📊 Timeline Visual

```
SEMANA 1:
│ Paso 1: LinkedIn Connect │████████░░ (Validación sesión)
SEMANA 2:
│ Paso 2: Leads Import │████████░░ (CSV + Form)
│ Paso 3: Campaigns │██████░░░░ (Crear + Seleccionar)
SEMANA 3:
│ Paso 4: AI Messages │████████░░ (Claude API)
│ Paso 5: Automation │██████░░░░ (Enviar mensajes)
```

---

## ✅ Testing Checklist Completo

```
PASO 1 - LinkedIn:
  ☐ Conectar account con sesión válida
  ☐ Rechazar sesión inválida
  ☐ Ver en tabla Accounts
  ☐ Desconectar account

PASO 2 - Leads:
  ☐ Importar CSV con 5 leads
  ☐ Ver en tabla Leads
  ☐ Filtrar por estado
  ☐ Buscar por nombre/email

PASO 3 - Campaigns:
  ☐ Crear campaña
  ☐ Seleccionar 3 leads
  ☐ Editar campaña
  ☐ Ver en tabla

PASO 4 - AI:
  ☐ Generar 3 mensajes distintos
  ☐ Verificar que sean personalizados
  ☐ Editar mensaje
  ☐ Regenerar mensaje

PASO 5 - Send:
  ☐ Enviar mensaje a 1 lead
  ☐ Verificar estatus = "contacted"
  ☐ Ver en Activity Logs
  ☐ Enviar a 3 leads
```

---

## 📋 Notas Técnicas

### Dependencias a Instalar:
```bash
npm install playwright  # Para browser automation
# Ya tienes Anthropic SDK instalado
```

### Variables de Entorno Importantes:
```
ANTHROPIC_API_KEY=sk-ant-... (ya tienes)
LINKEDIN_HEADLESS=true (para Playwright)
```

### Seguridad:
- Encriptar `session_cookie` en BD (Supabase puede hacerlo)
- Nunca loguear cookies completas
- Validar cookies antes de usar

---

## 🎯 Resumen

| Paso | Feature | Complejidad | Días |
|------|---------|-----------|------|
| 1 | LinkedIn Connect | Media | 5 |
| 2 | Leads Import | Baja | 5 |
| 3 | Campaigns | Media | 5 |
| 4 | AI Messages | Alta | 5 |
| 5 | Automation | Alta | 5 |

**Total: 25 días → 5 semanas → ¡MVP v2 Listo!**

Puedes empezar con Paso 1 inmediatamente. Avísame cuando lo completes para pasar a Paso 2.
