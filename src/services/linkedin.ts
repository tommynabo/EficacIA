export class LinkedInService {
  private static baseUrl = '/api/linkedin'

  /**
   * Obtiene todos los leads del usuario
   */
  static async getLeads(status = 'all', limit = 50, offset = 0, search = '') {
    const params = new URLSearchParams({
      status,
      limit: String(limit),
      offset: String(offset),
      search,
    })

    const response = await fetch(`${this.baseUrl}/leads?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })

    if (!response.ok) throw new Error('Error obteniendo leads')
    return response.json()
  }

  /**
   * Busca leads en LinkedIn
   */
  static async searchLeads(keywords: string, location?: string, title?: string, limit = 10) {
    const response = await fetch(`${this.baseUrl}/search-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify({
        keywords,
        location,
        title,
        limit,
      }),
    })

    if (!response.ok) throw new Error('Error buscando leads')
    return response.json()
  }

  /**
   * Importa leads manualmente
   */
  static async importLeads(leads: any[]) {
    const response = await fetch(`${this.baseUrl}/import-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify({ leads }),
    })

    if (!response.ok) throw new Error('Error importando leads')
    return response.json()
  }

  /**
   * Importa leads desde CSV
   */
  static async bulkImportCSV(csvData: string) {
    const response = await fetch(`${this.baseUrl}/bulk-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify({ csvData }),
    })

    if (!response.ok) throw new Error('Error importando CSV')
    return response.json()
  }

  /**
   * Actualiza el estado de un lead
   */
  static async updateLead(leadId: string, updates: any) {
    const response = await fetch(`${this.baseUrl}/leads/${leadId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) throw new Error('Error actualizando lead')
    return response.json()
  }

  /**
   * Elimina un lead
   */
  static async deleteLead(leadId: string) {
    const response = await fetch(`${this.baseUrl}/leads/${leadId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })

    if (!response.ok) throw new Error('Error eliminando lead')
    return response.json()
  }
}
