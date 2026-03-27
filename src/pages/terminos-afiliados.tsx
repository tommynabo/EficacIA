import React from "react"
import { Link } from "react-router-dom"
import { Zap } from "lucide-react"

export default function TerminosAfiliadosPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {/* Navbar */}
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

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-bold mb-3">Términos y Condiciones del Programa de Afiliados</h1>
        <p className="text-slate-500 text-sm mb-12">Última actualización: {new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="space-y-10 text-slate-400">

          {/* Sección 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Naturaleza del Programa</h2>
            <p className="leading-relaxed">
              Al registrarte como afiliado de EficacIA, obtienes el derecho a promocionar nuestra plataforma
              mediante un enlace de seguimiento único. Por cada nuevo cliente recurrente que se registre y pague
              a través de tu enlace, recibirás una comisión mensual mientras el cliente mantenga su suscripción activa.
            </p>
          </section>

          {/* Sección 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Cálculo de Comisiones (Transparencia Financiera)</h2>
            <p className="leading-relaxed mb-4">
              En EficacIA ofrecemos una comisión del <span className="text-white font-semibold">30% recurrente</span>,
              calculada de forma 100% transparente.
            </p>
            <p className="leading-relaxed mb-4">
              Para poder ofrecer la tecnología de automatización e Inteligencia Artificial más avanzada del mercado,
              EficacIA asume unos costes operativos fijos por cada cuenta (servidores, uso de APIs externas de IA y Unipile).
              Por tanto, la comisión del 30% se calcula sobre el{" "}
              <span className="text-white font-semibold">Beneficio Neto</span> de la venta (Precio del Plan − Costes
              Operativos), y no sobre la facturación bruta.
            </p>

            {/* Ejemplo práctico */}
            <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-6 mt-6">
              <p className="text-sm font-semibold text-indigo-400 uppercase tracking-wider mb-4">
                Ejemplo práctico · Plan Growth (79€/mes)
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-slate-400">Precio de venta</span>
                  <span className="text-slate-200 font-medium">79€</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Costes operativos fijos de la cuenta</span>
                  <span className="text-red-400 font-medium">−30€</span>
                </li>
                <li className="flex justify-between border-t border-slate-700/60 pt-2 mt-2">
                  <span className="text-slate-400">Beneficio neto</span>
                  <span className="text-slate-200 font-medium">49€</span>
                </li>
                <li className="flex justify-between border-t border-slate-700/60 pt-2 mt-2">
                  <span className="text-white font-semibold">Tu comisión (30%)</span>
                  <span className="text-emerald-400 font-bold text-base">14,70€ / mes</span>
                </li>
              </ul>
            </div>

            <p className="leading-relaxed mt-6">
              Esta estructura nos permite mantener un negocio saludable y asegurarnos de que podemos pagarte
              tus comisiones de por vida sin fallar. Los <span className="text-white font-medium">Add-ons</span>{" "}
              (compras de cuentas extra de LinkedIn) no generan comisión de afiliado.
            </p>
          </section>

          {/* Sección 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. Condiciones de Pago (Payouts)</h2>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <p className="leading-relaxed">
                  <span className="text-white font-semibold">Ventana de retención:</span>{" "}
                  Las comisiones generadas se retienen durante 30 días para evitar fraudes o reembolsos.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <p className="leading-relaxed">
                  <span className="text-white font-semibold">Umbral mínimo:</span>{" "}
                  Para poder retirar tus comisiones, debes acumular un mínimo de{" "}
                  <span className="text-white font-medium">100€</span> en tu saldo.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <p className="leading-relaxed">
                  <span className="text-white font-semibold">Método de pago:</span>{" "}
                  Los pagos se realizarán automáticamente a través de Rewardful.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <p className="leading-relaxed">
                  <span className="text-white font-semibold">Duración de la Cookie:</span>{" "}
                  Si un usuario hace clic en tu enlace, la cookie dura 30 días. Si compra dentro de ese
                  periodo, la venta es tuya.
                </p>
              </li>
            </ul>
          </section>

          {/* Sección 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Prácticas Prohibidas</h2>
            <p className="leading-relaxed">
              Nos reservamos el derecho de expulsar a cualquier afiliado y cancelar comisiones si detectamos:
              auto-referencias, spam B2B indiscriminado, o suplantación de la identidad de la marca EficacIA.
            </p>
          </section>

          {/* Sección 5 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Modificaciones</h2>
            <p className="leading-relaxed">
              EficacIA se reserva el derecho de modificar la estructura de precios o comisiones para adaptarse
              al mercado, notificando siempre con antelación.
            </p>
          </section>

        </div>

        <div className="mt-14 pt-8 border-t border-slate-800/60">
          <Link to="/afiliados" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Volver al Programa de Afiliados
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-10 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">EficacIA</span>
          </Link>
          <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} EficacIA. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
