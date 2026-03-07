import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, MoreHorizontal, AlertCircle } from "lucide-react"

interface Campaign {
  id: string
  team_id: string
  name: string
  description: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  leads_count: number
  created_at: string
  updated_at: string
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [campaignName, setCampaignName] = React.useState("")
  const [campaignDescription, setCampaignDescription] = React.useState("")
  const [isCreating, setIsCreating] = React.useState(false)

  const fetchCampaigns = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch(`/api/linkedin/campaigns`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (!response.ok) throw new Error('Error cargando campañas')
      
      const data = await response.json()
      setCampaigns(data.campaigns || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading campaigns")
      console.error("Error fetching campaigns:", err)
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!campaignName.trim()) {
      setError("Por favor ingresa un nombre de campaña")
      return
    }

    try {
      setIsCreating(true)
      setError(null)
      
      const response = await fetch(`/api/linkedin/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          name: campaignName,
          description: campaignDescription
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error creando campaña')
      }

      const data = await response.json()
      alert('✓ Campaña creada correctamente')
      setCampaignName("")
      setCampaignDescription("")
      await fetchCampaigns()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating campaign")
      console.error("Error creating campaign:", err)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campañas</h2>
          <p className="text-slate-400">Crea y gestiona tus campañas de outreach en LinkedIn.</p>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Crear Nueva Campaña</h3>
        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Nombre de la Campaña
            </label>
            <Input
              placeholder="Ej: Prospecting Startups Tech 2026"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="bg-slate-950"
              disabled={isCreating}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descripción (opcional)
            </label>
            <Input
              placeholder="Ej: Campaña dirigida a CTOs de startups en España"
              value={campaignDescription}
              onChange={(e) => setCampaignDescription(e.target.value)}
              className="bg-slate-950"
              disabled={isCreating}
            />
          </div>
          <Button type="submit" className="gap-2" disabled={isCreating || !campaignName.trim()}>
            <Plus className="w-4 h-4" />
            {isCreating ? "Creando..." : "Crear Campaña"}
          </Button>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">NOMBRE</TableHead>
              <TableHead>ESTADO</TableHead>
              <TableHead>LEADS</TableHead>
              <TableHead>CREADA</TableHead>
              <TableHead className="text-right">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                  <div>
                    <p className="mb-2">No hay campañas aún</p>
                    <p className="text-sm">Crea tu primera campaña arriba para empezar</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="hover:bg-slate-800/50">
                  <TableCell className="font-medium">
                    {campaign.name}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={`${
                        campaign.status === 'active' 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                          : campaign.status === 'draft'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                      }`}
                    >
                      {campaign.status === 'draft' ? '📝 Borrador' : campaign.status === 'active' ? '🚀 Activa' : '⏸️ Pausada'}
                    </Badge>
                  </TableCell>
                  <TableCell>{campaign.leads_count || 0}</TableCell>
                  <TableCell className="text-slate-300 text-sm">
                    {new Date(campaign.created_at).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      title="Opciones"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
