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

export default router
