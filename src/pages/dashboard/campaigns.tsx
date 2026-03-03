import * as React from "react"
import { Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, Play, Pause, MoreHorizontal, Clock, ArrowUpRight, CheckCircle2, AlertCircle } from "lucide-react"
import { useCampaigns } from "@/src/lib/hooks"

export default function CampaignsPage() {
  const { campaigns, isLoading, error, fetchCampaigns, pauseCampaign, resumeCampaign } = useCampaigns()

  React.useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const handleToggleStatus = async (campaignId: string, currentStatus: string) => {
    try {
      if (currentStatus === "running") {
        await pauseCampaign(campaignId)
      } else {
        await resumeCampaign(campaignId)
      }
      await fetchCampaigns()
    } catch (err) {
      console.error("Error updating campaign status:", err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campañas</h2>
          <p className="text-slate-400">Monitoriza el rendimiento de tus secuencias.</p>
        </div>
        <Button className="gap-2" asChild>
          <Link to="/dashboard/campaigns/new">
            <Plus className="w-4 h-4" />
            Crear Campaña
          </Link>
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">NOMBRE</TableHead>
              <TableHead>ESTADO</TableHead>
              <TableHead>PROGRESO</TableHead>
              <TableHead>ACEPTADAS</TableHead>
              <TableHead>TASA ACEPTACIÓN</TableHead>
              <TableHead className="text-right">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  <div>
                    <p className="mb-4">No hay campañas aún</p>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/dashboard/campaigns/new">Crear Primera Campaña</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => {
                const acceptanceRate = campaign.sent_count > 0 
                  ? ((campaign.accepted_count / campaign.sent_count) * 100).toFixed(1)
                  : 0
                
                return (
                  <TableRow key={campaign.id} className="cursor-pointer hover:bg-slate-800/50">
                    <TableCell className="font-medium">
                      <Link to={`/dashboard/campaigns/${campaign.id}`} className="hover:underline">
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={campaign.status === "running" ? "success" : campaign.status === "paused" ? "secondary" : "destructive"} 
                        className="uppercase"
                      >
                        {campaign.status === "running" ? "Activa" : campaign.status === "paused" ? "Pausada" : "Error"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1 bg-slate-900">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {campaign.leads_count}
                        </Badge>
                        <Badge variant="outline" className="gap-1 bg-blue-500/10 border-blue-500/20 text-blue-400">
                          <ArrowUpRight className="w-3 h-3" />
                          {campaign.sent_count}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        {campaign.accepted_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{acceptanceRate}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => handleToggleStatus(campaign.id, campaign.status)}
                        >
                          {campaign.status === "running" ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link to={`/dashboard/campaigns/${campaign.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
