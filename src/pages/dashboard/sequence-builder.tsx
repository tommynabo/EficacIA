import * as React from "react"
import { useParams, Link } from "react-router-dom"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Switch } from "@/src/components/ui/switch"
import { Badge } from "@/src/components/ui/badge"
import { Plus, Trash2, Bot, ArrowLeft, Save, Clock } from "lucide-react"

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
        <Button onClick={handleSave} disabled={isSaving} className="gap-2 min-w-[120px]">
          <Save className={`w-4 h-4 ${isSaving ? "animate-spin" : ""}`} />
          {isSaving ? "Guardando..." : "Guardar Cambios"}
        </Button>
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
                      <textarea
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-24"
                        placeholder="Escribe tu mensaje aquí..."
                        value={step.content}
                        onChange={(e) => updateStep(step.id, { content: e.target.value })}
                      />
                      
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

        {/* Preview / Instructions */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 border-dashed border-slate-700 bg-slate-900/20">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
              <Bot className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Vista Previa de IA</h3>
            <p className="text-slate-400 max-w-md">
              Selecciona un paso con "Personalización IA" activada para ver cómo EficacIA adaptará el mensaje basándose en el perfil de LinkedIn del lead.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
