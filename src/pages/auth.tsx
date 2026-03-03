import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Zap, AlertCircle } from "lucide-react"
import { useAuth } from "@/src/lib/auth-context"

export default function AuthPage({ mode = "login" }: { mode?: "login" | "register" }) {
  const navigate = useNavigate()
  const { login, register } = useAuth()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [formData, setFormData] = React.useState({
    email: "",
    password: "",
    name: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (mode === "login") {
        await login(formData.email, formData.password)
      } else {
        await register(formData.email, formData.password, formData.name)
      }
      navigate("/dashboard")
    } catch (err: any) {
      setError(err.message || "Error en la autenticación")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-100">
          {mode === "login" ? "Inicia sesión en tu cuenta" : "Crea tu cuenta en EficacIA"}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          O{" "}
          <Link to={mode === "login" ? "/register" : "/login"} className="font-medium text-blue-500 hover:text-blue-400 transition-colors">
            {mode === "login" ? "comienza tu prueba gratuita de 7 días" : "inicia sesión si ya tienes cuenta"}
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-4 shadow-xl shadow-black/50 sm:rounded-2xl sm:px-10 border border-slate-800">
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                  Nombre completo
                </label>
                <div className="mt-2">
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    placeholder="Juan Pérez"
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Correo electrónico
              </label>
              <div className="mt-2">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="juan@empresa.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Contraseña
              </label>
              <div className="mt-2">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
            </div>

            {mode === "login" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400">
                    Recordarme
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-medium text-blue-500 hover:text-blue-400">
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
              </div>
            )}

            <div>
              <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                {isLoading ? "Cargando..." : mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
