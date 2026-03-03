import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { ProgressRing } from "@/src/components/ui/progress-ring"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, MoreHorizontal, Flame, AlertCircle, Trash2 } from "lucide-react"
import { api } from "@/src/lib/api"

interface LinkedInAccount {
  id: string
  user_id: string
  profile_name: string
  session_cookie: string
  is_valid: boolean
  created_at: string
}

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sessionCookie, setSessionCookie] = React.useState("")
  const [isConnecting, setIsConnecting] = React.useState(false)

  const fetchAccounts = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await api.getLinkedInAccounts()
      setAccounts(response.accounts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading accounts")
      console.error("Error fetching accounts:", err)
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => {
    fetchAccounts()
  }, [])

  const handleConnectAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!sessionCookie.trim()) {
      setError("Por favor ingresa la cookie de sesión")
      return
    }

    try {
      setIsConnecting(true)
      setError(null)
      await api.connectLinkedInAccount(sessionCookie)
      setSessionCookie("")
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting account")
      console.error("Error connecting account:", err)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("¿Estás seguro de que deseas desconectar esta cuenta?")) {
      return
    }

    try {
      setError(null)
      // Assuming there's a delete account endpoint
      await api.request("DELETE", `/api/linkedin/accounts/${accountId}`)
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error disconnecting account")
      console.error("Error disconnecting account:", err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cuentas</h2>
          <p className="text-slate-400">Gestiona tus cuentas de LinkedIn conectadas.</p>
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
        <h3 className="text-lg font-semibold mb-4">Conectar Nueva Cuenta</h3>
        <form onSubmit={handleConnectAccount} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Cookie de Sesión (li_at)
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Pega tu cookie de sesión de LinkedIn..."
                value={sessionCookie}
                onChange={(e) => setSessionCookie(e.target.value)}
                className="flex-1 bg-slate-950"
                disabled={isConnecting}
              />
              <Button 
                type="submit" 
                className="gap-2"
                disabled={isConnecting || !sessionCookie.trim()}
              >
                <Plus className="w-4 h-4" />
                {isConnecting ? "Conectando..." : "Conectar"}
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Instrucciones: Abre LinkedIn, abre DevTools (F12), ve a Application &gt; Cookies, copia el valor de "li_at"
            </p>
          </div>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">NOMBRE DE PERFIL</TableHead>
              <TableHead>ESTADO</TableHead>
              <TableHead>FECHA DE CONEXIÓN</TableHead>
              <TableHead className="text-right">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-slate-400">
                  <div>
                    <Flame className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                    <p className="mb-4">No hay cuentas conectadas</p>
                    <p className="text-sm">Conecta tu primera cuenta de LinkedIn arriba</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-slate-800/50">
                  <TableCell className="font-medium">
                    {account.profile_name}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={account.is_valid ? "success" : "destructive"}
                      className={`gap-1 ${account.is_valid 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                        : "bg-red-500/10 border-red-500/20 text-red-400"}`}
                    >
                      {account.is_valid ? "Activa" : "Inválida"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-300">
                    {new Date(account.created_at).toLocaleDateString("es-ES")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDisconnect(account.id)}
                    >
                      <Trash2 className="w-4 h-4" />
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
