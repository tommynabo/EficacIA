import * as React from "react"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { Button } from "@/src/components/ui/button"
import {
  Search, Send, RefreshCw, ChevronDown, Inbox,
  MessageSquare, User, Clock, Loader2, AlertCircle,
  Tag, PauseCircle, PlayCircle, ShieldBan, X, Check, Sparkles,
  Filter, Flame, Snowflake, Thermometer,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string
  profile_name: string
  unipile_account_id: string
  is_valid: boolean
}

interface Campaign {
  id: string
  name: string
  linkedin_account_id: string
}

interface LeadData {
  id: string
  tags: string[]
  sequence_paused: boolean
  name?: string
  linkedin_url?: string
  status?: string
  conversation_temperature?: string
  last_analysis_at?: string
}

interface Chat {
  id: string
  name?: string
  last_message?: { text?: string; created_at?: string; sender_id?: string; is_sender?: boolean | number | string }
  unread_count?: number
  attendees?: any[]
  participants?: any[]
  users?: any[]
  updated_at?: string
  account_id?: string
}

interface Message {
  id: string
  text?: string
  created_at: string
  sender_id?: string
  sender?: any
  is_sender?: boolean | number | string
  attachments?: unknown[]
}

const PRESET_TAGS = ["Caliente", "Seguimiento", "No interesado", "Cliente potencial", "Cerrado", "Demo agendada"]

const TOKEN = () => localStorage.getItem("auth_token")
const api = (path: string, opts?: RequestInit) =>
  fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}`, ...(opts?.headers || {}) } })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Ayer"
  if (diffDays < 7) return d.toLocaleDateString("es-ES", { weekday: "short" })
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })
}

function getMyProviderId(chat?: Chat, messages?: Message[]): string | null {
  if (!chat) return null;

  // Best: use attendees_enriched with is_self from the backend
  const enriched = (chat as any).attendees_enriched || [];
  const selfAtt = enriched.find((a: any) => a.is_self === true);
  if (selfAtt) return selfAtt.provider_id || selfAtt.id || null;

  const msgs = messages || [];
  
  // Try to find a message firmly marked as ours
  const myMsg = msgs.find(m => (String(m.is_sender) === "true" || m.is_sender === 1) && !!m.sender_id);
  if (myMsg) return myMsg.sender_id!;

  if (chat.last_message?.sender_id && (String(chat.last_message.is_sender) === "true" || chat.last_message.is_sender === 1)) {
    return chat.last_message.sender_id;
  }

  // Fallback: If 1 non-self attendee, any message not from them is ours
  const attendees = enriched.length > 0 ? enriched : (chat.participants || chat.attendees || chat.users || []);
  if (attendees.length >= 1) {
    const otherAtt = attendees.find((a: any) => a.is_self !== true);
    if (otherAtt) {
      const otherId = otherAtt.provider_id || otherAtt.id;
      const fallbackMsg = msgs.find(m => m.sender_id && m.sender_id !== otherId);
      if (fallbackMsg) return fallbackMsg.sender_id!;
      if (chat.last_message?.sender_id && chat.last_message.sender_id !== otherId) return chat.last_message.sender_id;
    }
  }

  return null;
}

function getOtherAttendee(chat?: Chat, myProviderId?: string | null) {
  // Prefer enriched attendees from backend (has name + picture_url)
  const enriched = (chat as any)?.attendees_enriched || [];
  
  if (enriched.length > 0) {
    // is_self tells us who the account owner is — the OTHER is the lead
    const other = enriched.find((a: any) => a.is_self !== true);
    if (other) return other;
    return enriched[0]; // single user chat
  }

  // Fallback to raw attendees/participants
  const list = chat?.participants || chat?.attendees || chat?.users || [];
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  
  if (myProviderId) {
    const other = list.find((a: any) => (a.provider_id || a.id || a.account_id) !== myProviderId);
    if (other) return other;
  }

  return list.find((a: any) => a.is_sender === false || String(a.is_sender) === "false") || list[0];
}

function extractName(obj: any): string | null {
  if (!obj) return null;
  if (typeof obj === "string") return obj;
  if (obj.name) return obj.name;
  if (obj.display_name) return obj.display_name;
  if (obj.first_name) return [obj.first_name, obj.last_name].filter(Boolean).join(" ");
  if (obj.username) return obj.username;
  return null;
}

function chatTitle(chat: Chat, myProviderId?: string | null): string {
  const other = getOtherAttendee(chat, myProviderId);
  
  // If we found an enriched attendee with a real name, use it immediately
  if (other) {
    const displayName = extractName(other);
    if (displayName) return displayName;
  }

  // Fall back to chat.name if it's meaningful  
  if (chat.name && chat.name.trim() !== "" && chat.name.toLowerCase() !== "chat" && chat.name.toLowerCase() !== "conversación") return chat.name;

  // Last resort: show provider_id so it's at least unique per person
  if (other?.provider_id) return other.provider_id;
  if (chat.last_message?.sender_id && chat.last_message.sender_id !== myProviderId) return String(chat.last_message.sender_id);
  
  return "Conversación";
}

function chatAvatar(chat: Chat, myProviderId?: string | null): string | null {
  const other = getOtherAttendee(chat, myProviderId);
  if (!other) return null;
  // picture_url is what Unipile's attendee endpoint returns
  return other.picture_url || other.avatar_url || other.avatar || other.profile_picture_url || other.picture || other.image || null;
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UniboxPage() {
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>("")
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false)

  // Campaigns for filter
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [filterCampaignId, setFilterCampaignId] = React.useState<string>("")
  const [filterTag, setFilterTag] = React.useState<string>("")
  const [filterTemperature, setFilterTemperature] = React.useState<string>("")
  const [filterDirection, setFilterDirection] = React.useState<"" | "received" | "sent">("") // "received" = last msg from lead; "sent" = last msg from us
  const [campaignMenuOpen, setCampaignMenuOpen] = React.useState(false)
  const [tagMenuOpen, setTagMenuOpen] = React.useState(false)
  const [temperatureMenuOpen, setTemperatureMenuOpen] = React.useState(false)

  const [chats, setChats] = React.useState<Chat[]>([])
  const [chatsLoading, setChatsLoading] = React.useState(false)
  const [chatsError, setChatsError] = React.useState<string | null>(null)

  // Local mask for read chats to prevent bouncing unread badges while Unipile syncs
  const [readChats, setReadChats] = React.useState<Record<string, string>>({}) // chatId -> last_message.id

  const [selectedChat, setSelectedChat] = React.useState<Chat | null>(null)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = React.useState(false)

  // Lead CRM data for selected chat
  const [selectedLead, setSelectedLead] = React.useState<LeadData | null>(null)
  const [labelsOpen, setLabelsOpen] = React.useState(false)
  const [labelsSaving, setLabelsSaving] = React.useState(false)
  const [sequenceSaving, setSequenceSaving] = React.useState(false)
  const [blockLoading, setBlockLoading] = React.useState(false)
  const [actionMsg, setActionMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null)

  // AI Assistant panel
  const [assistantOpen, setAssistantOpen] = React.useState(false)

  // Map chatId → lead tags / temperature (for sidebar filtering)
  const [chatLeadTags, setChatLeadTags] = React.useState<Record<string, string[]>>({})
  const [chatLeadTemperatures, setChatLeadTemperatures] = React.useState<Record<string, string>>({})
  const [temperatureAnalyzing, setTemperatureAnalyzing] = React.useState(false)

  const [search, setSearch] = React.useState("")
  const [filterUnread, setFilterUnread] = React.useState(false)

  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)

  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const labelsRef = React.useRef<HTMLDivElement>(null)

  // ── Load accounts ──────────────────────────────────────────────────
  React.useEffect(() => {
    api("/api/linkedin/accounts")
      .then(r => r.json())
      .then(d => {
        const accs: Account[] = (d.accounts || []).filter((a: Account) => a.unipile_account_id && a.is_valid)
        setAccounts(accs)
        if (accs.length > 0) setSelectedAccountId(accs[0].unipile_account_id)
      })
      .catch(() => {})

    // Load campaigns for filter
    api("/api/linkedin/campaigns")
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns || d || []))
      .catch(() => {})
  }, [])

  // ── Load chats when account changes ───────────────────────────────
  React.useEffect(() => {
    if (!selectedAccountId) return
    setChats([])
    setSelectedChat(null)
    setMessages([])
    setChatsError(null)
    setChatsLoading(true)
    api(`/api/linkedin/unibox?action=chats&accountId=${selectedAccountId}&limit=50`)
      .then(r => r.json())
      .then(d => {
        const items: Chat[] = d.items || d.chats || []
        setChats(items)
        if (items.length > 0) selectChat(items[0])
      })
      .catch(e => setChatsError("No se pudieron cargar las conversaciones."))
      .finally(() => setChatsLoading(false))
  }, [selectedAccountId])

  // ── Scroll to bottom when messages update ─────────────────────────
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const selectChat = (chat: Chat) => {
    setSelectedChat(chat)
    setMessages([])
    setMessagesLoading(true)
    setSendError(null)
    setSelectedLead(null)
    setLabelsOpen(false)
    setActionMsg(null)

    // Mask as read locally using timestamp
    setReadChats(prev => ({ ...prev, [chat.id]: new Date().toISOString() }))
    if (chat.unread_count && chat.unread_count > 0) {
      setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c))
      
      api("/api/linkedin/unibox?action=mark_read", {
        method: "POST",
        body: JSON.stringify({ chatId: chat.id, accountId: selectedAccountId })
      }).catch(() => {})
    }

    api(`/api/linkedin/unibox?action=messages&chatId=${chat.id}&accountId=${selectedAccountId}&limit=50`)
      .then(r => r.json())
      .then(d => {
        const msgs: Message[] = (d.items || d.messages || []).reverse()
        setMessages(msgs)

        // Load lead CRM data — upsert so orphan contacts are created automatically
        const enr = (chat as any).attendees_enriched || []
        const other = enr.find((a: any) => a.is_self !== true) || enr[0]
        const pId = other?.provider_id
        if (pId) {
          api("/api/linkedin/unibox?action=upsert_lead", {
            method: "POST",
            body: JSON.stringify({
              providerId: pId,
              name: other?.name || null,
              publicIdentifier: other?.public_identifier || null,
            }),
          })
            .then(r2 => r2.json())
            .then(d2 => {
              if (d2.lead) {
                setSelectedLead(d2.lead)
                // Track lead tags + temperature for this chat
                setChatLeadTags(prev => ({ ...prev, [chat.id]: d2.lead.tags || [] }))
                if (d2.lead.conversation_temperature) {
                  setChatLeadTemperatures(prev => ({ ...prev, [chat.id]: d2.lead.conversation_temperature }))
                }
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setMessagesLoading(false))
  }

  // ── CRM: Toggle tag on selected lead ──────────────────────────────
  const toggleTag = async (tag: string) => {
    if (!selectedLead) return
    const currentTags: string[] = selectedLead.tags || []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag]

    setSelectedLead(prev => prev ? { ...prev, tags: newTags } : prev)
    setLabelsSaving(true)
    try {
      const r = await api("/api/linkedin/unibox?action=update_lead", {
        method: "PATCH",
        body: JSON.stringify({ leadId: selectedLead.id, tags: newTags }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      if (d.lead) setSelectedLead(prev => prev ? { ...prev, ...d.lead } : prev)
    } catch {
      // revert on error
      setSelectedLead(prev => prev ? { ...prev, tags: currentTags } : prev)
    } finally {
      setLabelsSaving(false)
    }
  }

  // ── CRM: Toggle sequence_paused ────────────────────────────────────
  const toggleSequence = async () => {
    if (!selectedLead) return
    const newPaused = !selectedLead.sequence_paused
    setSelectedLead(prev => prev ? { ...prev, sequence_paused: newPaused } : prev)
    setSequenceSaving(true)
    try {
      const r = await api("/api/linkedin/unibox?action=update_lead", {
        method: "PATCH",
        body: JSON.stringify({ leadId: selectedLead.id, sequence_paused: newPaused }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setActionMsg({ type: "success", text: newPaused ? "Secuencia pausada" : "Secuencia reanudada" })
      setTimeout(() => setActionMsg(null), 3000)
    } catch {
      setSelectedLead(prev => prev ? { ...prev, sequence_paused: !newPaused } : prev)
      setActionMsg({ type: "error", text: "Error actualizando secuencia" })
      setTimeout(() => setActionMsg(null), 3000)
    } finally {
      setSequenceSaving(false)
    }
  }

  // ── Block contact (DB + real LinkedIn block via Unipile) ───────
  const handleBlock = async () => {
    if (!selectedLead) {
      setActionMsg({ type: "error", text: "No se pudo identificar el contacto. Selecciona el chat de nuevo." })
      setTimeout(() => setActionMsg(null), 4000)
      return
    }
    if (!confirm("¿Bloquear este contacto en LinkedIn? Esta acción bloqueará a la persona en LinkedIn y la ocultará de la Unibox.")) return

    setBlockLoading(true)
    try {
      // Send leadId + unipile_id (provider_id) + accountId for Unipile LinkedIn block
      const enr = (selectedChat as any)?.attendees_enriched || []
      const other = enr.find((a: any) => a.is_self !== true) || enr[0]
      const unipileId = other?.provider_id || selectedChat?.id || null

      const r = await api("/api/linkedin/unibox?action=block", {
        method: "POST",
        body: JSON.stringify({ leadId: selectedLead.id, unipile_id: unipileId, accountId: selectedAccountId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setSelectedLead(prev => prev ? { ...prev, status: "blocked" } : prev)
      // Remove the chat from the visible list
      setChats(prev => prev.filter(c => c.id !== selectedChat?.id))
      setSelectedChat(null)
      setMessages([])
      setActionMsg({ type: "success", text: "Contacto bloqueado" })
      setTimeout(() => setActionMsg(null), 4000)
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message || "Error al bloquear" })
      setTimeout(() => setActionMsg(null), 4000)
    } finally {
      setBlockLoading(false)
    }
  }

  // ── Analyze conversation temperature with AI ───────────────────────
  const analyzeTemperature = async () => {
    if (!selectedLead || messages.length === 0 || temperatureAnalyzing) return
    setTemperatureAnalyzing(true)
    try {
      const r = await api("/api/linkedin/unibox?action=analyze_temperature", {
        method: "POST",
        body: JSON.stringify({ leadId: selectedLead.id, messages }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      const temp = d.temperature as string
      setSelectedLead(prev => prev ? { ...prev, conversation_temperature: temp, last_analysis_at: d.lead?.last_analysis_at } : prev)
      if (selectedChat) setChatLeadTemperatures(prev => ({ ...prev, [selectedChat.id]: temp }))
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message || "Error al analizar" })
      setTimeout(() => setActionMsg(null), 3000)
    } finally {
      setTemperatureAnalyzing(false)
    }
  }

  const handleSend = async () => {
    if (!draft.trim() || !selectedChat || sending) return
    setSending(true)
    setSendError(null)
    try {
      const r = await api("/api/linkedin/unibox?action=send", {
        method: "POST",
        body: JSON.stringify({ chatId: selectedChat.id, accountId: selectedAccountId, text: draft.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Error al enviar")
      setDraft("")
      if (textareaRef.current) textareaRef.current.style.height = "auto"
      // Append optimistically
      const optimistic: Message = {
        id: `opt-${Date.now()}`,
        text: draft.trim(),
        created_at: new Date().toISOString(),
        is_sender: true,
      }
      setMessages(prev => [...prev, optimistic])
      textareaRef.current?.focus()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Error al enviar mensaje")
    } finally {
      setSending(false)
    }
  }

  const filteredChats = chats.filter(c => {
    if (filterUnread && !c.unread_count) return false
    if (search) {
      const q = search.toLowerCase()
      if (!chatTitle(c).toLowerCase().includes(q) && !c.last_message?.text?.toLowerCase().includes(q)) return false
    }
    // Recibidos / Enviados: filter by who sent the last message
    if (filterDirection) {
      const lm = c.last_message
      if (!lm) return false
      const lastFromMe = String(lm.is_sender) === "true" || lm.is_sender === 1
      if (filterDirection === "received" && lastFromMe) return false
      if (filterDirection === "sent" && !lastFromMe) return false
    }
    // Campaign filter: Unipile doesn't embed campaign data in chat,
    // so this filters by account (each campaign runs on one account)
    if (filterCampaignId) {
      const camp = campaigns.find(cp => cp.id === filterCampaignId)
      if (camp && c.account_id && c.account_id !== camp.linkedin_account_id) return false
    }
    // Tag filter: only show chats whose lead has the selected tag
    if (filterTag) {
      const tags = chatLeadTags[c.id]
      if (!tags || !tags.includes(filterTag)) return false
    }
    // Temperature filter
    if (filterTemperature) {
      const temp = chatLeadTemperatures[c.id]
      if (temp !== filterTemperature) return false
    }
    return true
  })

  const selectedAccount = accounts.find(a => a.unipile_account_id === selectedAccountId)
  
  // Calculate my provider ID for accurate direction logic
  const globalMyProviderId = getMyProviderId(selectedChat || undefined, messages);

  // ── Polling: Real-time sync ─────────────────────────────────────────
  const sendingRef = React.useRef(sending)
  React.useEffect(() => { sendingRef.current = sending }, [sending])

  React.useEffect(() => {
    if (!selectedAccountId) return

    const poll = async () => {
      // Avoid interrupting optimistic UI updates while sending
      if (sendingRef.current) return

      try {
        const rChats = await api(`/api/linkedin/unibox?action=chats&accountId=${selectedAccountId}&limit=50`)
        if (rChats.ok) {
          const dChats = await rChats.json()
          const rawChats: Chat[] = dChats.items || dChats.chats || []
          
          // Apply our local read mask so they don't bounce back to unread
          // Only allow unread back if a genuinely NEW message arrived after we read
          const newChats = rawChats.map(c => {
            const readTimestamp = readChats[c.id]
            if (!readTimestamp) return c
            // If we're currently viewing this chat, always suppress
            if (selectedChat && c.id === selectedChat.id) return { ...c, unread_count: 0 }
            // If last message is older than when we read, suppress
            const lastMsgTime = c.last_message?.created_at || ''
            if (!lastMsgTime || lastMsgTime <= readTimestamp) return { ...c, unread_count: 0 }
            // Genuinely new message — allow badge
            return c
          })

          setChats(prev => {
            if (prev.length !== newChats.length) return newChats
            const changed = prev.some((c, i) => {
              const nc = newChats[i]
              if (!nc) return true
              return c.id !== nc.id || c.unread_count !== nc.unread_count || c.last_message?.text !== nc.last_message?.text
            })
            return changed ? newChats : prev
          })
        }

        if (selectedChat) {
          const rMsgs = await api(`/api/linkedin/unibox?action=messages&chatId=${selectedChat.id}&accountId=${selectedAccountId}&limit=50`)
          if (rMsgs.ok) {
            const dMsgs = await rMsgs.json()
            const newMsgs = (dMsgs.items || dMsgs.messages || []).reverse()
            setMessages(prev => {
              if (prev.length !== newMsgs.length) return newMsgs
              if (prev.length > 0 && newMsgs.length > 0 && prev[prev.length - 1].id !== newMsgs[newMsgs.length - 1].id) return newMsgs
              return prev
            })
          }
        }
      } catch (err) {
        // Fail silently in background
      }
    }

    const intervalId = setInterval(poll, 6000)
    return () => clearInterval(intervalId)
  }, [selectedAccountId, selectedChat])

  // ── Keyboard shortcut: Cmd/Ctrl+Enter to send ─────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30">

      {/* ── Left: Sidebar ────────────────────────────────────────── */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-950/50 shrink-0">

        {/* Account selector */}
        <div className="p-4 border-b border-slate-800">
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(o => !o)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {selectedAccount ? initials(selectedAccount.profile_name) : "?"}
              </div>
              <span className="flex-1 text-sm font-medium text-slate-200 truncate">
                {selectedAccount?.profile_name || "Selecciona una cuenta"}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
            {accountMenuOpen && accounts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 overflow-hidden">
                {accounts.map(acc => (
                  <button
                    key={acc.unipile_account_id}
                    onClick={() => { setSelectedAccountId(acc.unipile_account_id); setAccountMenuOpen(false) }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-slate-800 transition-colors ${
                      acc.unipile_account_id === selectedAccountId ? "bg-slate-800/70" : ""
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {initials(acc.profile_name)}
                    </div>
                    <span className="text-slate-200 truncate">{acc.profile_name}</span>
                    {acc.unipile_account_id === selectedAccountId && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversaciones…"
              className="pl-9 bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500"
            />
          </div>

          {/* Filters row: Todos/No leídos + Campaign filter + Tag filter */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <button
              onClick={() => { setFilterUnread(false); setFilterTag(""); setFilterCampaignId(""); setFilterTemperature(""); setFilterDirection("") }}
              className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${!filterUnread && !filterTag && !filterCampaignId && !filterTemperature && !filterDirection ? "bg-blue-500/15 text-blue-400 border border-blue-500/25" : "text-slate-400 hover:text-slate-200"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterUnread(u => !u)}
              className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${filterUnread ? "bg-blue-500/15 text-blue-400 border border-blue-500/25" : "text-slate-400 hover:text-slate-200"}`}
            >
              No leídos
            </button>
            <button
              onClick={() => setFilterDirection(d => d === "received" ? "" : "received")}
              className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${filterDirection === "received" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "text-slate-400 hover:text-slate-200"}`}
              title="Conversaciones donde el lead escribió último"
            >
              Recibidos
            </button>
            <button
              onClick={() => setFilterDirection(d => d === "sent" ? "" : "sent")}
              className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${filterDirection === "sent" ? "bg-violet-500/15 text-violet-400 border border-violet-500/25" : "text-slate-400 hover:text-slate-200"}`}
              title="Conversaciones donde tú escribiste último"
            >
              Enviados
            </button>

            {/* Campaign filter */}
            {campaigns.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setCampaignMenuOpen(o => !o); setTagMenuOpen(false) }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors ${filterCampaignId ? "bg-violet-500/15 text-violet-400 border border-violet-500/25" : "text-slate-400 hover:text-slate-200 border border-slate-700"}`}
                >
                  <Filter className="w-3 h-3" />
                  {filterCampaignId ? (campaigns.find(c => c.id === filterCampaignId)?.name || "Campaña").slice(0, 10) : "Campaña"}
                </button>
                {campaignMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                    <button
                      onClick={() => { setFilterCampaignId(""); setCampaignMenuOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${!filterCampaignId ? "text-blue-400" : "text-slate-300"}`}
                    >
                      Todas las campañas
                    </button>
                    {campaigns.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setFilterCampaignId(c.id); setCampaignMenuOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 truncate ${filterCampaignId === c.id ? "text-blue-400" : "text-slate-300"}`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tag filter */}
            <div className="relative">
              <button
                onClick={() => { setTagMenuOpen(o => !o); setCampaignMenuOpen(false); setTemperatureMenuOpen(false) }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors ${filterTag ? "bg-amber-500/15 text-amber-400 border border-amber-500/25" : "text-slate-400 hover:text-slate-200 border border-slate-700"}`}
              >
                <Tag className="w-3 h-3" />
                {filterTag || "Etiqueta"}
              </button>
              {tagMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => { setFilterTag(""); setTagMenuOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${!filterTag ? "text-blue-400" : "text-slate-300"}`}
                  >
                    Todas las etiquetas
                  </button>
                  {PRESET_TAGS.map(t => (
                    <button
                      key={t}
                      onClick={() => { setFilterTag(t); setTagMenuOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${filterTag === t ? "text-amber-400" : "text-slate-300"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Temperature filter */}
            <div className="relative">
              <button
                onClick={() => { setTemperatureMenuOpen(o => !o); setCampaignMenuOpen(false); setTagMenuOpen(false) }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                  filterTemperature === 'hot' ? "bg-red-500/15 text-red-400 border border-red-500/25" :
                  filterTemperature === 'warm' ? "bg-orange-500/15 text-orange-400 border border-orange-500/25" :
                  filterTemperature === 'cold' ? "bg-sky-500/15 text-sky-400 border border-sky-500/25" :
                  "text-slate-400 hover:text-slate-200 border border-slate-700"
                }`}
              >
                {filterTemperature === 'hot' ? <Flame className="w-3 h-3" /> :
                 filterTemperature === 'warm' ? <Thermometer className="w-3 h-3" /> :
                 filterTemperature === 'cold' ? <Snowflake className="w-3 h-3" /> :
                 <Thermometer className="w-3 h-3" />}
                {filterTemperature === 'hot' ? "Caliente" :
                 filterTemperature === 'warm' ? "Tibio" :
                 filterTemperature === 'cold' ? "Frío" : "Temp"}
              </button>
              {temperatureMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <button onClick={() => { setFilterTemperature(""); setTemperatureMenuOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${!filterTemperature ? "text-blue-400" : "text-slate-300"}`}>
                    Todas
                  </button>
                  {([['hot','Caliente',<Flame className="w-3 h-3" />,'text-red-400'],['warm','Tibio',<Thermometer className="w-3 h-3" />,'text-orange-400'],['cold','Frío',<Snowflake className="w-3 h-3" />,'text-sky-400']] as const).map(([val, label, icon, cls]) => (
                    <button key={val} onClick={() => { setFilterTemperature(val); setTemperatureMenuOpen(false) }}
                      className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-slate-800 ${filterTemperature === val ? cls : 'text-slate-300'}`}>
                      {icon}{label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => selectedAccountId && setSelectedAccountId(selectedAccountId + "")}
              className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs">Cargando conversaciones…</p>
            </div>
          )}
          {chatsError && !chatsLoading && (
            <div className="p-5 text-center">
              <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">{chatsError}</p>
            </div>
          )}
          {!chatsLoading && !chatsError && filteredChats.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500 text-center px-6">
              <MessageSquare className="w-8 h-8 opacity-40" />
              <p className="text-sm">{accounts.length === 0 ? "Conecta una cuenta de LinkedIn primero." : "No hay conversaciones."}</p>
            </div>
          )}
          {filteredChats.map(chat => {
            const title = chatTitle(chat)
            const isSelected = selectedChat?.id === chat.id
            return (
              <button
                key={chat.id}
                onClick={() => selectChat(chat)}
                className={`w-full text-left px-4 py-3.5 border-b border-slate-800/60 transition-colors ${
                  isSelected ? "bg-blue-500/8 border-l-2 border-l-blue-500" : "hover:bg-slate-800/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  {(() => {
                    const avatar = chatAvatar(chat);
                    if (avatar) return <img src={avatar} alt={title} className="w-9 h-9 rounded-full object-cover shrink-0" />;
                    return (
                      <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200 shrink-0">
                        {initials(title)}
                      </div>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${chat.unread_count ? "font-semibold text-white" : "font-medium text-slate-300"}`}>
                        {title}
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-1">
                        {formatTime(chat.last_message?.created_at || chat.updated_at)}
                      </span>
                    </div>
                    <p className={`text-xs truncate ${chat.unread_count ? "text-slate-300" : "text-slate-500"}`}>
                      {chat.last_message?.text || "Sin mensajes"}
                    </p>
                    {/* Temperature badge with tooltip */}
                    {chatLeadTemperatures[chat.id] && (
                      <div className="mt-1">
                        {chatLeadTemperatures[chat.id] === 'hot' && (
                          <span
                            title="🔥 Caliente — El lead quiere agendar o pide información"
                            className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded-full border border-red-500/20 cursor-default"
                          >
                            🔥 Caliente
                          </span>
                        )}
                        {chatLeadTemperatures[chat.id] === 'warm' && (
                          <span
                            title="☀️ Tibio — Responde pero con dudas, está evaluando"
                            className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-orange-500/15 text-orange-400 rounded-full border border-orange-500/20 cursor-default"
                          >
                            ☀️ Tibio
                          </span>
                        )}
                        {chatLeadTemperatures[chat.id] === 'cold' && (
                          <span
                            title="❄️ Frío — Sin respuesta o sin interés aparente"
                            className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-400 rounded-full border border-sky-500/20 cursor-default"
                          >
                            ❄️ Frío
                          </span>
                        )}
                      </div>
                    )}
                    {!!chat.unread_count && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                          {chat.unread_count > 9 ? "9+" : chat.unread_count}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: Chat panel ────────────────────────────────────── */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5 bg-slate-950/50 shrink-0 relative z-10">
            <div className="flex items-center gap-3">
              {(() => {
                const avatar = chatAvatar(selectedChat, globalMyProviderId);
                const titleStr = chatTitle(selectedChat, globalMyProviderId);
                if (avatar) return <img src={avatar} alt={titleStr} className="w-8 h-8 rounded-full object-cover shrink-0" />;
                return (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                    {initials(titleStr)}
                  </div>
                );
              })()}
              <div>
                <p className="text-sm font-semibold text-slate-100">{chatTitle(selectedChat, globalMyProviderId)}</p>
                {getOtherAttendee(selectedChat, globalMyProviderId)?.headline && (
                  <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                    {getOtherAttendee(selectedChat, globalMyProviderId)?.headline}
                  </p>
                )}
              </div>
              {/* Lead tags inline display */}
              {selectedLead && selectedLead.tags.length > 0 && (
                <div className="hidden sm:flex items-center gap-1 ml-2">
                  {selectedLead.tags.slice(0, 2).map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-amber-500/15 text-amber-300 rounded-full border border-amber-500/25">{t}</span>
                  ))}
                  {selectedLead.tags.length > 2 && (
                    <span className="text-[10px] text-slate-400">+{selectedLead.tags.length - 2}</span>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1" ref={labelsRef}>
              {/* Action feedback toast */}
              {actionMsg && (
                <span className={`text-xs px-3 py-1 rounded-full mr-2 ${
                  actionMsg.type === "success" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {actionMsg.text}
                </span>
              )}

              {/* AI Assistant button */}
              <button
                onClick={() => setAssistantOpen(o => !o)}
                title="EficacIA Assistant"
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  assistantOpen ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">IA</span>
              </button>

              {/* Temperature analyze button — click to re-run AI analysis */}
              {selectedLead && (
                <button
                  onClick={analyzeTemperature}
                  disabled={temperatureAnalyzing || messages.length === 0}
                  title={
                    selectedLead.conversation_temperature === 'hot'
                      ? '🔥 Caliente — El lead quiere agendar o pide información. Clic para re-analizar.'
                      : selectedLead.conversation_temperature === 'warm'
                      ? '☀️ Tibio — Responde pero con dudas, está evaluando. Clic para re-analizar.'
                      : '❄️ Frío — Sin respuesta o sin interés aparente. Clic para analizar.'
                  }
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors border ${
                    selectedLead.conversation_temperature === 'hot'
                      ? 'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25'
                      : selectedLead.conversation_temperature === 'warm'
                      ? 'bg-orange-500/15 text-orange-400 border-orange-500/25 hover:bg-orange-500/25'
                      : 'bg-sky-500/15 text-sky-400 border-sky-500/25 hover:bg-sky-500/25'
                  } disabled:opacity-50`}
                >
                  {temperatureAnalyzing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="text-base leading-none">
                      {selectedLead.conversation_temperature === 'hot' ? '🔥' :
                       selectedLead.conversation_temperature === 'warm' ? '☀️' : '❄️'}
                    </span>
                  )}
                  <span className="hidden lg:inline">
                    {temperatureAnalyzing ? 'Analizando…' :
                     selectedLead.conversation_temperature === 'hot' ? 'Caliente' :
                     selectedLead.conversation_temperature === 'warm' ? 'Tibio' : 'Frío'}
                  </span>
                </button>
              )}

              {/* Labels dropdown */}
              <div className="relative">
                <button
                  onClick={() => setLabelsOpen(o => !o)}
                  title="Etiquetas"
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                    labelsOpen ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Etiquetas</span>
                  {labelsSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                </button>
                {labelsOpen && (
                  <div className="absolute top-full right-0 mt-1 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800">
                      <p className="text-xs text-slate-400 font-medium">Etiquetas del lead</p>
                      {!selectedLead && <p className="text-[10px] text-slate-600 mt-0.5">Lead no encontrado en DB</p>}
                    </div>
                    <div className="p-2 space-y-0.5">
                      {PRESET_TAGS.map(t => {
                        const active = selectedLead?.tags?.includes(t) ?? false
                        return (
                          <button
                            key={t}
                            onClick={() => toggleTag(t)}
                            disabled={!selectedLead || labelsSaving}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                              active
                                ? "bg-amber-500/20 text-amber-300"
                                : "text-slate-300 hover:bg-slate-800"
                            } disabled:opacity-40`}
                          >
                            <span>{t}</span>
                            {active && <Check className="w-3 h-3" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Block button */}
              <button
                onClick={handleBlock}
                disabled={blockLoading}
                title={selectedLead ? "Bloquear este contacto en EficacIA" : "Selecciona un chat para bloquear"}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 transition-colors disabled:opacity-50"
              >
                {blockLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ShieldBan className="w-3.5 h-3.5" />
                }
                <span className="hidden lg:inline">Bloquear</span>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {messagesLoading && (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              </div>
            )}
            {!messagesLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                <MessageSquare className="w-8 h-8 opacity-30" />
                <p className="text-sm">No hay mensajes en esta conversación</p>
              </div>
            )}
            {messages.map((msg) => {
              // Message direction logic 
              // If we extracted our own providerId perfectly, we use it!
              let isMine = String(msg.is_sender) === "true" || msg.is_sender === 1;
              if (globalMyProviderId && msg.sender_id) {
                isMine = (msg.sender_id === globalMyProviderId);
              }
              // Absolute fallback if optimistic message doesn't have sender_id
              if (msg.id.startsWith("opt-")) isMine = true;

              const time = formatTime(msg.created_at)
              const avatar = chatAvatar(selectedChat, globalMyProviderId)
              const titleStr = chatTitle(selectedChat, globalMyProviderId)

              return (
                <div key={msg.id} className={`flex items-end gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}>
                  {!isMine && (
                    avatar ? (
                      <img src={avatar} alt={titleStr} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
                        {initials(titleStr)}
                      </div>
                    )
                  )}
                  <div className={`max-w-[70%] flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                      isMine
                        ? "bg-blue-500 text-white rounded-br-sm"
                        : "bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm"
                    }`}>
                      {msg.text || <span className="italic text-opacity-60">[adjunto]</span>}
                    </div>
                    <span className="text-[10px] text-slate-500 px-1">{time}</span>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose */}
          <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-4 shrink-0">
            {sendError && (
              <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {sendError}
              </p>
            )}
            <div className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => {
                  setDraft(e.target.value)
                  if (textareaRef.current) {
                    textareaRef.current.style.height = "auto"
                    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
                  }
                }}
                onKeyDown={onKeyDown}
                placeholder="Escribe un mensaje… (Cmd+Enter para enviar)"
                rows={1}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
              />
              <Button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="h-10 w-10 p-0 rounded-xl bg-blue-500 hover:bg-blue-600 text-white border-0 shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5 pl-1">Cmd+Enter para enviar</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-slate-500 p-12">
          <Inbox className="w-14 h-14 opacity-20" />
          <div>
            <p className="text-base font-medium text-slate-400">Selecciona una conversación</p>
            <p className="text-sm text-slate-600 mt-1">
              {accounts.length === 0
                ? "Conecta una cuenta de LinkedIn en Ajustes → Cuentas para empezar."
                : "Elige una conversación de la lista para ver los mensajes."}
            </p>
          </div>
          {accounts.length === 0 && (
            <Button asChild variant="outline" className="mt-2">
              <a href="/dashboard/accounts">Conectar cuenta</a>
            </Button>
          )}
        </div>
      )}

      {/* ── EficacIA Assistant Slide-over ──────────────────────── */}
      {assistantOpen && (
        <EficacIAAssistantPanel
          leadName={selectedChat ? chatTitle(selectedChat, globalMyProviderId) : undefined}
          contactName={
            selectedLead?.name ||
            (selectedChat ? chatTitle(selectedChat, globalMyProviderId) : undefined)
          }
          contactCompany={
            (getOtherAttendee(selectedChat || undefined, globalMyProviderId) as any)?.company_name ||
            undefined
          }
          onClose={() => setAssistantOpen(false)}
        />
      )}
    </div>
  )
}

// ─── EficacIA Assistant Panel ─────────────────────────────────────────────────

interface AssistantMessage {
  role: "user" | "assistant"
  content: string
}

function EficacIAAssistantPanel({
  leadName,
  contactName,
  contactCompany,
  onClose,
}: {
  leadName?: string
  contactName?: string
  contactCompany?: string
  onClose: () => void
}) {
  const [messages, setMessages] = React.useState<AssistantMessage[]>([
    {
      role: "assistant",
      content: contactName
        ? `Conversación activa con **${contactName}**. ¿Qué mensaje quieres redactar? Describe el contexto y te entrego el texto listo para enviar.`
        : `¿Qué mensaje quieres redactar? Describe el contexto y te entrego el texto listo para copiar.`,
    },
  ])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)
  const assistantInputRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    if (assistantInputRef.current) {
      assistantInputRef.current.style.height = "auto"
    }
    const newMessages: AssistantMessage[] = [...messages, { role: "user", content: text }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const r = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          leadName,
          contactName,
          contactCompany,
          source: 'unibox',
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        const msg = (r.status === 403 && d.code === 'NO_CREDITS')
          ? "Has agotado tus créditos. Recarga en Settings → Créditos IA para seguir usando la IA."
          : (d.error || "Error")
        setMessages(prev => [...prev, { role: "assistant", content: msg }])
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
    <div className="w-96 border-l border-slate-800 flex flex-col bg-slate-950/80 shrink-0">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2.5 text-sm ${
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
            ref={assistantInputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              if (assistantInputRef.current) {
                assistantInputRef.current.style.height = "auto"
                assistantInputRef.current.style.height = `${Math.min(assistantInputRef.current.scrollHeight, 150)}px`
              }
            }}
            onKeyDown={onKey}
            rows={1}
            placeholder="Pregunta algo… (Cmd+Enter para enviar)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
          />
          <Button
            onClick={send}
            disabled={!input.trim() || loading}
            className="h-10 w-10 p-0 rounded-xl bg-violet-500 hover:bg-violet-600 text-white border-0 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5 pl-1">Claude 3 Haiku · Cmd+Enter para enviar</p>
      </div>
    </div>
  )
}

