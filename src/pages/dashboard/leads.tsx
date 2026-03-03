import * as React from "react"
import { useParams } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { CheckCircle2, XCircle, AlertCircle, Send, MessageSquare } from "lucide-react"
import { useLeads } from "@/src/lib/hooks"

export default function LeadsPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const { leads, isLoading, error, fetchLeads, sendLead, sendAllLeads } = useLeads(campaignId || "")

  React.useEffect(() => {
    if (campaignId) {
      fetchLeads()
    }
  }, [campaignId, fetchLeads])

  const handleSendLead = async (leadId: string) => {
    try {
      await sendLead(leadId)
      await fetchLeads()
    } catch (err) {
      console.error("Error sending lead:", err)
    }
  }

  const handleSendAll = async () => {
    try {
      await sendAllLeads()
      await fetchLeads()
    } catch (err) {
      console.error("Error sending all leads:", err)
    }
  }

  if (!campaignId) {
    return (
      <div className="space-y-6">
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">No se pudo cargar la campaña</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leads</h2>
          <p className="text-slate-400">Monitoriza y controla el envío de mensajes.</p>
        </div>
        <Button 
          className="gap-2" 
          onClick={handleSendAll}
          disabled={isLoading || leads.length === 0}
        >
          <Send className="w-4 h-4" />
          Enviar Todos
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
              <TableHead className="w-[200px]">NOMBRE</TableHead>
              <TableHead>POSICIÓN</TableHead>
              <TableHead>EMPRESA</TableHead>
              <TableHead className="w-[300px]">MENSAJE</TableHead>
              <TableHead>ESTADO</TableHead>
              <TableHead className="text-right">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  <div>
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                    <p className="mb-4">No hay leads aún</p>
                    <p className="text-sm">Inicia una búsqueda en LinkedIn para agregar leads</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-slate-800/50">
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-slate-300">{lead.title || "N/A"}</TableCell>
                  <TableCell className="text-slate-300">{lead.company || "N/A"}</TableCell>
                  <TableCell className="text-sm text-slate-300">
                    {lead.ai_message ? (
                      <div className="truncate" title={lead.ai_message}>{lead.ai_message}</div>
                    ) : (
                      <span className="text-slate-500">Generando mensaje...</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.status === "sent" ? (
                      <Badge variant="success" className="gap-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Enviado
                      </Badge>
                    ) : lead.status === "rejected" ? (
                      <Badge variant="destructive" className="gap-1 bg-red-500/10 border-red-500/20 text-red-400">
                        <XCircle className="w-3 h-3" />
                        Rechazado
                      </Badge>
                    ) : lead.status === "pending" ? (
                      <Badge variant="secondary" className="gap-1 bg-slate-700 text-slate-300">
                        <AlertCircle className="w-3 h-3" />
                        Pendiente
                      </Badge>
                    ) : (
                      <Badge variant="outline">{lead.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {lead.status === "pending" && lead.ai_message && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => handleSendLead(lead.id)}
                      >
                        <Send className="w-4 h-4" />
                        Enviar
                      </Button>
                    )}
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
