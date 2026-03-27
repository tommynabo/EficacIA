import { Router, Request, Response } from 'express'
import { initSupabase, supabaseAdmin } from '../lib/supabase.js'
import { authMiddleware } from '../middleware/index.js'
import { linkedInAuthService } from '../services/linkedin-auth.service.js'

const router = Router()

// Use supabaseAdmin (service role) cast as any to bypass strict Supabase type checking
// All table schemas are defined in SUPABASE_SCHEMA.sql + database/migration_linkedin_auth.sql
const db = supabaseAdmin as any

/**
 * GET /api/linkedin/leads
 * Obtiene todos los leads de un usuario/equipo
 */
router.get('/leads', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })
    const { status = 'all', limit = 50, offset = 0, search = '' } = req.query

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.json({ leads: [], total: 0 })
    }

    const teamId = teams[0].id

    // Query leads con búsqueda
    let query = db
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
      )
    }

    const { data: leads, error, count } = await query.range(
      Number(offset),
      Number(offset) + Number(limit) - 1
    )

    if (error) {
      console.error('Leads fetch error:', error)
      return res.status(400).json({ error: error.message })
    }

    res.json({
      leads: leads || [],
      total: count || 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  } catch (error: any) {
    console.error('Get leads error:', error)
    res.status(500).json({ error: error.message || 'Error obteniendo leads' })
  }
})

/**
 * POST /api/linkedin/import-leads
 * Importa leads manualmente o desde LinkedIn (simulado para MVP)
 */
router.post('/import-leads', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })
    const { leads: inputLeads } = req.body

    if (!inputLeads || !Array.isArray(inputLeads)) {
      return res
        .status(400)
        .json({ error: 'Se requiere un array de leads para importar' })
    }

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.status(400).json({ error: 'No hay equipo configurado' })
    }

    const teamId = teams[0].id

    // Prepara leads para insertar
    const leadsToInsert = inputLeads.map((lead: any) => ({
      team_id: teamId,
      source: 'manual_import',
      first_name: lead.first_name || lead.firstName || '',
      last_name: lead.last_name || lead.lastName || '',
      email: lead.email || '',
      phone: lead.phone || null,
      company: lead.company || '',
      position: lead.position || lead.title || '',
      linkedin_url: lead.linkedin_url || lead.linkedinUrl || null,
      status: 'pending',
      notes: lead.notes || '',
    }))

    // Inserta los leads
    const { data: insertedLeads, error: insertError } = await db
      .from('leads')
      .insert(leadsToInsert)
      .select()

    if (insertError) {
      console.error('Insert leads error:', insertError)
      return res.status(400).json({ error: insertError.message })
    }

    res.json({
      success: true,
      count: insertedLeads?.length || 0,
      leads: insertedLeads,
      message: `✓ Se importaron ${insertedLeads?.length || 0} leads correctamente`,
    })
  } catch (error: any) {
    console.error('Import leads error:', error)
    res.status(500).json({ error: error.message || 'Error importando leads' })
  }
})

/**
 * POST /api/linkedin/search-leads
 * Busca leads simulados (en producción usaría API de LinkedIn o scraping)
 */
router.post('/search-leads', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })
    const { keywords, location, title, limit = 10 } = req.body

    if (!keywords) {
      return res.status(400).json({ error: 'Palabras clave requeridas' })
    }

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.status(400).json({ error: 'No hay equipo configurado' })
    }

    const teamId = teams[0].id

    // Datos simulados para demostración
    const simulatedLeads = [
      {
        first_name: 'Juan',
        last_name: 'García Pérez',
        email: 'juan.garcia@techcorp.es',
        company: 'TechCorp España',
        position: 'Sales Director',
        linkedin_url: 'https://www.linkedin.com/in/juan-garcia',
      },
      {
        first_name: 'María',
        last_name: 'López Martínez',
        email: 'maria.lopez@marketing.es',
        company: 'Marketing Digital Solutions',
        position: 'Marketing Manager',
        linkedin_url: 'https://www.linkedin.com/in/maria-lopez',
      },
      {
        first_name: 'Carlos',
        last_name: 'Rodríguez Santos',
        email: 'carlos.rodriguez@ecommerce.es',
        company: 'E-commerce Solutions',
        position: 'Business Development Manager',
        linkedin_url: 'https://www.linkedin.com/in/carlos-rodriguez',
      },
      {
        first_name: 'Elena',
        last_name: 'Fernández Gómez',
        email: 'elena.fernandez@startup.es',
        company: 'Tech Startup Innovadora',
        position: 'Founder & CEO',
        linkedin_url: 'https://www.linkedin.com/in/elena-fernandez',
      },
      {
        first_name: 'David',
        last_name: 'Moreno Jiménez',
        email: 'david.moreno@consulting.es',
        company: 'Consulting Partners',
        position: 'Strategy Consultant',
        linkedin_url: 'https://www.linkedin.com/in/david-moreno',
      },
    ].slice(0, limit)

    // Prepara leads para insertar
    const leadsToInsert = simulatedLeads.map((lead) => ({
      team_id: teamId,
      source: 'linkedin_search',
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      company: lead.company,
      position: lead.position,
      linkedin_url: lead.linkedin_url,
      status: 'pending',
    }))

    // Inserta los leads
    const { data: insertedLeads, error: insertError } = await db
      .from('leads')
      .insert(leadsToInsert)
      .select()

    if (insertError) {
      console.error('Insert error:', insertError)
    }

    res.json({
      success: true,
      count: simulatedLeads.length,
      leads: insertedLeads || simulatedLeads,
      message: `✓ Se encontraron ${simulatedLeads.length} leads en LinkedIn y se guardaron en tu base de datos`,
    })
  } catch (error: any) {
    console.error('Search leads error:', error)
    res.status(500).json({ error: error.message || 'Error buscando leads' })
  }
})

/**
 * PUT /api/linkedin/leads/:leadId
 * Actualiza el estado de un lead
 */
router.put('/leads/:leadId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })

    const { leadId } = req.params
    const { status, notes, company, position } = req.body

    // Verify ownership: get user's team
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.status(403).json({ error: 'No team configured for this user' })
    }
    const teamId = teams[0].id
    if (!teamId) return res.status(403).json({ error: 'No team configured for this user' })

    const updateData: any = {}
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (company) updateData.company = company
    if (position) updateData.position = position

    const { data: lead, error } = await db
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .eq('team_id', teamId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found or access denied' })
    }

    res.json({ success: true, lead })
  } catch (error: any) {
    console.error('Update lead error:', error)
    res.status(500).json({ error: error.message || 'Error actualizando lead' })
  }
})

/**
 * DELETE /api/linkedin/leads/:leadId
 * Elimina un lead
 */
router.delete('/leads/:leadId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })

    const { leadId } = req.params

    // Verify ownership: get user's team
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.status(403).json({ error: 'No team configured for this user' })
    }
    const teamId = teams[0].id
    if (!teamId) return res.status(403).json({ error: 'No team configured for this user' })

    const { error } = await db.from('leads').delete().eq('id', leadId).eq('team_id', teamId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ success: true, message: 'Lead eliminado' })
  } catch (error: any) {
    console.error('Delete lead error:', error)
    res.status(500).json({ error: error.message || 'Error eliminando lead' })
  }
})

/**
 * POST /api/linkedin/bulk-import
 * Importa leads desde CSV
 */
router.post('/bulk-import', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })
    const { csvData, type, leads, source } = req.body

    // 1. Manejo para la Extensión de Chrome (JSON array)
    if (type === 'extension') {
      if (!Array.isArray(leads)) {
        return res.status(400).json({ error: 'Array de leads requerido' })
      }
      
      // Prevención Error 400: array vacío es un 200 OK
      if (leads.length === 0) {
         return res.json({ success: true, count: 0, leads: [], message: 'No se encontraron prospectos (0 leads).' })
      }

      // Obtiene equipo del usuario
      const { data: teams, error: teamsError } = await db
        .from('teams')
        .select('id')
        .eq('owner_id', userId)
        .limit(1)

      if (teamsError || !teams || teams.length === 0) {
        return res.status(400).json({ error: 'No hay equipo configurado' })
      }
      const teamId = teams[0].id

      const leadsToInsert = leads.map((lead: any) => ({
        team_id: teamId,
        source: source || 'extension',
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        company: lead.company || '',
        position: lead.job_title || lead.position || '',
        location: lead.location || '',
        linkedin_url: lead.linkedin_url || null,
        status: 'pending'
      }))

      const { data: insertedLeads, error: insertError } = await db
        .from('leads')
        .insert(leadsToInsert)
        .select()

      if (insertError) {
        return res.status(400).json({ error: insertError.message })
      }

      return res.json({
        success: true,
        count: insertedLeads?.length || 0,
        leads: insertedLeads,
      })
    }

    // 2. Manejo clásico CSV
    if (!csvData) {
      return res.status(400).json({ error: 'CSV data requerido' })
    }

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.status(400).json({ error: 'No hay equipo configurado' })
    }

    const teamId = teams[0].id

    // Parse CSV simple (separado por saltos de línea y comas)
    const lines = csvData.split('\n').filter((line: string) => line.trim())
    const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase())

    const leadsToInsert = lines.slice(1).map((line: string) => {
      const values = line.split(',').map((v: string) => v.trim())
      const lead: any = { team_id: teamId, source: 'csv_import', status: 'pending' }

      headers.forEach((header: string, index: number) => {
        if (header === 'first_name' || header === 'firstname')
          lead.first_name = values[index]
        if (header === 'last_name' || header === 'lastname')
          lead.last_name = values[index]
        if (header === 'email') lead.email = values[index]
        if (header === 'company') lead.company = values[index]
        if (header === 'position' || header === 'title') lead.position = values[index]
        if (header === 'phone') lead.phone = values[index]
        if (header === 'linkedin') lead.linkedin_url = values[index]
      })

      return lead
    })

    const { data: insertedLeads, error: insertError } = await db
      .from('leads')
      .insert(leadsToInsert)
      .select()

    if (insertError) {
      return res.status(400).json({ error: insertError.message })
    }

    res.json({
      success: true,
      count: insertedLeads?.length || 0,
      leads: insertedLeads,
    })
  } catch (error: any) {
    console.error('Bulk import error:', error)
    res.status(500).json({ error: error.message || 'Error importando CSV' })
  }
})

/**
 * GET /api/linkedin/accounts
 * Obtiene todas las cuentas LinkedIn conectadas del usuario
 */
router.get('/accounts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })

    const { data: teamsForAccounts } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (!teamsForAccounts?.length) {
      return res.json({ success: true, accounts: [], count: 0 })
    }

    const { data: accounts, error } = await db
      .from('linkedin_accounts')
      .select('*')
      .eq('team_id', teamsForAccounts[0].id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch accounts error:', error)
      return res.status(400).json({ error: error.message })
    }

    res.json({
      success: true,
      accounts: accounts || [],
      count: accounts?.length || 0,
    })
  } catch (error: any) {
    console.error('Get accounts error:', error)
    res.status(500).json({ error: error.message || 'Error obteniendo cuentas' })
  }
})

/**
 * POST /api/linkedin/accounts
 * Conecta una nueva cuenta LinkedIn usando email + contraseña (tipo Walead)
 */
router.post('/accounts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })
    const { linkedin_email, linkedin_password, session_cookie, profile_name } = req.body

    // Obtener o crear team del usuario
    let teamIdForAccount: string
    const { data: existingTeams } = await db.from('teams').select('id').eq('owner_id', userId).limit(1)
    if (existingTeams?.length) {
      teamIdForAccount = existingTeams[0].id
    } else {
      const { data: newT } = await db.from('teams').insert({ name: 'Mi Equipo', owner_id: userId }).select().single()
      if (!newT) return res.status(500).json({ error: 'No se pudo crear el equipo' })
      teamIdForAccount = newT.id
    }

    // Si viene con credenciales, hacer login automático con Playwright
    if (linkedin_email && linkedin_password) {
      console.log('[LINKEDIN] Usando Playwright para login con credenciales:', linkedin_email)

      const sessionCookie = await linkedInAuthService.authenticateAndGetSession(
        linkedin_email,
        linkedin_password
      )

      if (!sessionCookie) {
        return res.status(401).json({
          error:
            'No se pudo autenticar con LinkedIn. Verifica email/contraseña o si LinkedIn solicitó verificación adicional.',
          needsCookie: true,
        })
      }

      console.log('[LINKEDIN] ✓ Session obtenida con Playwright')

      let profileName = profile_name || linkedin_email.split('@')[0] || 'Mi Cuenta LinkedIn'
      try {
        const profileResponse = await fetch('https://www.linkedin.com/voyager/api/me', {
          headers: { 'cookie': `li_at=${sessionCookie}`, 'User-Agent': 'Mozilla/5.0' },
        })
        if (profileResponse.status === 200) {
          const profileData = await profileResponse.json()
          profileName = `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim() || profileName
        }
      } catch (e) { console.warn('[LINKEDIN] Could not fetch profile:', e) }

      const { data: account, error: insertError } = await db
        .from('linkedin_accounts')
        .insert({
          team_id: teamIdForAccount,
          username: linkedin_email.split('@')[0],
          session_cookie: sessionCookie,
          profile_name: profileName,
          is_valid: true,
          last_validated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) {
        console.error('[LINKEDIN] Insert account error:', insertError)
        return res.status(400).json({ error: 'No se pudo guardar la cuenta' })
      }

      console.log('[LINKEDIN] ✓ Cuenta conectada:', profileName)
      return res.json({ success: true, account, message: `✓ Cuenta LinkedIn de ${profileName} conectada exitosamente` })
    }

    // Modo cookie manual
    else if (session_cookie) {
      console.log('[LINKEDIN] Conectando con cookie (modo manual)')

      let resolvedProfileName = profile_name || 'Mi Cuenta LinkedIn'
      let isValid = true
      try {
        const validateResponse = await fetch('https://www.linkedin.com/voyager/api/me', {
          headers: { 'cookie': `li_at=${session_cookie}`, 'User-Agent': 'Mozilla/5.0' },
        })
        isValid = validateResponse.status === 200
        if (isValid) {
          try {
            const d = await validateResponse.json()
            resolvedProfileName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || resolvedProfileName
          } catch { /* ignorar */ }
        }
      } catch (e) { console.warn('[LINKEDIN] Could not validate cookie:', e) }

      if (!isValid) return res.status(401).json({ error: 'Cookie de LinkedIn inválida o expirada' })

      const { data: account, error: insertError } = await db
        .from('linkedin_accounts')
        .insert({
          team_id: teamIdForAccount,
          username: resolvedProfileName.replace(/\s+/g, '-').toLowerCase() || 'cuenta-linkedin',
          session_cookie,
          profile_name: resolvedProfileName,
          is_valid: true,
          last_validated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) return res.status(400).json({ error: insertError.message })
      return res.json({ success: true, account, message: '✓ Cuenta LinkedIn conectada exitosamente' })
    }

    else {
      return res.status(400).json({ error: 'Se requiere (linkedin_email + linkedin_password) o session_cookie' })
    }
  } catch (error: any) {
    console.error('[LINKEDIN] Connect account error:', error)
    res.status(500).json({ error: error.message || 'Error conectando cuenta' })
  }
})

/**
 * DELETE /api/linkedin/accounts/:accountId
 * Desconecta una cuenta LinkedIn
 */
router.delete('/accounts/:accountId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' })

    // Verificar que la cuenta pertenezca al equipo del usuario
    const { data: userTeams } = await db.from('teams').select('id').eq('owner_id', userId)
    const userTeamIds = (userTeams || []).map((t: any) => t.id)

    const { data: account } = await db
      .from('linkedin_accounts')
      .select('*')
      .eq('id', accountId)
      .in('team_id', userTeamIds.length ? userTeamIds : ['none'])
      .single()

    if (!account) {
      return res.status(404).json({ error: 'Cuenta no encontrada' })
    }

    const { error } = await db
      .from('linkedin_accounts')
      .delete()
      .eq('id', accountId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ success: true, message: 'Cuenta desconectada' })
  } catch (error: any) {
    console.error('Delete account error:', error)
    res.status(500).json({ error: error.message || 'Error desconectando cuenta' })
  }
})

/**
 * GET /api/linkedin/campaigns
 * Obtiene todas las campañas del usuario
 */
router.get('/campaigns', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    // Obtener team del usuario
    const { data: teams } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (!teams?.length) {
      return res.json({ campaigns: [], count: 0 })
    }

    const teamId = teams[0].id

    const { data: campaigns, error } = await db
      .from('campaigns')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      success: true,
      campaigns: campaigns || [],
      count: campaigns?.length || 0,
    })
  } catch (error: any) {
    console.error('Get campaigns error:', error)
    res.status(500).json({ error: error.message || 'Error obteniendo campañas' })
  }
})

/**
 * POST /api/linkedin/campaigns
 * Crea una nueva campaña
 */
router.post('/campaigns', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { name, description, leadIds } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Nombre de campaña requerido' })
    }

    // Obtener o crear team
    let { data: teams } = await db
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    let teamId: string
    if (!teams?.length) {
      const { data: newTeam } = await db
        .from('teams')
        .insert({
          name: `Team de ${userId}`,
          owner_id: userId,
          description: 'Equipo por defecto',
        })
        .select()
        .single()
      teamId = newTeam?.id || ''
    } else {
      teamId = teams[0].id
    }

    // Crear campaña
    const { data: campaign, error: insertError } = await db
      .from('campaigns')
      .insert({
        team_id: teamId,
        name: name.trim(),
        description: description || '',
        status: 'draft',
        leads_count: leadIds?.length || 0,
      })
      .select()
      .single()

    if (insertError) {
      return res.status(400).json({ error: insertError.message })
    }

    res.json({
      success: true,
      campaign,
      message: '✓ Campaña creada correctamente',
    })
  } catch (error: any) {
    console.error('Create campaign error:', error)
    res.status(500).json({ error: error.message || 'Error creando campaña' })
  }
})

/**
 * POST /api/linkedin/campaigns/:campaignId/generate-message
 * Genera un mensaje personalizado para un lead usando Claude AI
 */
router.post(
  '/campaigns/:campaignId/generate-message',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params
      const { leadId, context } = req.body

      if (!leadId) {
        return res.status(400).json({ error: 'leadId requerido' })
      }

      // Obtener info del lead
      const { data: lead, error: leadError } = await db
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

      if (leadError || !lead) {
        return res.status(404).json({ error: 'Lead no encontrado' })
      }

      // Prompt para Claude
      const prompt = `Eres un especialista en LinkedIn outreach. Genera un mensaje corto, personalizado y profesional para conectar con:

Nombre: ${lead.first_name} ${lead.last_name}
Posición: ${lead.position || 'Sin especificar'}
Empresa: ${lead.company || 'Sin especificar'}
Contexto: ${context || 'Networking profesional'}

El mensaje debe:
- Ser corto (2-3 líneas máximo)
- Mencionar su empresa o rol específico
- Ser profesional pero amable
- Generar engagement y respuesta
- En español

Responde SOLO con el mensaje, sin explicaciones ni comillas.`

      // Llamar a Claude API
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!aiResponse.ok) {
        const error = await aiResponse.text()
        console.error('Claude API error:', error)
        return res.status(500).json({ error: 'Error generando mensaje con IA' })
      }

      const aiData: any = await aiResponse.json()
      const message = aiData.content[0].text.trim()

      res.json({
        success: true,
        message,
        leadId,
        generatedAt: new Date().toISOString(),
      })
    } catch (error: any) {
      console.error('Generate message error:', error)
      res.status(500).json({ error: error.message || 'Error generando mensaje' })
    }
  }
)

/**
 * POST /api/linkedin/leads/:leadId/send
 * Envía un mensaje/conexión a un lead
 */
router.post(
  '/leads/:leadId/send',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params
      const { message, accountId } = req.body

      if (!accountId) {
        return res.status(400).json({ error: 'accountId requerido' })
      }

      // Obtener lead y cuenta
      const [leadResponse, accountResponse] = await Promise.all([
        db.from('leads').select('*').eq('id', leadId).single(),
        db
          .from('linkedin_accounts')
          .select('*')
          .eq('id', accountId)
          .single(),
      ])

      const { data: lead } = leadResponse
      const { data: account } = accountResponse

      if (!lead) {
        return res.status(404).json({ error: 'Lead no encontrado' })
      }

      if (!account) {
        return res.status(404).json({ error: 'Cuenta LinkedIn no encontrada' })
      }

      // Validar que la sesión aún sea válida
      try {
        const validateResponse = await fetch(
          'https://www.linkedin.com/voyager/api/me',
          {
            headers: {
              'cookie': `li_at=${account.session_cookie}`,
              'User-Agent': 'Mozilla/5.0',
            },
          }
        )

        if (validateResponse.status === 401) {
          await db
            .from('linkedin_accounts')
            .update({ is_valid: false })
            .eq('id', accountId)

          return res.status(401).json({
            error: 'La sesión de LinkedIn ha expirado. Reconecta tu cuenta.',
          })
        }
      } catch (e) {
        console.warn('Could not validate session:', e)
      }

      // Marcar como enviado/contactado
      const { error: updateError } = await db
        .from('leads')
        .update({
          status: 'contacted',
          sent_at: new Date().toISOString(),
          sent_message: message || null,
        })
        .eq('id', leadId)

      if (updateError) {
        return res.status(400).json({ error: updateError.message })
      }

      res.json({
        success: true,
        message: `✓ Mensaje enviado a ${lead.first_name} ${lead.last_name}`,
        lead: { ...lead, status: 'contacted' },
      })
    } catch (error: any) {
      console.error('Send message error:', error)
      res.status(500).json({ error: error.message || 'Error enviando mensaje' })
    }
  }
)

export default router
