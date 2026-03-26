import * as React from "react"
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom"
import { 
  BarChart3, 
  Inbox, 
  LayoutDashboard, 
  Settings, 
  Zap,
  LogOut,
  Sparkles,
  X,
  Loader2,
  Send,
} from "lucide-react"
import { cn } from "@/src/lib/utils"
import { useAuth } from "@/src/contexts/AuthContext"

const navItems = [
  { name: "Cuentas", href: "/dashboard", icon: LayoutDashboard },
  { name: "Campañas", href: "/dashboard/campaigns", icon: Zap },
  { name: "Unibox", href: "/dashboard/unibox", icon: Inbox },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Ajustes", href: "/dashboard/settings", icon: Settings },
]

export function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [assistantOpen, setAssistantOpen] = React.useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">EficacIA</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative",
                  isActive ? "text-white bg-blue-500/10 rounded-lg" : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-blue-500" : "text-slate-500")} />
                <span className="relative z-10">{item.name}</span>
              </Link>
            )
          })}

        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 w-full transition-colors"
          >
            <LogOut className="w-5 h-5 text-slate-500" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-lg font-semibold">
            {navItems.find(i => i.href === location.pathname)?.name || "Dashboard"}
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Sistema Operativo
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <Outlet />
        </div>
      </main>

      {/* ── Global AI Assistant ──────────────────────────────────── */}
      {/* Floating trigger button */}
      <button
        onClick={() => setAssistantOpen(v => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all",
          assistantOpen
            ? "bg-violet-500 hover:bg-violet-400"
            : "bg-violet-600 hover:bg-violet-500"
        )}
        title="Asistente EficacIA"
      >
        {assistantOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Sparkles className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Assistant panel */}
      {assistantOpen && (
        <GlobalAssistantPanel onClose={() => setAssistantOpen(false)} />
      )}
    </div>
  )
}

// ─── Global EficacIA Assistant Panel ─────────────────────────────────────────

interface AssistantMessage {
  role: "user" | "assistant"
  content: string
}

const QUICK_ACTIONS = [
  { label: "Generar secuencia", prompt: "Crea una secuencia de mensajes de LinkedIn para prospectar nuevos clientes. Dame 3 mensajes: conexión inicial, seguimiento a los 3 días, y cierre a los 7 días." },
  { label: "Analizar campaña semanal", prompt: "Analiza el rendimiento de mis campañas durante la última semana. ¿Qué tasa de aceptación y respuesta tengo? ¿Qué campañas están funcionando mejor y cuáles necesitan ajustes?" },
  { label: "Analíticas de campaña", prompt: "Dame un resumen de mis analíticas de campaña: número de invitaciones enviadas, aceptadas, mensajes enviados y respondidos, y recomendaciones para mejorar." },
]

function GlobalAssistantPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = React.useState<AssistantMessage[]>([
    {
      role: "assistant",
      content: "Hola, soy tu Asistente EficacIA. Puedo ayudarte a generar secuencias de mensajes, analizar campañas o responder cualquier duda. ¿En qué te puedo ayudar?",
    },
  ])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    const updated: AssistantMessage[] = [...messages, { role: "user", content: msg }]
    setMessages(updated)
    setLoading(true)
    try {
      const r = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          source: "global",
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        const errMsg =
          r.status === 403 && d.code === "NO_CREDITS"
            ? "Has agotado tus créditos IA. Ve a Ajustes → Créditos IA para recargar."
            : d.error || "Error al conectar con la IA."
        setMessages(prev => [...prev, { role: "assistant", content: errMsg }])
        return
      }
      setMessages(prev => [...prev, { role: "assistant", content: d.content }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send() }
  }

  return (
    <div className="fixed bottom-[4.5rem] right-6 z-40 w-96 max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-slate-100">EficacIA Assistant</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick action chips */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-slate-800 overflow-x-auto shrink-0 scrollbar-none">
        {QUICK_ACTIONS.map(a => (
          <button
            key={a.label}
            onClick={() => send(a.prompt)}
            disabled={loading}
            className="whitespace-nowrap text-xs px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-violet-500 text-white rounded-br-sm"
                  : "bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
              <span className="text-xs text-slate-400">Pensando…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Compose */}
      <div className="border-t border-slate-800 p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              if (textareaRef.current) {
                textareaRef.current.style.height = "auto"
                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
              }
            }}
            onKeyDown={onKey}
            placeholder="Escribe tu pregunta… (⌘↵ para enviar)"
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
            style={{ minHeight: "38px" }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 text-right">⌘↵ enviar</p>
      </div>
    </div>
  )
}
