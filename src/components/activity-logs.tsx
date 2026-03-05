import * as React from "react"
import { CheckCircle2, Loader2, AlertCircle, Info } from "lucide-react"

type LogStatus = "loading" | "success" | "error"

interface LogEntry {
  id: string
  message: string
  status: LogStatus
  timestamp: Date
}

export function ActivityLogs() {
  const [logs, setLogs] = React.useState<LogEntry[]>([
    { 
      id: "0", 
      message: "Las secuencias de automatización se mostrarán aquí cuando estén habilitadas", 
      status: "success", 
      timestamp: new Date() 
    },
  ])

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 font-mono text-xs">
      {logs.length === 0 ? (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
          <Info className="w-4 h-4 flex-shrink-0" />
          <p>No hay actividad en este momento</p>
        </div>
      ) : (
        logs.map((log) => (
          <div
            key={log.id}
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
          </div>
        ))
      )}
    </div>
  )
}
