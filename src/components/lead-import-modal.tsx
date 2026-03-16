import * as React from "react"
import { X, FileText, Search, Briefcase, UserPlus, Upload, Check, AlertCircle, Link2, ChevronDown, Zap } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { cn } from "@/src/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type ImportMethod = 'csv' | 'google_sheets' | 'linkedin_search' | 'sales_navigator' | 'apollo' | 'manual'

interface ParsedSNFilters {
  titles: string[]
  regions: string[]
  companies: string[]
  industries: string[]
  seniority: string[]
  keywords: string[]
  isValid: boolean
  error?: string
}

interface Account {
  id: string
  profile_name: string
  username: string
  is_valid: boolean
}

type FieldType = 'skip' | 'first_name' | 'last_name' | 'email' | 'company' | 'job_title' | 'linkedin_url' | 'custom_var'
interface ColMapping { fieldType: FieldType; varName: string }
interface CsvRawData { headers: string[]; sampleRows: string[][]; allRows: string[][]; totalRows: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
}

// ─── CSV auto-detect field type from column name ────────────────────────────
const AUTO_FIELD_MAP: Record<string, FieldType> = {
  'first_name': 'first_name', 'firstname': 'first_name', 'first name': 'first_name', 'nombre': 'first_name', 'name': 'first_name', 'given name': 'first_name',
  'last_name': 'last_name', 'lastname': 'last_name', 'last name': 'last_name', 'apellido': 'last_name', 'surname': 'last_name', 'family name': 'last_name',
  'email': 'email', 'e-mail': 'email', 'correo': 'email', 'email address': 'email',
  'company': 'company', 'empresa': 'company', 'organization': 'company', 'organisation': 'company', 'company name': 'company',
  'position': 'job_title', 'title': 'job_title', 'job_title': 'job_title', 'jobtitle': 'job_title', 'job title': 'job_title', 'cargo': 'job_title', 'puesto': 'job_title', 'headline': 'job_title', 'rol': 'job_title', 'role': 'job_title',
  'linkedin_url': 'linkedin_url', 'linkedinurl': 'linkedin_url', 'linkedin url': 'linkedin_url', 'linkedin': 'linkedin_url', 'profile_url': 'linkedin_url', 'profile url': 'linkedin_url',
}

function parseCsvRaw(text: string): CsvRawData {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], sampleRows: [], allRows: [], totalRows: 0 }

  const firstLine = lines[0]
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','

  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === delim && !inQuote) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const FIELD_MAP: Record<string, string> = {
    'first_name': 'first_name', 'firstname': 'first_name', 'first name': 'first_name',
    'nombre': 'first_name', 'name': 'first_name',
    'last_name': 'last_name', 'lastname': 'last_name', 'last name': 'last_name',
    'apellido': 'last_name', 'surname': 'last_name',
    'email': 'email', 'e-mail': 'email', 'correo': 'email',
    'company': 'company', 'empresa': 'company', 'organization': 'company',
    'position': 'job_title', 'title': 'job_title', 'job_title': 'job_title',
    'jobtitle': 'job_title', 'job title': 'job_title', 'cargo': 'job_title',
    'puesto': 'job_title', 'headline': 'job_title',
    'linkedin_url': 'linkedin_url', 'linkedinurl': 'linkedin_url', 'linkedin url': 'linkedin_url',
    'linkedin': 'linkedin_url', 'profile_url': 'linkedin_url', 'url': 'linkedin_url',
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const allRows = lines.slice(1).map(l => parseLine(l))
  const sampleRows = allRows.slice(0, 3)
  return { headers, sampleRows, allRows, totalRows: allRows.length }
}

// ─── Sales Navigator URL parser (multi-strategy, indestructible) ─────────────
function parseSalesNavUrl(rawUrl: string): ParsedSNFilters {
  const empty: ParsedSNFilters = {
    titles: [], regions: [], companies: [], industries: [], seniority: [], keywords: [],
    isValid: false,
  }

  if (!rawUrl.trim()) return empty
  if (!rawUrl.includes('linkedin.com/sales/search')) {
    return { ...empty, error: 'URL no válida. Debe ser de linkedin.com/sales/search/people' }
  }

  try {
    const urlObj = new URL(rawUrl)

    // Get the raw query param (may be encoded once or twice)
    const rawQuery = urlObj.searchParams.get('query') || ''

    // Try decoding up to 2 times to handle double-encoding
    let queryStr = rawQuery
    try { queryStr = decodeURIComponent(rawQuery) } catch { /* keep */ }
    // If still looks encoded, try again
    if (queryStr.includes('%3A') || queryStr.includes('%2C')) {
      try { queryStr = decodeURIComponent(queryStr) } catch { /* keep */ }
    }

    const extractTexts = (filterType: string, str: string): string[] => {
      const texts: string[] = []

      // Strategy 1: Fully decoded — (type:TITLE,values:List((text:CEO,selectionType:INCLUDED)))
      // Also handles multi-value: (type:TITLE,values:List((text:CEO,...),(text:CTO,...)))
      const pattern = new RegExp(`type:${filterType}[^(]*\\(([^§]*)`, 'g')
      // We need to extract all text: values from the block following type:FILTER_TYPE
      // Better: split by type:FILTER_TYPE and process the suffix
      const splits = str.split(`type:${filterType}`)
      if (splits.length > 1) {
        // Take the part right after the filter type name, up to the next filter type
        const afterFilter = splits[1]
        // Extract all text: values in this section  
        const textMatches = [...afterFilter.matchAll(/\btext:([^,)]+)/g)]
        for (const m of textMatches) {
          const val = m[1].trim()
          if (val && val !== 'true' && val !== 'false' && !val.startsWith('id:')) {
            texts.push(val)
          }
          // Stop if we hit another type: declaration
          if (m.index && afterFilter.indexOf('type:', m.index) > -1 && afterFilter.indexOf('type:', m.index) < m.index) break
        }
      }
      return [...new Set(texts)]
    }

    const result: ParsedSNFilters = {
      titles: extractTexts('TITLE', queryStr),
      regions: extractTexts('REGION', queryStr),
      companies: extractTexts('COMPANY', queryStr),
      industries: extractTexts('INDUSTRY', queryStr),
      seniority: extractTexts('SENIORITY_LEVEL', queryStr),
      keywords: extractTexts('KEYWORD', queryStr),
      isValid: true,
    }

    // Also check top-level keywords param
    const kw = urlObj.searchParams.get('keywords')
    if (kw) result.keywords.push(...decodeURIComponent(kw).split(/\s+OR\s+/).map(k => k.trim()).filter(Boolean))

    const hasFilters = result.titles.length > 0 || result.regions.length > 0 ||
      result.keywords.length > 0 || result.companies.length > 0

    if (!hasFilters) {
      result.error = 'No se pudieron extraer filtros. Verifica que la URL sea una búsqueda activa (con filtros aplicados).'
    }

    return result
  } catch (e) {
    return { ...empty, isValid: false, error: `URL malformada: ${(e as Error).message}` }
  }
}

function parseLinkedInSearchUrl(url: string): { keywords: string; isValid: boolean; error?: string } {
  if (!url.trim()) return { keywords: '', isValid: false }
  // Auto-add https:// if missing
  let normalized = url.trim()
  if (!normalized.startsWith('http')) normalized = 'https://' + normalized
  if (!normalized.includes('linkedin.com/search/results/')) {
    return { keywords: '', isValid: false, error: 'URL no válida. Debe ser de linkedin.com/search/results/' }
  }
  try {
    const urlObj = new URL(normalized)
    const keywords = decodeURIComponent(urlObj.searchParams.get('keywords') || '')
    if (!keywords) return { keywords: '', isValid: false, error: 'No se encontró el parámetro "keywords" en la URL. Ejemplo: ...?keywords=CEO+Spain' }
    return { keywords, isValid: true }
  } catch {
    return { keywords: '', isValid: false, error: 'URL malformada' }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20">
      {label}
    </span>
  )
}

function FilterSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-500 shrink-0 w-24">{title}</span>
      <div className="flex flex-wrap gap-1">
        {items.map(item => <FilterTag key={item} label={item} />)}
      </div>
    </div>
  )
}

function AccountSelector({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (v: string) => void }) {
  const valid = accounts.filter(a => a.is_valid)
  if (valid.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        No hay cuentas de LinkedIn conectadas. Ve a <strong>Cuentas</strong> para conectar una.
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-slate-400">Cuenta de LinkedIn a usar</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {valid.map(a => (
            <option key={a.id} value={a.id}>
              {a.profile_name || a.username}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      </div>
    </div>
  )
}


function LimitSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-400">Máximo de leads a importar</label>
        <span className="text-sm font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{value}</span>
      </div>
      <input
        type="range"
        min={5}
        max={100}
        step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>5</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface LeadImportModalProps {
  campaignId: string
  onClose: () => void
  onImported: () => void
}

const METHODS: { id: ImportMethod; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'csv', label: 'CSV', icon: FileText, desc: 'Sube o pega un archivo CSV' },
  { id: 'google_sheets', label: 'Google Sheets', icon: Link2, desc: 'Enlace a hoja pública' },
  { id: 'apollo', label: 'Personas', icon: Zap, desc: 'Búsqueda en LinkedIn via Apify' },
  { id: 'linkedin_search', label: 'LinkedIn URL', icon: Search, desc: 'URL de búsqueda de personas' },
  { id: 'sales_navigator', label: 'Sales Navigator', icon: Briefcase, desc: 'URL de búsqueda SN' },
  { id: 'manual', label: 'Manual', icon: UserPlus, desc: 'Añadir un lead a mano' },
]

export function LeadImportModal({ campaignId, onClose, onImported }: LeadImportModalProps) {
  const [method, setMethod] = React.useState<ImportMethod>('csv')
  const [loading, setLoading] = React.useState(false)
  const [importResult, setImportResult] = React.useState<{ count: number; message: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Accounts
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState('')

  // CSV
  const [csvStep, setCsvStep] = React.useState<'upload' | 'map'>('upload')
  const [csvRawData, setCsvRawData] = React.useState<CsvRawData | null>(null)
  const [colMappings, setColMappings] = React.useState<ColMapping[]>([])
  const [csvText, setCsvText] = React.useState('')
  const [isDragging, setIsDragging] = React.useState(false)

  // Google Sheets
  const [sheetsUrl, setSheetsUrl] = React.useState('')

  // LinkedIn Search
  const [liSearchUrl, setLiSearchUrl] = React.useState('')
  const [liSearchParsed, setLiSearchParsed] = React.useState<{ keywords: string; isValid: boolean; error?: string } | null>(null)
  const [liSearchLimit, setLiSearchLimit] = React.useState(25)

  // Sales Navigator
  const [snUrl, setSnUrl] = React.useState('')
  const [snParsed, setSnParsed] = React.useState<ParsedSNFilters | null>(null)
  const [snLimit, setSnLimit] = React.useState(25)

  // Manual
  const [manualLead, setManualLead] = React.useState({
    first_name: '', last_name: '', company: '', job_title: '', email: '', linkedin_url: '',
  })

  // Apollo
  const [apolloQuery, setApolloQuery] = React.useState({ titles: '', companies: '', locations: '', keywords: '' })
  const [apolloLimit, setApolloLimit] = React.useState(25)

  // Async Apify polling state
  const [isPolling, setIsPolling] = React.useState(false)
  const [pollToken, setPollToken] = React.useState<string | null>(null)
  const [pollMessage, setPollMessage] = React.useState('')

  React.useEffect(() => {
    fetch('/api/linkedin/accounts', { headers: getApiHeaders() })
      .then(r => r.json())
      .then(d => {
        const accs: Account[] = (d.accounts || [])
        setAccounts(accs)
        const firstValid = accs.find(a => a.is_valid)
        if (firstValid) setSelectedAccountId(firstValid.id)
      })
      .catch(() => { /* silent */ })
  }, [])

  // Polling effect — fires every 3s while an Apify job is running
  React.useEffect(() => {
    if (!pollToken) return
    let timeoutId: ReturnType<typeof setTimeout>
    const maxTimeout = setTimeout(() => {
      setPollToken(null)
      setIsPolling(false)
      setError('La búsqueda tardó demasiado. Prueba con menos resultados (máx. 25).')
    }, 3 * 60 * 1000)
    const poll = async () => {
      try {
        const res = await fetch(`/api/linkedin/bulk-import?poll_token=${encodeURIComponent(pollToken)}`, {
          headers: getApiHeaders(),
        })
        const data = await res.json()
        if (data.status === 'done') {
          clearTimeout(maxTimeout)
          setPollToken(null)
          setIsPolling(false)
          setImportResult({ count: data.imported || 0, message: data.message })
          onImported()
          if (method !== 'manual') setTimeout(() => onClose(), 1800)
        } else if (data.status === 'error') {
          clearTimeout(maxTimeout)
          setPollToken(null)
          setIsPolling(false)
          setError(data.error || 'La búsqueda falló. Inténtalo de nuevo.')
        } else {
          setPollMessage(data.message || 'Buscando en LinkedIn...')
          timeoutId = setTimeout(poll, 3000)
        }
      } catch {
        timeoutId = setTimeout(poll, 3000)
      }
    }
    poll()
    return () => { clearTimeout(timeoutId); clearTimeout(maxTimeout) }
  }, [pollToken])

  const goCsvMap = (raw: CsvRawData) => {
    setCsvRawData(raw)
    const auto = raw.headers.map(h => {
      const key = h.toLowerCase().trim()
      const ft = AUTO_FIELD_MAP[key] || 'skip'
      return { fieldType: ft, varName: h }
    })
    setColMappings(auto)
    setCsvStep('map')
  }

  const handleCsvFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = (e.target?.result as string) || ''
      setCsvText(text)
      const raw = parseCsvRaw(text)
      if (raw.totalRows > 0) goCsvMap(raw)
    }
    reader.readAsText(file)
  }

  const handleCsvTextChange = (text: string) => {
    setCsvText(text)
    if (csvStep === 'map') setCsvStep('upload')
    if (text.trim().split('\n').length > 1) {
      const raw = parseCsvRaw(text)
      if (raw.totalRows > 0) goCsvMap(raw)
    }
  }

  const handleLiSearchUrlChange = (url: string) => {
    setLiSearchUrl(url)
    if (url.trim()) setLiSearchParsed(parseLinkedInSearchUrl(url))
    else setLiSearchParsed(null)
  }

  const handleSnUrlChange = (url: string) => {
    setSnUrl(url)
    if (url.trim() && url.includes('linkedin.com')) setSnParsed(parseSalesNavUrl(url))
    else setSnParsed(null)
  }

  const resetResult = () => { setError(null); setImportResult(null) }

  const handleImport = async () => {
    resetResult()
    setLoading(true)
    try {
      let body: Record<string, unknown> = { campaign_id: campaignId }

      if (method === 'csv') {
        if (!csvRawData || csvRawData.totalRows === 0) throw new Error('No hay datos CSV. Sube un archivo o pega el contenido.')
        const mapped = buildLeadsFromMappings(csvRawData.headers, csvRawData.allRows, colMappings)
        if (mapped.length === 0) throw new Error('Ninguna columna está asignada a un campo. Configura al menos una columna.')
        body = { ...body, type: 'csv', leads: mapped }

      } else if (method === 'google_sheets') {
        if (!sheetsUrl.trim()) throw new Error('Introduce la URL de la hoja de Google Sheets.')
        if (!sheetsUrl.includes('docs.google.com/spreadsheets')) throw new Error('URL no válida. Debe ser de docs.google.com/spreadsheets')
        body = { ...body, type: 'google_sheets', url: sheetsUrl }

      } else if (method === 'linkedin_search') {
        if (!liSearchParsed?.isValid) throw new Error(liSearchParsed?.error || 'URL de LinkedIn no válida')
        if (!selectedAccountId) throw new Error('Selecciona una cuenta de LinkedIn')
        // Always send a fully-qualified URL so the backend can parse it
        const normalizedLiUrl = liSearchUrl.trim().startsWith('http') ? liSearchUrl.trim() : 'https://' + liSearchUrl.trim()
        body = { ...body, type: 'linkedin_search', url: normalizedLiUrl, account_id: selectedAccountId, limit: liSearchLimit }

      } else if (method === 'sales_navigator') {
        if (!snParsed?.isValid) throw new Error(snParsed?.error || 'URL de Sales Navigator no válida')
        if (snParsed.error && (snParsed.titles.length === 0 && snParsed.keywords.length === 0)) {
          throw new Error(snParsed.error)
        }
        if (!selectedAccountId) throw new Error('Selecciona una cuenta de LinkedIn')
        body = { ...body, type: 'sales_navigator', url: snUrl, filters: snParsed, account_id: selectedAccountId, limit: snLimit }

      } else if (method === 'apollo') {
        if (!apolloQuery.titles && !apolloQuery.keywords && !apolloQuery.companies) {
          throw new Error('Introduce al menos un cargo, empresa o palabra clave para buscar.')
        }
        body = { ...body, type: 'apollo', apollo_query: apolloQuery, limit: apolloLimit }

      } else if (method === 'manual') {
        if (!manualLead.first_name && !manualLead.linkedin_url) {
          throw new Error('Introduce al menos el nombre o la URL de LinkedIn.')
        }
        body = { ...body, type: 'manual', lead: manualLead }
      }

      const res = await fetch('/api/linkedin/bulk-import', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error importando leads')

      // Handle async Apify job (202 Accepted)
      if (res.status === 202 || data.status === 'processing') {
        if (!data.poll_token) throw new Error('Error iniciando búsqueda. Inténtalo de nuevo.')
        setIsPolling(true)
        setPollMessage(data.message || 'Buscando en LinkedIn...')
        setPollToken(data.poll_token)
        return
      }

      setImportResult({ count: data.imported || 0, message: data.message })
      onImported()

      if (method === 'manual') {
        setManualLead({ first_name: '', last_name: '', company: '', job_title: '', email: '', linkedin_url: '' })
      } else if (method === 'apollo') {
        // keep apollo form for follow-up searches
      } else {
        // Auto-close after 1.5s showing the success message
        setTimeout(() => onClose(), 1500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Importar Leads</h2>
            <p className="text-sm text-slate-500 mt-0.5">Elige un método para añadir leads a esta campaña</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Method tabs */}
        <div className="flex gap-1.5 px-5 pt-4 pb-1 shrink-0 overflow-x-auto scrollbar-hide">
          {METHODS.map(m => {
            const Icon = m.icon
            const active = method === m.id
            return (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); resetResult() }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                )}
              >
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-5 space-y-5">

          {/* ── CSV ── */}
          {method === 'csv' && (
            <div className="space-y-4">
              {csvStep === 'upload' ? (
                <>
                  {/* Drag & drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => {
                      e.preventDefault()
                      setIsDragging(false)
                      const file = e.dataTransfer.files[0]
                      if (file) handleCsvFile(file)
                    }}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                      isDragging ? "border-blue-500 bg-blue-500/5" : "border-slate-700 hover:border-slate-600"
                    )}
                    onClick={() => document.getElementById('csv-file-input')?.click()}
                  >
                    <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-base text-slate-300 font-medium">Arrastra tu CSV aquí o <span className="text-blue-400 underline">haz clic para subir</span></p>
                    <p className="text-sm text-slate-500 mt-1">Soporta .csv y .txt — coma, punto y coma o tabulación</p>
                    <input
                      id="csv-file-input"
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f) }}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-800" />
                    <span className="text-xs text-slate-600">o pega directamente</span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>

                  <textarea
                    value={csvText}
                    onChange={e => handleCsvTextChange(e.target.value)}
                    placeholder={"nombre,apellido,empresa,cargo,linkedin_url,email\nJuan,García,Acme SL,CEO,https://linkedin.com/in/juan,..."}
                    rows={5}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                </>
              ) : csvRawData && (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Asigna las columnas del CSV</p>
                      <p className="text-xs text-slate-500 mt-0.5">{csvRawData.headers.length} columnas detectadas · {csvRawData.totalRows} filas</p>
                    </div>
                    <button
                      onClick={() => { setCsvStep('upload'); setCsvRawData(null) }}
                      className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5 shrink-0 mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" /> Cambiar archivo
                    </button>
                  </div>

                  {/* Card rows — one per CSV column */}
                  <div className="space-y-2">
                    {csvRawData.headers.map((header, idx) => {
                      const mapping = colMappings[idx] || { fieldType: 'skip', varName: header }
                      const samples = csvRawData.sampleRows.map(r => r[idx] || '').filter(Boolean).slice(0, 3)
                      const isSkipped = mapping.fieldType === 'skip'
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "rounded-xl border px-5 py-4 transition-all",
                            isSkipped
                              ? "border-slate-800 bg-slate-900/20 opacity-55"
                              : "border-slate-700 bg-slate-800/25"
                          )}
                        >
                          <div className="flex items-center gap-5">
                            {/* Column info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-100 font-mono">{header}</p>
                              {samples.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {samples.map((s, si) => (
                                    <span key={si} className="text-xs bg-slate-700/60 text-slate-400 px-2.5 py-1 rounded-full truncate max-w-[200px]">{s}</span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Dropdown — wider, easier to click */}
                            <div className="w-56 shrink-0">
                              <div className="relative">
                                <select
                                  value={mapping.fieldType}
                                  onChange={e => {
                                    const ft = e.target.value as FieldType
                                    setColMappings(prev => prev.map((m, i) => i === idx ? { ...m, fieldType: ft, varName: ft === 'custom_var' ? m.varName : m.varName } : m))
                                  }}
                                  className={cn(
                                    "w-full appearance-none rounded-xl px-4 py-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer",
                                    isSkipped
                                      ? "bg-slate-900 border border-slate-700 text-slate-500"
                                      : "bg-slate-900 border border-blue-500/25 text-slate-100"
                                  )}
                                >
                                  <option value="skip">⊘ No importar</option>
                                  <option value="first_name">👤 Nombre</option>
                                  <option value="last_name">👤 Apellido</option>
                                  <option value="email">✉️ Email</option>
                                  <option value="company">🏢 Empresa</option>
                                  <option value="job_title">💼 Cargo / Título</option>
                                  <option value="linkedin_url">🔗 URL de LinkedIn</option>
                                  <option value="custom_var">🔧 Variable personalizada</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                              </div>
                            </div>
                          </div>

                          {/* Custom var config — expands within the card */}
                          {mapping.fieldType === 'custom_var' && (
                            <div className="mt-3.5 pt-3.5 border-t border-slate-700/50">
                              <div className="flex items-center gap-3">
                                <label className="text-xs text-slate-400 shrink-0">Nombre de variable:</label>
                                <input
                                  type="text"
                                  value={mapping.varName}
                                  onChange={e => setColMappings(prev => prev.map((m, i) => i === idx ? { ...m, varName: e.target.value } : m))}
                                  placeholder="mi_variable"
                                  className="flex-1 bg-slate-950 border border-blue-500/30 rounded-lg px-3 py-2 text-sm font-mono text-blue-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                />
                                <span className="text-sm font-mono text-blue-400/70 shrink-0">
                                  {`{{${(mapping.varName || 'variable').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}}}`}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1.5">Usa esta variable en los mensajes de tu secuencia</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer summary */}
                  <div className="flex items-center gap-2 text-sm text-emerald-400 pt-1">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{colMappings.filter(m => m.fieldType !== 'skip').length} columnas asignadas</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-slate-400">{csvRawData.totalRows} leads se importarán</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Google Sheets ── */}
          {method === 'google_sheets' && (
            <div className="space-y-4">
              <div className="text-sm text-slate-500 bg-slate-800/40 rounded-lg p-3.5 space-y-1.5">
                <p><strong className="text-slate-300">Antes de continuar:</strong> La hoja debe ser pública.</p>
                <p>En Google Sheets: <span className="text-slate-300">Archivo → Compartir → "Cualquiera con el enlace puede ver"</span></p>
                <p>Las columnas serán detectadas automáticamente (mismo formato que CSV).</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-400">URL de Google Sheets</label>
                <Input
                  value={sheetsUrl}
                  onChange={e => setSheetsUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="bg-slate-950 border-slate-700 text-sm font-mono"
                />
              </div>
              {sheetsUrl && !sheetsUrl.includes('docs.google.com/spreadsheets') && (
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  URL no válida de Google Sheets
                </div>
              )}
            </div>
          )}

          {/* ── LinkedIn Search ── */}
          {method === 'linkedin_search' && (
            <div className="space-y-4">
              <div className="text-sm text-slate-500 bg-slate-800/40 rounded-lg p-3.5">
                <p><strong className="text-slate-300">Cómo obtener la URL:</strong> Realiza una búsqueda de personas en LinkedIn, filtra por lo que necesitas y copia la URL del navegador.</p>
                <p className="mt-1 text-slate-600">Ejemplo: linkedin.com/search/results/all/?keywords=CEO+Spain</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-400">URL de búsqueda de LinkedIn</label>
                <Input
                  value={liSearchUrl}
                  onChange={e => handleLiSearchUrlChange(e.target.value)}
                  placeholder="https://www.linkedin.com/search/results/all/?keywords=..."
                  className="bg-slate-950 border-slate-700 text-sm font-mono"
                />
              </div>
              {liSearchParsed?.isValid && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
                  <Check className="w-4 h-4" />
                  Palabras clave detectadas: <strong>{liSearchParsed.keywords}</strong>
                </div>
              )}
              {liSearchParsed && !liSearchParsed.isValid && liSearchParsed.error && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {liSearchParsed.error}
                </div>
              )}
              <AccountSelector accounts={accounts} value={selectedAccountId} onChange={setSelectedAccountId} />
              <LimitSlider value={liSearchLimit} onChange={setLiSearchLimit} />
            </div>
          )}

          {/* ── Sales Navigator ── */}
          {method === 'sales_navigator' && (
            <div className="space-y-4">
              <div className="text-sm text-slate-500 bg-slate-800/40 rounded-lg p-3.5">
                <p><strong className="text-slate-300">Cómo obtener la URL:</strong> Abre Sales Navigator, realiza tu búsqueda con los filtros deseados y copia la URL completa del navegador.</p>
                <p className="mt-1 text-slate-600">Funciona con URLs de búsqueda: linkedin.com/sales/search/people?query=...</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-400">URL de Sales Navigator</label>
                <Input
                  value={snUrl}
                  onChange={e => handleSnUrlChange(e.target.value)}
                  placeholder="https://www.linkedin.com/sales/search/people?query=..."
                  className="bg-slate-950 border-slate-700 text-sm font-mono"
                />
              </div>

              {/* Live filter preview — the key differentiator */}
              {snParsed && snParsed.isValid && !snParsed.error && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                    <Check className="w-4 h-4" />
                    Filtros detectados correctamente
                  </div>
                  <div className="space-y-1.5">
                    <FilterSection title="Títulos" items={snParsed.titles} />
                    <FilterSection title="Regiones" items={snParsed.regions} />
                    <FilterSection title="Empresas" items={snParsed.companies} />
                    <FilterSection title="Industrias" items={snParsed.industries} />
                    <FilterSection title="Seniority" items={snParsed.seniority} />
                    <FilterSection title="Keywords" items={snParsed.keywords} />
                  </div>
                </div>
              )}

              {snParsed && snParsed.error && (
                <div className="flex items-start gap-2 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{snParsed.error}</span>
                </div>
              )}

              <AccountSelector accounts={accounts} value={selectedAccountId} onChange={setSelectedAccountId} />
              <LimitSlider value={snLimit} onChange={setSnLimit} />
            </div>
          )}

          {/* ── Apollo ── */}
          {method === 'apollo' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-500/8 border border-blue-500/20">
                <Zap className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-slate-400">
                  <span className="font-medium text-slate-200">Búsqueda de personas en LinkedIn</span>
                  <span className="text-slate-500"> — via Apify con tu cuenta LinkedIn conectada. </span>
                  <span>Filtra por cargo, empresa y ubicación.</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-400">Cargos / Títulos</label>
                  <Input
                    value={apolloQuery.titles}
                    onChange={e => setApolloQuery(q => ({ ...q, titles: e.target.value }))}
                    placeholder="CEO, CTO, Director de Marketing"
                    className="bg-slate-950 border-slate-700 text-sm"
                  />
                  <p className="text-xs text-slate-600">Separa con comas para múltiples</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-400">Empresas</label>
                  <Input
                    value={apolloQuery.companies}
                    onChange={e => setApolloQuery(q => ({ ...q, companies: e.target.value }))}
                    placeholder="Telefónica, BBVA, Inditex"
                    className="bg-slate-950 border-slate-700 text-sm"
                  />
                  <p className="text-xs text-slate-600">Separa con comas para múltiples</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-400">Ubicaciones</label>
                  <Input
                    value={apolloQuery.locations}
                    onChange={e => setApolloQuery(q => ({ ...q, locations: e.target.value }))}
                    placeholder="Spain, Madrid, Barcelona"
                    className="bg-slate-950 border-slate-700 text-sm"
                  />
                  <p className="text-xs text-slate-600">País, ciudad o región</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-400">Palabras clave</label>
                  <Input
                    value={apolloQuery.keywords}
                    onChange={e => setApolloQuery(q => ({ ...q, keywords: e.target.value }))}
                    placeholder="SaaS, startup, fintech"
                    className="bg-slate-950 border-slate-700 text-sm"
                  />
                  <p className="text-xs text-slate-600">Busca en perfil y empresa</p>
                </div>
              </div>
              <LimitSlider value={apolloLimit} onChange={setApolloLimit} />
            </div>
          )}

          {/* ── Manual ── */}
          {method === 'manual' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Nombre *</label>
                  <Input value={manualLead.first_name} onChange={e => setManualLead(l => ({ ...l, first_name: e.target.value }))} placeholder="Juan" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Apellido</label>
                  <Input value={manualLead.last_name} onChange={e => setManualLead(l => ({ ...l, last_name: e.target.value }))} placeholder="García" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Empresa</label>
                  <Input value={manualLead.company} onChange={e => setManualLead(l => ({ ...l, company: e.target.value }))} placeholder="Acme SL" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Cargo</label>
                  <Input value={manualLead.job_title} onChange={e => setManualLead(l => ({ ...l, job_title: e.target.value }))} placeholder="CEO" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-slate-500">URL de LinkedIn *</label>
                  <Input value={manualLead.linkedin_url} onChange={e => setManualLead(l => ({ ...l, linkedin_url: e.target.value }))} placeholder="https://www.linkedin.com/in/juan-garcia" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-slate-500">Email</label>
                  <Input value={manualLead.email} onChange={e => setManualLead(l => ({ ...l, email: e.target.value }))} placeholder="juan@empresa.com" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* Result / Error */}
          {importResult && (
            <div className="flex items-center gap-2 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
              <Check className="w-4 h-4 shrink-0" />
              <span>{importResult.message}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-7 py-5 border-t border-slate-800 shrink-0">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
            Cancelar
          </button>
          <Button onClick={handleImport} disabled={loading || isPolling} className="gap-2 min-w-[140px]">
            {(loading || isPolling) ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isPolling ? (pollMessage || 'Buscando...') : 'Procesando...'}
              </>
            ) : importResult ? (
              <>
                <Check className="w-4 h-4" /> Importar más
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                AÑADIR LEADS
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Build leads from column mappings (used by CSV import) ──────────────────
function buildLeadsFromMappings(
  headers: string[],
  allRows: string[][],
  mappings: ColMapping[]
): Record<string, unknown>[] {
  return allRows.map(row => {
    const lead: Record<string, unknown> = {}
    const customVars: Record<string, string> = {}
    mappings.forEach((m, i) => {
      const val = (row[i] || '').trim()
      if (!val || m.fieldType === 'skip') return
      if (m.fieldType === 'custom_var') {
        const slug = m.varName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `var_${i}`
        customVars[slug] = val
      } else {
        lead[m.fieldType] = val
      }
    })
    if (Object.keys(customVars).length > 0) lead.custom_vars = customVars
    return lead
  }).filter(r => Object.keys(r).length > 0)
}
