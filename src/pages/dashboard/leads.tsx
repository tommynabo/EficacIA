import React, { useState, useEffect } from 'react'
import { Card } from '@/src/components/ui/card'
import { Button } from '@/src/components/ui/button'
import { Badge } from '@/src/components/ui/badge'
import { Input } from '@/src/components/ui/input'
import { 
  Search, 
  Plus, 
  FileUp, 
  Mail, 
  CheckCircle, 
  Clock,
  Trash2,
  ArrowUpRight
} from 'lucide-react'

interface Lead {
  id: string
  first_name: string
  last_name: string
  email: string
  company: string
  position: string
  linkedin_url?: string
  status: 'new' | 'contacted' | 'qualified' | 'converted'
  source: string
  created_at: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [importing, setImporting] = useState(false)

  return (
  // Carga leads
  useEffect(() => {
    fetchLeads()
  }, [statusFilter])

  const fetchLeads = async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/api/linkedin/leads?status=${statusFilter}&limit=100&search=${search}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        }
      )
      const data = await res.json()
      setLeads(data.leads || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchLeads = async () => {
    try {
      setImporting(true)
      const res = await fetch('/api/linkedin/search-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({
          keywords: 'sales director',
          limit: 10,
        }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`✓ ${data.message}`)
        fetchLeads()
        setShowSearchModal(false)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error searching leads:', error)
      alert('Error buscando leads')
    } finally {
      setImporting(false)
    }
  }

  const importManualLeads = async () => {
    const csvData = (document.getElementById('csvInput') as HTMLTextAreaElement)?.value
    if (!csvData) {
      alert('Por favor, ingresa datos de leads')
      return
    }

    try {
      setImporting(true)
      const res = await fetch('/api/linkedin/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ csvData }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`✓ Se importaron ${data.count} leads`)
        ;(document.getElementById('csvInput') as HTMLTextAreaElement).value = ''
        fetchLeads()
        setShowImportModal(false)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error importing leads:', error)
      alert('Error importando leads')
    } finally {
      setImporting(false)
    }
  }

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/linkedin/leads/${leadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        fetchLeads()
      }
    } catch (error) {
      console.error('Error updating lead:', error)
    }
  }

  const deleteLead = async (leadId: string) => {
    if (!confirm('¿Eliminar este lead?')) return

    try {
      const res = await fetch(`/api/linkedin/leads/${leadId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
      })
      const data = await res.json()
      if (data.success) {
        fetchLeads()
      }
    } catch (error) {
      console.error('Error deleting lead:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-800'
      case 'contacted':
        return 'bg-yellow-100 text-yellow-800'
      case 'qualified':
        return 'bg-purple-100 text-purple-800'
      case 'converted':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white">🎯 Leads</h1>
          <p className="text-gray-400 mt-2">
            Gestiona y busca leads de LinkedIn para tus campañas
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setShowSearchModal(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Search className="w-4 h-4 mr-2" />
            Buscar en LinkedIn
          </Button>
          <Button
            onClick={() => setShowImportModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <FileUp className="w-4 h-4 mr-2" />
            Importar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Leads</p>
              <p className="text-2xl font-bold text-white mt-1">{leads.length}</p>
            </div>
            <Plus className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Nuevos</p>
              <p className="text-2xl font-bold text-white mt-1">
                {leads.filter(l => l.status === 'new').length}
              </p>
            </div>
            <Clock className="w-8 h-8 text-yellow-500" />
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Contactados</p>
              <p className="text-2xl font-bold text-white mt-1">
                {leads.filter(l => l.status === 'contacted').length}
              </p>
            </div>
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Convertidos</p>
              <p className="text-2xl font-bold text-white mt-1">
                {leads.filter(l => l.status === 'converted').length}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar por nombre, email, empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg font-medium"
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
      <Card className="bg-slate-900 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando leads...</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 mb-4">No hay leads aún</p>
            <p className="text-sm text-gray-500">
              Busca en LinkedIn o importa tus contactos para empezar
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Empresa
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Puesto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-800 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white font-medium">
                          {lead.first_name} {lead.last_name}
                        </p>
                        <p className="text-sm text-gray-400">{lead.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">{lead.company || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">{lead.position || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={lead.status}
                        onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                        className={`px-3 py-1 rounded-full text-sm font-medium cursor-pointer border-0 ${getStatusColor(
                          lead.status
                        )}`}
                      >
                        <option value="new">Nuevo</option>
                        <option value="contacted">Contactado</option>
                        <option value="qualified">Calificado</option>
                        <option value="converted">Convertido</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-slate-700 rounded transition"
                          >
                            <ArrowUpRight className="w-4 h-4 text-blue-500" />
                          </a>
                        )}
                        <button
                          onClick={() => deleteLead(lead.id)}
                          className="p-2 hover:bg-slate-700 rounded transition"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96 p-6 bg-slate-900 border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Buscar en LinkedIn</h2>
            <p className="text-gray-400 text-sm mb-4">
              Se buscarán 10 leads de "Sales Director" (demo para MVP)
            </p>
            <div className="flex gap-3">
              <Button
                onClick={searchLeads}
                disabled={importing}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {importing ? 'Buscando...' : 'Buscar Ahora'}
              </Button>
              <Button
                onClick={() => setShowSearchModal(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl p-6 bg-slate-900 border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Importar Leads</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Formato CSV (first_name, last_name, email, company, position)
                </label>
                <textarea
                  id="csvInput"
                  placeholder="Juan, García, juan@example.com, TechCorp, Sales Director&#10;María, López, maria@example.com, Marketing Agency, Manager"
                  className="w-full h-32 px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg placeholder-gray-500"
                />
              </div>

              <div className="text-sm text-gray-400">
                <p className="font-medium mb-2">Ejemplo de formato:</p>
                <code className="block bg-slate-800 p-3 rounded text-xs overflow-auto">
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
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
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
