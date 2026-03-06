import * as React from "react"
import { Loader, Linkedin } from "lucide-react"

/**
 * ConnectLinkedInButton
 * 
 * Botón de conexión de LinkedIn vía Unipile.
 * Al hacer clic:
 *  1. Llama a /api/unipile/generate-link para obtener la URL segura
 *  2. Abre la URL en una nueva pestaña (o redirige) para que el usuario
 *     introduzca sus credenciales de LinkedIn de forma segura en Unipile
 *  3. Unipile maneja credenciales, 2FA, proxies — nosotros recibimos
 *     el resultado por webhook
 * 
 * Props:
 * - onSuccess: callback opcional cuando se genera el link correctamente
 * - onError: callback opcional para manejar errores
 * - className: clases CSS adicionales
 * - redirect: si true, redirige en la misma pestaña en vez de abrir una nueva
 */

interface ConnectLinkedInButtonProps {
  onSuccess?: (url: string) => void
  onError?: (error: string) => void
  className?: string
  redirect?: boolean
}

export default function ConnectLinkedInButton({
  onSuccess,
  onError,
  className = "",
  redirect = false,
}: ConnectLinkedInButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleConnect = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const token = localStorage.getItem("auth_token")
      if (!token) {
        const msg = "Debes iniciar sesión primero."
        setError(msg)
        onError?.(msg)
        return
      }

      // Llamar al endpoint para generar el link de Unipile
      const response = await fetch("/api/unipile", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (!response.ok) {
        const msg = data.error || "Error al generar el enlace de conexión."
        setError(msg)
        onError?.(msg)
        return
      }

      if (!data.url) {
        const msg = "No se recibió la URL de conexión."
        setError(msg)
        onError?.(msg)
        return
      }

      // Éxito: abrir la URL segura de Unipile
      onSuccess?.(data.url)

      if (redirect) {
        // Redirigir en la misma pestaña
        window.location.href = data.url
      } else {
        // Abrir en nueva pestaña
        window.open(data.url, "_blank", "noopener,noreferrer")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red. Inténtalo de nuevo."
      setError(msg)
      onError?.(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className={`
          inline-flex items-center justify-center gap-2.5
          px-5 py-2.5 rounded-lg
          font-medium text-sm
          text-white
          bg-[#0A66C2] hover:bg-[#004182]
          disabled:opacity-60 disabled:cursor-not-allowed
          transition-all duration-200
          shadow-md hover:shadow-lg
          focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/50 focus:ring-offset-2 focus:ring-offset-slate-900
          ${className}
        `}
      >
        {isLoading ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            <span>Generando enlace seguro...</span>
          </>
        ) : (
          <>
            <Linkedin className="w-4 h-4" />
            <span>Conectar LinkedIn</span>
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-red-400 max-w-sm">
          {error}
        </p>
      )}
    </div>
  )
}
