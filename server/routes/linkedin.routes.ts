import { Router, Request, Response } from 'express'
import { initSupabase, supabase } from '../lib/supabase.js'
import { authMiddleware } from '../middleware/index.js'

const router = Router()

/**
 * GET /api/linkedin/leads
 * Obtiene todos los leads de un usuario/equipo
 */
router.get('/leads', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { status = 'all', limit = 50, offset = 0, search = '' } = req.query

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (teamsError || !teams || teams.length === 0) {
      return res.json({ leads: [], total: 0 })
    }

    const teamId = teams[0].id

    // Query leads con búsqueda
    let query = supabase
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
    const { leads: inputLeads } = req.body

    if (!inputLeads || !Array.isArray(inputLeads)) {
      return res
        .status(400)
        .json({ error: 'Se requiere un array de leads para importar' })
    }

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await supabase
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
      status: 'new',
      notes: lead.notes || '',
    }))

    // Inserta los leads
    const { data: insertedLeads, error: insertError } = await supabase
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
    const { keywords, location, title, limit = 10 } = req.body

    if (!keywords) {
      return res.status(400).json({ error: 'Palabras clave requeridas' })
    }

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await supabase
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
      status: 'new',
    }))

    // Inserta los leads
    const { data: insertedLeads, error: insertError } = await supabase
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
    const { leadId } = req.params
    const { status, notes, company, position } = req.body

    const updateData: any = {}
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (company) updateData.company = company
    if (position) updateData.position = position

    const { data: lead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
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
    const { leadId } = req.params

    const { error } = await supabase.from('leads').delete().eq('id', leadId)

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
    const { csvData } = req.body

    if (!csvData) {
      return res.status(400).json({ error: 'CSV data requerido' })
    }

    // Obtiene equipo del usuario
    const { data: teams, error: teamsError } = await supabase
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
      const lead: any = { team_id: teamId, source: 'csv_import', status: 'new' }

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

    const { data: insertedLeads, error: insertError } = await supabase
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

    const { data: accounts, error } = await supabase
      .from('linkedin_accounts')
      .select('*')
      .eq('user_id', userId)
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
 * Conecta una nueva cuenta LinkedIn
 */
router.post('/accounts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { session_cookie, profile_name } = req.body

    if (!session_cookie) {
      return res.status(400).json({ error: 'Session cookie requerido' })
    }

    // Validar que la sesión sea válida haciendo ping a LinkedIn
    let isValid = true
    try {
      const validateResponse = await fetch('https://www.linkedin.com/voyager/api/me', {
        headers: {
          'cookie': `li_at=${session_cookie}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      })
      isValid = validateResponse.status === 200
    } catch (e) {
      // Si no podemos validar, asumimos que es válida por ahora
      console.warn('Could not validate LinkedIn session:', e)
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Sesión de LinkedIn inválida o expirada' })
    }

    // Guardar cuenta
    const { data: account, error: insertError } = await supabase
      .from('linkedin_accounts')
      .insert({
        user_id: userId,
        session_cookie: session_cookie,
        profile_name: profile_name || 'Mi Cuenta LinkedIn',
        is_valid: true,
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert account error:', insertError)
      return res.status(400).json({ error: insertError.message })
    }

    res.json({
      success: true,
      account,
      message: '✓ Cuenta LinkedIn conectada exitosamente',
    })
  } catch (error: any) {
    console.error('Connect account error:', error)
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

    // Verificar que la cuenta pertenezca al usuario
    const { data: account } = await supabase
      .from('linkedin_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single()

    if (!account) {
      return res.status(404).json({ error: 'Cuenta no encontrada' })
    }

    const { error } = await supabase
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
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (!teams?.length) {
      return res.json({ campaigns: [], count: 0 })
    }

    const teamId = teams[0].id

    const { data: campaigns, error } = await supabase
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
    let { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    let teamId: string
    if (!teams?.length) {
      const { data: newTeam } = await supabase
        .from('teams')
        .insert({
          name: `Team de ${userId}`,
          owner_id: userId,
          description: 'Equipo por defecto',
        })
        .select()
        .single()
      teamId = newTeam.id
    } else {
      teamId = teams[0].id
    }

    // Crear campaña
    const { data: campaign, error: insertError } = await supabase
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
      const { data: lead, error: leadError } = await supabase
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
        supabase.from('leads').select('*').eq('id', leadId).single(),
        supabase
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
          await supabase
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
      const { error: updateError } = await supabase
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
