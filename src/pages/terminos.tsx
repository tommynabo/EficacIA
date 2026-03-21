import React from "react"
import { Link } from "react-router-dom"
import { Zap } from "lucide-react"

export default function TerminosPage() {
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
        <h1 className="text-4xl font-bold mb-8">Términos y Condiciones</h1>
        <div className="prose prose-invert max-w-none text-slate-400">
          <p className="mb-4">
            Al acceder y utilizar los servicios de EficacIA, usted acepta estar sujeto a estos
            Términos y Condiciones. Si no está de acuerdo con alguna parte de los términos,
            no podrá acceder a nuestros servicios.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">1. Uso del Servicio</h2>
          <p className="mb-4">
            Nuestros servicios están diseñados para ayudar a la prospección. Usted acepta utilizar
            nuestros servicios solo para fines legales y de acuerdo con todas las leyes y regulaciones aplicables.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">2. Propiedad Intelectual</h2>
          <p className="mb-4">
            El servicio y su contenido original, características y funcionalidad son y seguirán siendo
            propiedad exclusiva de EficacIA y sus licenciantes.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">3. Limitación de Responsabilidad</h2>
          <p className="mb-4">
            En ningún caso EficacIA será responsable por daños indirectos, incidentales,
            especiales, consecuentes o punitivos resultantes del uso o la imposibilidad de uso
            de nuestros servicios.
          </p>
          <h2 className="text-2xl font-semibold text-white mt-8 mb-4">4. Cambios en los Términos</h2>
          <p className="mb-4">
            Nos reservamos el derecho de modificar o reemplazar estos Términos en cualquier momento.
            Su uso continuado del servicio después de cualquier cambio constituye la aceptación
            de los nuevos Términos.
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
