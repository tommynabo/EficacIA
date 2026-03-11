import * as React from "react"
import { Input } from "@/src/components/ui/input"
import { Badge } from "@/src/components/ui/badge"
import { Button } from "@/src/components/ui/button"
import {
  Search, Send, RefreshCw, ChevronDown, Inbox,
  MessageSquare, User, Clock, Loader2, AlertCircle,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string
  profile_name: string
  unipile_account_id: string
  is_valid: boolean
}

interface Chat {
  id: string
  name?: string
  last_message?: { text?: string; created_at?: string }
  unread_count?: number
  attendees?: { name?: string; headline?: string; provider_id?: string; username?: string; avatar_url?: string; profile_picture_url?: string; is_sender?: boolean; id?: string }[]
  updated_at?: string
  account_id?: string
}

interface Message {
  id: string
  text?: string
  created_at: string
  sender_id?: string
  sender?: { name?: string; provider_id?: string }
  is_sender?: boolean
  attachments?: unknown[]
}

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

function getOtherAttendee(chat?: Chat) {
  if (!chat?.attendees) return null;
  return chat.attendees.find(a => a.is_sender === false) || chat.attendees[0];
}

function chatTitle(chat: Chat): string {
  if (chat.name && chat.name !== "Chat" && chat.name !== "Conversación") return chat.name;
  const other = getOtherAttendee(chat);
  return other?.name || other?.username || other?.provider_id || "Usuario de LinkedIn";
}

function chatAvatar(chat: Chat): string | null {
  const other = getOtherAttendee(chat);
  return other?.profile_picture_url || other?.avatar_url || null;
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UniboxPage() {
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>("")
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false)

  const [chats, setChats] = React.useState<Chat[]>([])
  const [chatsLoading, setChatsLoading] = React.useState(false)
  const [chatsError, setChatsError] = React.useState<string | null>(null)

  const [selectedChat, setSelectedChat] = React.useState<Chat | null>(null)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = React.useState(false)

  const [search, setSearch] = React.useState("")
  const [filterUnread, setFilterUnread] = React.useState(false)

  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)

  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

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

    // Mark as read locally and remotely
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
      })
      .catch(() => {})
      .finally(() => setMessagesLoading(false))
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
      return chatTitle(c).toLowerCase().includes(q) || c.last_message?.text?.toLowerCase().includes(q)
    }
    return true
  })

  const selectedAccount = accounts.find(a => a.unipile_account_id === selectedAccountId)

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
          const newChats = dChats.items || dChats.chats || []
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

          {/* Filters */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setFilterUnread(false)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${!filterUnread ? "bg-blue-500/15 text-blue-400 border border-blue-500/25" : "text-slate-400 hover:text-slate-200"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterUnread(true)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${filterUnread ? "bg-blue-500/15 text-blue-400 border border-blue-500/25" : "text-slate-400 hover:text-slate-200"}`}
            >
              No leídos
            </button>
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
          <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5 bg-slate-950/50 shrink-0">
            <div className="flex items-center gap-3">
              {(() => {
                const avatar = chatAvatar(selectedChat);
                if (avatar) return <img src={avatar} alt={chatTitle(selectedChat)} className="w-8 h-8 rounded-full object-cover shrink-0" />;
                return (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                    {initials(chatTitle(selectedChat))}
                  </div>
                );
              })()}
              <div>
                <p className="text-sm font-semibold text-slate-100">{chatTitle(selectedChat)}</p>
                {selectedChat.attendees?.[0]?.headline && (
                  <p className="text-[11px] text-slate-500 truncate max-w-[300px]">{selectedChat.attendees[0].headline}</p>
                )}
              </div>
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
              const other = getOtherAttendee(selectedChat);
              const isMine = msg.is_sender === true || 
                (!!msg.sender_id && !!other?.provider_id && msg.sender_id !== other.provider_id && msg.sender_id !== other.id);

              const time = formatTime(msg.created_at)
              const avatar = chatAvatar(selectedChat)

              return (
                <div key={msg.id} className={`flex items-end gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}>
                  {!isMine && (
                    avatar ? (
                      <img src={avatar} alt={chatTitle(selectedChat)} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
                        {initials(chatTitle(selectedChat))}
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
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Escribe un mensaje… (Cmd+Enter para enviar)"
                rows={2}
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
    </div>
  )
}

