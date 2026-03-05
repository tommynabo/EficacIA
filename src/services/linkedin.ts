export class LinkedInService {
  private static baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

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

    const response = await fetch(`${this.baseUrl}/api/linkedin/leads?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Response not OK:', response.status, text)
      throw new Error(`Error obteniendo leads: ${response.status}`)
    }
    return response.json()
  }

  /**
   * Busca leads en LinkedIn
   */
  static async searchLeads(keywords: string, location?: string, title?: string, limit = 10) {
    const response = await fetch(`${this.baseUrl}/api/linkedin/search-leads`, {
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
    const response = await fetch(`${this.baseUrl}/api/linkedin/import-leads`, {
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
    const response = await fetch(`${this.baseUrl}/api/linkedin/bulk-import`, {
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
    const response = await fetch(`${this.baseUrl}/api/linkedin/leads/${leadId}`, {
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
    const response = await fetch(`${this.baseUrl}/api/linkedin/leads/${leadId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })

    if (!response.ok) throw new Error('Error eliminando lead')
    return response.json()
  }
}
