import * as React from "react"
import { useParams, Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Switch } from "@/src/components/ui/switch"
import { Badge } from "@/src/components/ui/badge"
import { Plus, Trash2, Bot, ArrowLeft, Save, Clock, Sparkles, X, Loader2, Send } from "lucide-react"

type StepType = "invitation" | "message"

interface SequenceStep {
  id: string
  type: StepType
  content: string
  useAI: boolean
  delayDays: number
}

export default function SequenceBuilderPage() {
  const { id } = useParams()
  const [isSaving, setIsSaving] = React.useState(false)
  const [assistantOpen, setAssistantOpen] = React.useState(false)
  // Inline AI dialog state per step
  const [aiDialogStepId, setAiDialogStepId] = React.useState<string | null>(null)
  const [aiObjective, setAiObjective] = React.useState("")
  const [aiGenerating, setAiGenerating] = React.useState(false)
  const [steps, setSteps] = React.useState<SequenceStep[]>([
    { id: "1", type: "invitation", content: "Hola {{firstName}}, me encantaría conectar contigo.", useAI: true, delayDays: 0 },
    { id: "2", type: "message", content: "Gracias por aceptar la invitación. ¿Cómo va todo en {{companyName}}?", useAI: false, delayDays: 2 }
  ])

  const handleSave = () => {
    setIsSaving(true)
    // Optimistic UI: show saving state, then revert to success
    setTimeout(() => {
      setIsSaving(false)
    }, 800)
  }

  const addStep = () => {
    setSteps([...steps, {
      id: Date.now().toString(),
      type: "message",
      content: "",
      useAI: false,
      delayDays: 1
    }])
  }

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id))
  }

  const updateStep = (id: string, updates: Partial<SequenceStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const generateForStep = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId)
    if (!step || !aiObjective.trim()) return
    setAiGenerating(true)
    try {
      const isInvitation = step.type === "invitation"
      const content = `Genera un mensaje de LinkedIn de tipo "${isInvitation ? "invitaci\u00f3n de conexi\u00f3n" : "mensaje de seguimiento"}". Objetivo del usuario: ${aiObjective.trim()}. Devuelve SOLO el texto del mensaje, sin explicaciones, sin comillas, sin sal\u00fados gen\u00e9ricos. ${isInvitation ? "IMPORTANTE: LinkedIn limita las invitaciones a 300 caracteres en total. El mensaje debe ser ultra-conciso, directo y persuasivo. Cuenta los caracteres con precisi\u00f3n." : "El mensaje puede tener varios p\u00e1rrafos cortos si el objetivo lo requiere, pero debe ser claro, personalizado y orientado a la acci\u00f3n. M\u00e1ximo 1500 caracteres."}`
      const r = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content }], stepType: isInvitation ? "invitation" : "message" }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Error")
      updateStep(stepId, { content: d.content })
      setAiDialogStepId(null)
      setAiObjective("")
    } catch (e: any) {
      alert("Error generando mensaje: " + e.message)
    } finally {
      setAiGenerating(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/campaigns">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Constructor de Secuencias</h2>
            <p className="text-slate-400">Campaña: Product Engineer - Flutter</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssistantOpen(o => !o)}
            title="EficacIA Assistant — redacta y mejora tus mensajes"
            className={`gap-2 font-medium ${
              assistantOpen
                ? "bg-violet-500 text-white border-violet-600 hover:bg-violet-600"
                : "text-violet-400 border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20"
            }`}
          >
            <span>🤖</span>
            <span>Asistente EficacIA</span>
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2 min-w-[120px]">
            <Save className={`w-4 h-4 ${isSaving ? "animate-spin" : ""}`} />
            {isSaving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Steps List */}
        <div className="lg:col-span-1 space-y-4">
          {steps.map((step, index) => (
            <div key={step.id}>
                {index > 0 && (
                  <div className="flex flex-col items-center py-2 text-slate-500">
                    <div className="h-4 w-px bg-slate-800" />
                    <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 px-3 py-1 rounded-full border border-slate-800 my-2">
                      <Clock className="w-3 h-3" />
                      Esperar {step.delayDays} {step.delayDays === 1 ? "día" : "días"}
                    </div>
                    <div className="h-4 w-px bg-slate-800" />
                  </div>
                )}
                <Card className="relative group border-slate-700 hover:border-blue-500/50 transition-colors">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-slate-900 font-mono">Paso {index + 1}</Badge>
                        <span className="text-sm font-medium capitalize text-slate-300">
                          {step.type === "invitation" ? "Invitación" : "Mensaje"}
                        </span>
                      </div>
                      {index > 0 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeStep(step.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <div className="relative">
                        <textarea
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 pb-10 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-28"
                          placeholder="Escribe tu mensaje aquí..."
                          value={step.content}
                          onChange={(e) => updateStep(step.id, { content: e.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={(e) => { e.preventDefault(); setAiDialogStepId(step.id); setAiObjective("") }}
                          className="absolute bottom-2 right-2 bg-purple-600 text-white hover:bg-blue-900 transition-colors"
                        >
                          <Sparkles className="w-4 h-4 mr-1" /> IA
                        </Button>
                        {/* AI generation dialog */}
                        {aiDialogStepId === step.id && (
                          <div className="absolute bottom-10 right-0 w-72 bg-slate-900 border border-violet-500/30 rounded-xl shadow-2xl z-30 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Sparkles className="w-4 h-4 text-violet-400" />
                              <span className="text-sm font-medium text-slate-200">EficacIA Assistant</span>
                              <span className="ml-auto text-[10px] text-slate-500">{step.type === "invitation" ? "Máx. 300 car." : "Máx. 1500 car."}</span>
                              <button onClick={() => setAiDialogStepId(null)} className="text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">¿Cuál es el objetivo de este mensaje?</p>
                            <textarea
                              value={aiObjective}
                              onChange={e => setAiObjective(e.target.value)}
                              placeholder="Ej: Agendar una demo de nuestro producto SaaS…"
                              rows={2}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none mb-3"
                            />
                            <Button
                              size="sm"
                              disabled={!aiObjective.trim() || aiGenerating}
                              onClick={() => generateForStep(step.id)}
                              className="w-full gap-2 bg-purple-600 text-white hover:bg-blue-900"
                            >
                              {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              {aiGenerating ? "Generando…" : "Generar mensaje"}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                        <div className="flex items-center gap-2">
                          <Bot className={`w-4 h-4 ${step.useAI ? "text-blue-500" : "text-slate-500"}`} />
                          <span className="text-xs font-medium text-slate-300">Personalización IA</span>
                        </div>
                        <Switch checked={step.useAI} onCheckedChange={(c) => updateStep(step.id, { useAI: c })} />
                      </div>

                      {index > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Retraso (días)</span>
                          <input 
                            type="number" 
                            min="0" 
                            className="w-16 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-sm text-center"
                            value={step.delayDays}
                            onChange={(e) => updateStep(step.id, { delayDays: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            ))}

          
          <Button variant="outline" className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 gap-2" onClick={addStep}>
            <Plus className="w-4 h-4" />
            Añadir Paso
          </Button>
        </div>

        {/* Right column: AI Assistant or empty placeholder */}
        <div className="lg:col-span-2">
          {assistantOpen ? (
            <BuilderAssistantPanel onClose={() => setAssistantOpen(false)} />
          ) : (
            <Card className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 border-dashed border-slate-700 bg-slate-900/20">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
                <Bot className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Vista Previa de IA</h3>
              <p className="text-slate-400 max-w-md">
                Selecciona un paso con "Personalización IA" activada para ver cómo EficacIA adaptará el mensaje basándose en el perfil de LinkedIn del lead.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-6 gap-2 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                onClick={() => setAssistantOpen(true)}
              >
                <span>🤖</span>
                Abrir Asistente EficacIA
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── EficacIA Assistant Panel (Sequence Builder) ───────────────────────────

interface AssistantMsg { role: "user" | "assistant"; content: string }

function BuilderAssistantPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = React.useState<AssistantMsg[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy tu EficacIA Assistant. Puedo ayudarte a redactar o mejorar los mensajes de tu secuencia, sugerir enfoques de outreach y personalizar el tono. ¿En qué empezamos?",
    },
  ])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    const next: AssistantMsg[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const r = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Error")
      setMessages(prev => [...prev, { role: "assistant", content: d.content }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="h-full min-h-[500px] flex flex-col border-violet-500/20 bg-slate-900/40">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">EficacIA Assistant</p>
            <p className="text-xs text-slate-500">Redacción y estrategia de mensajes</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-4 py-2.5 text-sm ${
              m.role === "user"
                ? "bg-violet-500 text-white rounded-br-sm"
                : "bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
              <span className="text-xs text-slate-400">Generando…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send() } }}
            rows={2}
            placeholder="Pide una mejora, un mensaje nuevo… (Cmd+Enter)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="h-10 w-10 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-40 flex items-center justify-center text-white shrink-0 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5 pl-1">Claude 3 Haiku · Cmd+Enter para enviar</p>
      </div>
    </Card>
  )
}
