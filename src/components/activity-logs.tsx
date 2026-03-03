import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"

type LogStatus = "loading" | "success" | "error"

interface LogEntry {
  id: string
  message: string
  status: LogStatus
  timestamp: Date
}

export function ActivityLogs() {
  const [logs, setLogs] = React.useState<LogEntry[]>([
    { id: "1", message: "Iniciando secuencia para 'Product Engineer'...", status: "success", timestamp: new Date(Date.now() - 10000) },
    { id: "2", message: "Extrayendo perfiles de búsqueda...", status: "success", timestamp: new Date(Date.now() - 8000) },
    { id: "3", message: "Generando mensaje personalizado para Juan Pérez...", status: "loading", timestamp: new Date(Date.now() - 2000) },
  ])

  // Simulate real-time logs
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setLogs(prev => {
        const newLogs = [...prev]
        const loadingIndex = newLogs.findIndex(l => l.status === "loading")
        if (loadingIndex !== -1) {
          newLogs[loadingIndex] = { ...newLogs[loadingIndex], status: "success" }
        }
        newLogs.push({
          id: Date.now().toString(),
          message: "Enviando invitación a Juan Pérez...",
          status: "loading",
          timestamp: new Date()
        })
        return newLogs.slice(-10) // Keep last 10
      })
    }, 5000)
    return () => clearTimeout(timer)
  }, [logs])

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 font-mono text-xs">
      <AnimatePresence initial={false}>
        {logs.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3 rounded-md bg-slate-900/50 border border-slate-800"
          >
            <div className="mt-0.5 shrink-0">
              {log.status === "loading" && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
              {log.status === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              {log.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-300 leading-relaxed">{log.message}</p>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
