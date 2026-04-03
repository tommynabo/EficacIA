import React, { useState, useEffect } from 'react'
import { Card } from '@/src/components/ui/card'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Badge } from '@/src/components/ui/badge'
import { Skeleton } from '@/src/components/ui/skeleton'
import {
  Search,
  Plus,
  FileUp,
  Mail,
  CheckCircle,
  Clock,
  Trash2,
  ArrowUpRight,
  AlertCircle,
  Send,
  MoreHorizontal
} from 'lucide-react'



interface Lead {
  id: string
  team_id: string
  first_name: string
  last_name: string
  email: string
  company: string
  position: string
  linkedin_url?: string
  status: 'new' | 'contacted' | 'qualified' | 'converted'
  sent_message: false
  sent_at: string | null
  created_at: string
  conversation_temperature?: string
  sequence_status?: string
  error_message?: string | null
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null)

  useEffect(() => {
    fetchLeads()
  }, [statusFilter])

  const fetchLeads = async () => {
    try {
      setLoading(true)
      setError(null)
      const query = new URLSearchParams({
        status: statusFilter !== 'all' ? statusFilter : '',
        search: search,
        limit: '100'
      })

      const response = await fetch(`/api/linkedin/leads?${query}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (!response.ok) throw new Error('Error cargando leads')

      const data = await response.json()
      setLeads(Array.isArray(data) ? data : data.leads || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando leads')
      console.error('Error fetching leads:', err)
    } finally {
      setLoading(false)
    }
  }

  const importManualLeads = async () => {
    const csvData = (document.getElementById('csvInput') as HTMLTextAreaElement)?.value
    if (!csvData) {
      setError('Por favor, ingresa datos de leads')
      return
    }

    try {
      setImporting(true)
      setError(null)

      const response = await fetch(`/api/linkedin/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ csvData })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error importando leads')
      }

      const data = await response.json()
      alert(`✓ Se importaron ${data.imported || 0} leads`)
        ; (document.getElementById('csvInput') as HTMLTextAreaElement).value = ''
      fetchLeads()
      setShowImportModal(false)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error importando leads'
      setError(errorMsg)
      console.error('Error importing leads:', err)
    } finally {
      setImporting(false)
    }
  }

  const sendMessageToLead = async (leadId: string) => {
    try {
      setSendingLeadId(leadId)
      setError(null)

      const response = await fetch(`/api/linkedin/leads?id=${leadId}&action=send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error enviando mensaje')
      }

      alert('✓ Mensaje enviado correctamente')
      fetchLeads()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error enviando mensaje'
      setError(errorMsg)
      console.error('Error sending message:', err)
    } finally {
      setSendingLeadId(null)
    }
  }

  const deleteLead = async (leadId: string) => {
    if (!confirm('¿Eliminar este lead?')) return

    try {
      setError(null)
      const response = await fetch(`/api/linkedin/leads?id=${leadId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (!response.ok) throw new Error('Error eliminando lead')

      alert('✓ Lead eliminado')
      fetchLeads()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error eliminando lead'
      setError(errorMsg)
      console.error('Error deleting lead:', err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400'
      case 'contacted':
        return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
      case 'qualified':
        return 'bg-purple-500/10 border-purple-500/20 text-purple-400'
      case 'converted':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      default:
        return 'bg-slate-500/10 border-slate-500/20 text-slate-400'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'new':
        return '📝 Nuevo'
      case 'contacted':
        return '📧 Contactado'
      case 'qualified':
        return '⭐ Calificado'
      case 'converted':
        return '✓ Convertido'
      default:
        return status
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leads</h2>
          <p className="text-slate-400 mt-1">Gestiona y contacta con tus leads potenciales</p>
        </div>
        <Button
          onClick={() => setShowImportModal(true)}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          AÑADIR LEADS
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 bg-slate-900 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Leads</p>
              <p className="text-2xl font-bold text-white mt-1">{leads.length}</p>
            </div>
            <Plus className="w-8 h-8 text-blue-500/50" />
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Nuevos</p>
              <p className="text-2xl font-bold text-white mt-1">
                {leads.filter(l => l.status === 'new').length}
              </p>
            </div>
            <Clock className="w-8 h-8 text-yellow-500/50" />
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Contactados</p>
              <p className="text-2xl font-bold text-white mt-1">
                {leads.filter(l => l.status === 'contacted').length}
              </p>
            </div>
            <Mail className="w-8 h-8 text-blue-500/50" />
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Convertidos</p>
              <p className="text-2xl font-bold text-white mt-1">
                {leads.filter(l => l.status === 'converted').length}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-500/50" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar por nombre, cargo, empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-950 border-slate-800"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-slate-950 border border-slate-800 text-white rounded-md font-medium"
        >
          <option value="all">Todos los estados</option>
          <option value="new">Nuevos</option>
          <option value="contacted">Contactados</option>
          <option value="qualified">Calificados</option>
          <option value="converted">Convertidos</option>
        </select>
        <Button onClick={fetchLeads} variant="outline">
          Filtrar
        </Button>
      </div>

      {/* Leads Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 mb-4">
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400 mb-2 uppercase font-medium">SIN LEADS</p>
            <p className="text-sm text-slate-500">
              Añade contactos para empezar a enviar mensajes
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Contacto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Empresa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Puesto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Temp</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Mensaje</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leads
                  .filter(lead => {
                    if (!search.trim()) return true
                    const q = search.toLowerCase()
                    return (
                      `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(q) ||
                      (lead.position || '').toLowerCase().includes(q) ||
                      (lead.company || '').toLowerCase().includes(q) ||
                      (lead.email || '').toLowerCase().includes(q)
                    )
                  })
                  .map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white font-medium">
                          {lead.first_name} {lead.last_name}
                        </p>
                        <p className="text-sm text-slate-400">{lead.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white">{lead.company || '-'}</td>
                    <td className="px-6 py-4 text-white">{lead.position || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={getStatusColor(lead.status)}>
                          {getStatusLabel(lead.status)}
                        </Badge>
                        {(lead.sequence_status === 'failed' || lead.sequence_status === 'retry_later') && lead.error_message && (
                          <div className="relative group inline-flex items-center">
                            <AlertCircle
                              className={`w-4 h-4 cursor-default shrink-0 ${
                                lead.sequence_status === 'failed' ? 'text-red-500' : 'text-orange-400'
                              }`}
                            />
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl text-center whitespace-normal">
                              {lead.error_message}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-700" />
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {lead.conversation_temperature === 'hot' && (
                        <span
                          title="🔥 Caliente — El lead quiere agendar o pide información"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-500/15 text-red-400 rounded-full border border-red-500/20 cursor-default"
                        >
                          🔥 Caliente
                        </span>
                      )}
                      {lead.conversation_temperature === 'warm' && (
                        <span
                          title="☀️ Tibio — Responde pero con dudas, está evaluando"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-500/15 text-orange-400 rounded-full border border-orange-500/20 cursor-default"
                        >
                          ☀️ Tibio
                        </span>
                      )}
                      {lead.conversation_temperature === 'cold' && (
                        <span
                          title="❄️ Frío — Sin respuesta o sin interés aparente"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-sky-500/15 text-sky-400 rounded-full border border-sky-500/20 cursor-default"
                        >
                          ❄️ Frío
                        </span>
                      )}
                      {!lead.conversation_temperature && (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {lead.sent_message ? (
                        <span className="text-sm text-emerald-400">✓ Enviado</span>
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        {!lead.sent_message && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => sendMessageToLead(lead.id)}
                            disabled={sendingLeadId === lead.id}
                            title="Enviar mensaje"
                          >
                            <Send className="w-4 h-4 text-blue-500" />
                          </Button>
                        )}
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-slate-700 rounded transition"
                            title="Abrir en LinkedIn"
                          >
                            <ArrowUpRight className="w-4 h-4 text-slate-400" />
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => deleteLead(lead.id)}
                          title="Eliminar lead"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">AÑADIR LEADS</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Formato CSV (first_name, last_name, email, company, position)
                </label>
                <textarea
                  id="csvInput"
                  placeholder="Juan, García, juan@example.com, TechCorp, Sales Director&#10;María, López, maria@example.com, Marketing Agency, Manager"
                  className="w-full h-32 px-4 py-2 bg-slate-950 border border-slate-800 text-white rounded-lg placeholder-slate-600"
                />
              </div>

              <div className="text-sm text-slate-400">
                <p className="font-medium mb-2">Ejemplo de formato:</p>
                <code className="block bg-slate-950 p-3 rounded text-xs overflow-auto border border-slate-800">
                  {`first_name,last_name,email,company,position
Juan,García,juan@example.com,TechCorp,Sales Director
María,López,maria@example.com,Marketing Agency,Manager`}
                </code>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={importManualLeads}
                disabled={importing}
                className="flex-1"
              >
                {importing ? 'Importando...' : 'Importar'}
              </Button>
              <Button
                onClick={() => setShowImportModal(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
