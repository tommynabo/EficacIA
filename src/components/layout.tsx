import * as React from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { 
  BarChart3, 
  Inbox, 
  LayoutDashboard, 
  Settings, 
  Zap,
  LogOut,
  Rocket
} from "lucide-react"
import { cn } from "@/src/lib/utils"

const navItems = [
  { name: "Cuentas", href: "/dashboard", icon: LayoutDashboard },
  { name: "Campañas", href: "/dashboard/campaigns", icon: Zap },
  { name: "Unibox", href: "/dashboard/unibox", icon: Inbox },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Ajustes", href: "/dashboard/settings", icon: Settings },
]

export function DashboardLayout() {
  const location = useLocation()

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
          {/* Affiliate Program — external link */}
          <a
            href="https://eficacia.getrewardful.com/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
          >
            <Rocket className="w-5 h-5 text-amber-500" />
            <span>🚀 Programa de Afiliados</span>
          </a>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <Link to="/login" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 w-full transition-colors">
            <LogOut className="w-5 h-5 text-slate-500" />
            <span>Cerrar Sesión</span>
          </Link>
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


    </div>
  )
}
