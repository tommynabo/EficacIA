import * as React from "react"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"
import { Badge } from "@/src/components/ui/badge"
import { Skeleton } from "@/src/components/ui/skeleton"
import { Plus, Flame, AlertCircle, Trash2, Loader, CheckCircle2, Chrome } from "lucide-react"

interface LinkedInAccount {
  id: string
  team_id: string
  username: string
  profile_name: string
  is_valid: boolean
  created_at: string
}

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LinkedInAccount[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [connectingStep, setConnectingStep] = React.useState("")

  const fetchAccounts = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/linkedin/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error cargando cuentas')
      }
      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading accounts")
    } finally {
      setIsLoading(false)
    }
  }

  React.useEffect(() => {
    fetchAccounts()
  }, [])

  const handleConnectAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError("Por favor ingresa email y contraseña de LinkedIn")
      return
    }

    try {
      setIsConnecting(true)
      setError(null)
      setSuccess(null)
      setConnectingStep("Iniciando navegador en la nube...")

      const token = localStorage.getItem('auth_token')

      setTimeout(() => setConnectingStep("Abriendo LinkedIn..."), 3000)
      setTimeout(() => setConnectingStep("Verificando credenciales..."), 8000)
      setTimeout(() => setConnectingStep("Obteniendo sesión..."), 15000)

      const response = await fetch('/api/linkedin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ linkedin_email: email, linkedin_password: password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error conectando cuenta')
      }

      setSuccess(data.message || '✓ Cuenta conectada exitosamente')
      setEmail("")
      setPassword("")
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting account")
    } finally {
      setIsConnecting(false)
      setConnectingStep("")
    }
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("¿Desconectar esta cuenta?")) return
    try {
      setError(null)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/linkedin/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error desconectando cuenta')
      }
      setSuccess('✓ Cuenta desconectada')
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error disconnecting account")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cuentas LinkedIn</h2>
        <p className="text-slate-400">Conecta tus cuentas con email y contraseña. El proceso es 100% automático.</p>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </Card>
      )}

      {success && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-emerald-400">{success}</p>
          </div>
        </Card>
      )}

      <Card className="p-6 border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Chrome className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold">Conectar Cuenta LinkedIn</h3>
        </div>
        <form onSubmit={handleConnectAccount} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email de LinkedIn
              </label>
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-950"
                disabled={isConnecting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Contraseña
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-950"
                disabled={isConnecting}
              />
            </div>
          </div>

          {isConnecting && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <Loader className="w-4 h-4 animate-spin text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-400">{connectingStep || "Procesando..."}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={isConnecting || !email.trim() || !password.trim()}
          >
            {isConnecting ? (
              <><Loader className="w-4 h-4 animate-spin" /> Conectando (puede tardar ~30s)...</>
            ) : (
              <><Plus className="w-4 h-4" /> Conectar con LinkedIn</>
            )}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            Un navegador automatizado en la nube inicia sesión de forma segura en tu nombre.
          </p>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PERFIL</TableHead>
              <TableHead>ESTADO</TableHead>
              <TableHead>CONECTADA</TableHead>
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
                  <Flame className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="mb-2">No hay cuentas conectadas</p>
                  <p className="text-sm">Conecta tu primera cuenta arriba</p>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-slate-800/50">
                  <TableCell className="font-medium">{account.profile_name || account.username}</TableCell>
                  <TableCell>
                    <Badge className={`gap-1 ${account.is_valid
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                      {account.is_valid ? "✓ Activa" : "⚠ Inválida"}
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
