import React from "react"
import { Link } from "react-router-dom"
import { Zap, Shield } from "lucide-react"

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <nav className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">EficacIA</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-bold mb-8">Política de Privacidad</h1>
        <div className="prose prose-invert max-w-none text-slate-400">
          <p className="mb-4">
            En EficacIA, valoramos su privacidad y nos comprometemos a proteger su información personal.
            Esta Política de Privacidad explica cómo recopilamos, utilizamos y compartimos información
            cuando utiliza nuestros servicios.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">1. Información que Recopilamos</h2>
          <p className="mb-4">
            Recopilamos información que usted nos proporciona directamente, como cuando crea una cuenta,
            actualiza su perfil o se comunica con nosotros. También recopilamos información automáticamente
            cuando utiliza nuestros servicios.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">2. Uso de la Información</h2>
          <p className="mb-4">
            Utilizamos la información recopilada para proporcionar, mantener y mejorar nuestros servicios,
            así como para personalizar su experiencia y comunicarnos con usted.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">3. Compartir Información</h2>
          <p className="mb-4">
            No compartimos su información personal con terceros, excepto cuando sea necesario para
            proporcionar nuestros servicios, cumplir con la ley o proteger nuestros derechos.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">4. Seguridad</h2>
          <p className="mb-4">
            Tomamos medidas razonables para ayudar a proteger la información sobre usted contra pérdida,
            robo, uso indebido, acceso no autorizado, divulgación, alteración y destrucción.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-800/60 py-10 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">EficacIA</span>
          </Link>
          <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} EficacIA</p>
        </div>
      </footer>
    </div>
  )
}
