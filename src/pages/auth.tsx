import * as React from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Zap, AlertCircle, CheckCircle2, CreditCard, Mail } from "lucide-react"
import { useAuth } from "@/src/contexts/AuthContext"

const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function AuthPage({ mode = "login" }: { mode?: "login" | "register" }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, signup, isAuthenticated } = useAuth()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Forgot-password state
  const [showForgot, setShowForgot] = React.useState(false)
  const [forgotEmail, setForgotEmail] = React.useState("")
  const [forgotLoading, setForgotLoading] = React.useState(false)
  const [forgotSuccess, setForgotSuccess] = React.useState(false)
  const [forgotError, setForgotError] = React.useState<string | null>(null)

  // Stripe Checkout data (trial-first flow)
  const sessionId = searchParams.get('session_id')
  const planFromUrl = searchParams.get('plan')
  const [stripeData, setStripeData] = React.useState<{
    email: string; name: string; customerId: string; subscriptionId: string; plan: string
  } | null>(null)
  const [loadingStripe, setLoadingStripe] = React.useState(!!sessionId)

  const [formData, setFormData] = React.useState({ email: "", password: "", fullName: "" })

  React.useEffect(() => {
    if (isAuthenticated) navigate("/dashboard")
  }, [isAuthenticated, navigate])

  // Guard: /register requires a valid Stripe session_id
  React.useEffect(() => {
    if (mode === 'register' && !sessionId) {
      navigate('/', { replace: true })
    }
  }, [mode, sessionId, navigate])

  React.useEffect(() => {
    if (sessionId && mode === 'register') {
      const fetchStripeData = async () => {
        try {
          const res = await fetch(`${API_URL}/api/payments/create-checkout-session?sessionId=${sessionId}`)
          if (!res.ok) throw new Error('No se pudo verificar el pago')
          const data = await res.json()
          setStripeData(data)
          setFormData(prev => ({ ...prev, email: data.email || '', fullName: data.name || '' }))
        } catch (err: any) {
          // Session invalid or payment not complete — send back to pricing
          navigate('/', { replace: true })
        } finally {
          setLoadingStripe(false)
        }
      }
      fetchStripeData()
    }
  }, [sessionId, mode])

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
        if (stripeData) {
          const res = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: formData.email, password: formData.password, fullName: formData.fullName,
              stripeCustomerId: stripeData.customerId, stripeSubscriptionId: stripeData.subscriptionId,
              plan: stripeData.plan || planFromUrl || 'starter',
            }),
          })
          if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.error || 'Error en registro') }
          const data = await res.json()
          if (data.token) { localStorage.setItem('auth_token', data.token); localStorage.setItem('user', JSON.stringify(data.user)) }
          await login(formData.email, formData.password)
          } else {
          // Should not reach here — guard redirects to /pricing without session_id
          navigate('/', { replace: true })
          return
        }
      }
      navigate("/dashboard")
    } catch (err: any) {
      setError(err.message || "Error en la autenticación")
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = forgotEmail.trim()
    if (!email) return
    setForgotLoading(true)
    setForgotError(null)
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar correo')
      setForgotSuccess(true)
    } catch (err: any) {
      setForgotError(err.message || 'Error al procesar la solicitud')
    } finally {
      setForgotLoading(false)
    }
  }

  if (loadingStripe) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
        <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
          <Zap className="w-7 h-7 text-white" />
        </div>
        <p className="text-slate-400 text-lg">Verificando tu pago...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-100">
          {showForgot ? "Recuperar contraseña"
            : mode === "login" ? "Inicia sesión en tu cuenta"
            : stripeData ? "Completa tu registro"
            : "Crea tu cuenta en EficacIA"}
        </h2>

        {stripeData && mode === 'register' && (
          <div className="mt-4 mx-auto max-w-sm p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-400">Pago verificado — Solo falta tu contraseña para activar tu trial de 3 días</p>
          </div>
        )}

        {/* Nav links */}
        {mode === "login" && !showForgot && (
          <p className="mt-2 text-center text-sm text-slate-400">
            ¿No tienes cuenta?{" "}
            <Link to="/pricing" className="font-medium text-blue-500 hover:text-blue-400">Elige un plan y empieza gratis</Link>
          </p>
        )}
        {mode === "register" && !stripeData && (
          <p className="mt-2 text-center text-sm text-slate-400">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="font-medium text-blue-500 hover:text-blue-400">Inicia sesión aquí</Link>{" "}o{" "}
            <Link to="/pricing" className="font-medium text-blue-500 hover:text-blue-400">prueba Stripe gratis</Link>
          </p>
        )}
        {mode === "register" && stripeData && (
          <p className="mt-2 text-center text-sm text-slate-400">
            <Link to="/login" className="font-medium text-blue-500 hover:text-blue-400">Ir a iniciar sesión</Link>
          </p>
        )}
        {showForgot && (
          <p className="mt-2 text-center text-sm text-slate-400">
            <button onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotError(null) }}
              className="font-medium text-blue-500 hover:text-blue-400">
              ← Volver al inicio de sesión
            </button>
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-4 shadow-xl shadow-black/50 sm:rounded-2xl sm:px-10 border border-slate-800">

          {/* ── Forgot Password Form ── */}
          {showForgot ? (
            <div>
              {forgotSuccess ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-slate-100 font-semibold">Correo enviado</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Si existe una cuenta con ese email, recibirás instrucciones para restablecer tu contraseña.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="mt-2 text-blue-400 hover:text-blue-300"
                    onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotEmail("") }}
                  >
                    Volver al inicio de sesión
                  </Button>
                </div>
              ) : (
                <form className="space-y-6" onSubmit={handleForgotSubmit}>
                  {forgotError && (
                    <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{forgotError}</p>
                    </div>
                  )}
                  <p className="text-sm text-slate-400">
                    Introduce tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                  </p>
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-300">
                      Correo electrónico
                    </label>
                    <div className="mt-2">
                      <Input
                        id="forgot-email"
                        type="email"
                        required
                        autoFocus
                        placeholder="juan@empresa.com"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 text-base" disabled={forgotLoading}>
                    {forgotLoading ? "Enviando..." : "Enviar enlace de recuperación"}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            /* ── Login / Register Form ── */
            <>
              {error && (
                <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>
                {mode === "register" && (
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-slate-300">Nombre completo</label>
                    <div className="mt-2">
                      <Input id="fullName" name="fullName" type="text" required placeholder="Juan Pérez"
                        value={formData.fullName} onChange={handleChange} disabled={!!stripeData?.name} />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300">Correo electrónico</label>
                  <div className="mt-2">
                    <Input id="email" name="email" type="email" autoComplete="email" required
                      placeholder="juan@empresa.com" value={formData.email} onChange={handleChange} disabled={!!stripeData?.email} />
                  </div>
                  {stripeData?.email && (
                    <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> Pre-rellenado desde tu pago en Stripe
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300">Contraseña</label>
                  <div className="mt-2">
                    <Input id="password" name="password" type="password"
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      required placeholder="••••••••" value={formData.password} onChange={handleChange} />
                  </div>
                </div>



                {mode === "login" && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <input id="remember-me" name="remember-me" type="checkbox"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900" />
                      <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400">Recordarme</label>
                    </div>
                    <div className="text-sm">
                      <button
                        type="button"
                        onClick={() => { setShowForgot(true); setError(null); setForgotEmail(formData.email) }}
                        className="font-medium text-blue-500 hover:text-blue-400"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                    {isLoading ? "Cargando..."
                      : mode === "login" ? "Iniciar Sesión"
                      : stripeData ? "Activar 3 Días de Prueba Gratis"
                      : "Crear Cuenta"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
