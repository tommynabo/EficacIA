import * as React from "react"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { Search, Filter, Inbox, Send, Bot, Smile, Frown, Meh } from "lucide-react"

const conversations = [
  {
    id: "1",
    name: "Carlos Ruiz",
    lastMessage: "Me parece interesante, ¿podemos agendar una llamada?",
    time: "10:23 AM",
    unread: true,
    sentiment: "positive",
    campaign: "Product Engineer",
    avatar: "https://picsum.photos/seed/carlos/100/100"
  },
  {
    id: "2",
    name: "Ana Gómez",
    lastMessage: "No estoy interesada en este momento, gracias.",
    time: "Ayer",
    unread: false,
    sentiment: "negative",
    campaign: "Product Engineer",
    avatar: "https://picsum.photos/seed/ana/100/100"
  }
]

export default function UniboxPage() {
  return (
    <div className="h-[calc(100vh-8rem)] flex border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-950/50">
        <div className="p-4 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input placeholder="Buscar en conversaciones..." className="pl-9 bg-slate-900 border-slate-800" />
          </div>
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20 whitespace-nowrap cursor-pointer">
              Todos
            </Badge>
            <Badge variant="outline" className="whitespace-nowrap cursor-pointer hover:bg-slate-800">
              No leídos
            </Badge>
            <Badge variant="outline" className="whitespace-nowrap cursor-pointer hover:bg-slate-800 gap-1">
              <Smile className="w-3 h-3 text-emerald-500" /> Positivo
            </Badge>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <div key={conv.id} className={`p-4 border-b border-slate-800/50 cursor-pointer transition-colors hover:bg-slate-800/50 ${conv.unread ? 'bg-slate-800/30' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="relative">
                  <img src={conv.avatar} alt={conv.name} className="w-10 h-10 rounded-full border border-slate-700" />
                  {conv.unread && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-slate-900"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-sm truncate ${conv.unread ? 'font-semibold text-white' : 'font-medium text-slate-300'}`}>
                      {conv.name}
                    </h4>
                    <span className="text-xs text-slate-500">{conv.time}</span>
                  </div>
                  <p className={`text-xs truncate ${conv.unread ? 'text-slate-300' : 'text-slate-500'}`}>
                    {conv.lastMessage}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-900 border-slate-700">
                      {conv.campaign}
                    </Badge>
                    {conv.sentiment === 'positive' && <Smile className="w-3.5 h-3.5 text-emerald-500" />}
                    {conv.sentiment === 'negative' && <Frown className="w-3.5 h-3.5 text-red-500" />}
                    {conv.sentiment === 'neutral' && <Meh className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-950/30">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <img src={conversations[0].avatar} alt={conversations[0].name} className="w-8 h-8 rounded-full border border-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-white">{conversations[0].name}</h3>
              <p className="text-xs text-slate-400">Product Manager en Domestika</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
              <Bot className="w-3 h-3" />
              IA: Positivo
            </Badge>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex flex-col items-center my-4">
            <span className="text-xs text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">Hoy</span>
          </div>
          
          <div className="flex items-start gap-3 max-w-[80%]">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">TN</span>
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-none p-4 border border-slate-700">
              <p className="text-sm text-slate-200">Hola Carlos, vi tu perfil y me pareció muy interesante tu trabajo en Domestika. ¿Estarías abierto a conectar?</p>
              <span className="text-[10px] text-slate-500 mt-2 block">10:00 AM • Enviado por EficacIA Bot</span>
            </div>
          </div>

          <div className="flex items-start gap-3 max-w-[80%] ml-auto flex-row-reverse">
            <img src={conversations[0].avatar} alt={conversations[0].name} className="w-8 h-8 rounded-full border border-slate-700 shrink-0" />
            <div className="bg-blue-600 rounded-2xl rounded-tr-none p-4 border border-blue-500">
              <p className="text-sm text-white">{conversations[0].lastMessage}</p>
              <span className="text-[10px] text-blue-200 mt-2 block text-right">10:23 AM</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="relative flex items-center">
            <Input 
              placeholder="Escribe un mensaje..." 
              className="pr-12 bg-slate-950 border-slate-700 h-12 rounded-xl"
            />
            <button className="absolute right-2 w-8 h-8 bg-blue-500 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
              <Send className="w-4 h-4 text-white ml-0.5" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Bot className="w-3 h-3" />
              Sugerencia IA: "¡Genial! ¿Qué tal el martes a las 10am CET?"
            </p>
            <button className="text-xs text-blue-400 hover:text-blue-300 font-medium">Usar sugerencia</button>
          </div>
        </div>
      </div>
    </div>
  )
}
