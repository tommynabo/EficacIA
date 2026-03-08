import * as React from "react"
import { X, FileText, Search, Briefcase, UserPlus, Upload, Check, AlertCircle, Link2, ChevronDown } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { cn } from "@/src/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type ImportMethod = 'csv' | 'google_sheets' | 'linkedin_search' | 'sales_navigator' | 'manual'

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
}

function parseCSVPreview(text: string): { rows: Record<string, string>[]; detectedColumns: string[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], detectedColumns: [] }

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

  const rawHeaders = parseLine(lines[0])
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/['"]/g, '').trim())
  const fieldMapping = headers.map(h => FIELD_MAP[h] || null)
  const detectedColumns = fieldMapping.filter(Boolean) as string[]

  const rows = lines.slice(1, 6).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    fieldMapping.forEach((field, i) => {
      if (field && values[i]) row[field] = values[i]
    })
    return row
  }).filter(r => Object.keys(r).length > 0)

  return { rows, detectedColumns: [...new Set(detectedColumns)] }
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
  if (!url.includes('linkedin.com/search/results/people')) {
    return { keywords: '', isValid: false, error: 'URL no válida. Debe ser de linkedin.com/search/results/people' }
  }
  try {
    const urlObj = new URL(url)
    const keywords = decodeURIComponent(urlObj.searchParams.get('keywords') || '')
    if (!keywords) return { keywords: '', isValid: false, error: 'No se encontró el parámetro "keywords" en la URL' }
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
  { id: 'linkedin_search', label: 'LinkedIn Búsqueda', icon: Search, desc: 'URL de búsqueda de personas' },
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
  const [csvText, setCsvText] = React.useState('')
  const [csvPreview, setCsvPreview] = React.useState<{ rows: Record<string, string>[]; detectedColumns: string[] } | null>(null)
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

  const handleCsvFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = (e.target?.result as string) || ''
      setCsvText(text)
      setCsvPreview(parseCSVPreview(text))
    }
    reader.readAsText(file)
  }

  const handleCsvTextChange = (text: string) => {
    setCsvText(text)
    if (text.trim().length > 10) {
      setCsvPreview(parseCSVPreview(text))
    } else {
      setCsvPreview(null)
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
        if (!csvText.trim()) throw new Error('No hay datos CSV. Sube un archivo o pega el contenido.')
        if (!csvPreview || csvPreview.rows.length === 0) throw new Error('No se han podido leer filas del CSV. Revisa el formato.')
        body = { ...body, type: 'csv', leads: buildLeadsFromCsvText(csvText) }

      } else if (method === 'google_sheets') {
        if (!sheetsUrl.trim()) throw new Error('Introduce la URL de la hoja de Google Sheets.')
        if (!sheetsUrl.includes('docs.google.com/spreadsheets')) throw new Error('URL no válida. Debe ser de docs.google.com/spreadsheets')
        body = { ...body, type: 'google_sheets', url: sheetsUrl }

      } else if (method === 'linkedin_search') {
        if (!liSearchParsed?.isValid) throw new Error(liSearchParsed?.error || 'URL de LinkedIn no válida')
        if (!selectedAccountId) throw new Error('Selecciona una cuenta de LinkedIn')
        body = { ...body, type: 'linkedin_search', url: liSearchUrl, account_id: selectedAccountId, limit: liSearchLimit }

      } else if (method === 'sales_navigator') {
        if (!snParsed?.isValid) throw new Error(snParsed?.error || 'URL de Sales Navigator no válida')
        if (snParsed.error && (snParsed.titles.length === 0 && snParsed.keywords.length === 0)) {
          throw new Error(snParsed.error)
        }
        if (!selectedAccountId) throw new Error('Selecciona una cuenta de LinkedIn')
        body = { ...body, type: 'sales_navigator', url: snUrl, filters: snParsed, account_id: selectedAccountId, limit: snLimit }

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

      setImportResult({ count: data.imported || 0, message: data.message })
      onImported()

      if (method === 'manual') {
        setManualLead({ first_name: '', last_name: '', company: '', job_title: '', email: '', linkedin_url: '' })
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
              <div className="text-sm text-slate-500 bg-slate-800/40 rounded-lg p-3.5">
                <strong className="text-slate-300">Columnas detectadas automáticamente:</strong>{' '}
                first_name, last_name, email, company, position / job_title, linkedin_url (en inglés o español)
              </div>

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
                  "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
                  isDragging ? "border-blue-500 bg-blue-500/5" : "border-slate-700 hover:border-slate-600"
                )}
                onClick={() => document.getElementById('csv-file-input')?.click()}
              >
                <Upload className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-300">Arrastra tu CSV aquí o <span className="text-blue-400 underline">haz clic para subir</span></p>
                <p className="text-sm text-slate-500 mt-1">Soporta .csv y .txt — coma, punto y coma o tabulación</p>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f) }}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-xs text-slate-600 bg-slate-900 px-2">o pega directamente</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="h-4" />
              </div>

              <textarea
                value={csvText}
                onChange={e => handleCsvTextChange(e.target.value)}
                placeholder={"nombre,apellido,empresa,cargo,linkedin_url,email\nJuan,García,Acme SL,CEO,https://linkedin.com/in/juan,..."}
                rows={5}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />

              {csvPreview && csvPreview.rows.length > 0 && (
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-slate-700">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs text-slate-300">
                      Columnas detectadas: <span className="text-emerald-400 font-medium">{csvPreview.detectedColumns.join(', ')}</span>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800">
                          {csvPreview.detectedColumns.map(col => (
                            <th key={col} className="text-left px-3 py-1.5 text-slate-500 font-medium">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.rows.map((row, i) => (
                          <tr key={i} className="border-b border-slate-800/50 last:border-0">
                            {csvPreview.detectedColumns.map(col => (
                              <td key={col} className="px-3 py-1.5 text-slate-400 truncate max-w-[140px]">{row[col] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 text-xs text-slate-500 bg-slate-800/30">
                    Mostrando primeras 5 filas de vista previa
                  </div>
                </div>
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
                <p className="mt-1 text-slate-600">Ejemplo: linkedin.com/search/results/people/?keywords=CEO+Spain</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-400">URL de búsqueda de LinkedIn</label>
                <Input
                  value={liSearchUrl}
                  onChange={e => handleLiSearchUrlChange(e.target.value)}
                  placeholder="https://www.linkedin.com/search/results/people/?keywords=..."
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
          <Button onClick={handleImport} disabled={loading} className="gap-2 min-w-[140px]">
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importando…
              </>
            ) : importResult ? (
              <>
                <Check className="w-4 h-4" /> Importar más
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {method === 'manual' ? 'Añadir Lead' : 'Importar Leads'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Build full leads array from CSV text (for submit) ────────────────────────
function buildLeadsFromCsvText(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','

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
    'first_name': 'first_name', 'firstname': 'first_name', 'first name': 'first_name', 'nombre': 'first_name', 'name': 'first_name',
    'last_name': 'last_name', 'lastname': 'last_name', 'last name': 'last_name', 'apellido': 'last_name', 'surname': 'last_name',
    'email': 'email', 'e-mail': 'email', 'correo': 'email',
    'company': 'company', 'empresa': 'company', 'organization': 'company', 'organisation': 'company',
    'position': 'job_title', 'title': 'job_title', 'job_title': 'job_title', 'jobtitle': 'job_title', 'job title': 'job_title',
    'cargo': 'job_title', 'puesto': 'job_title', 'headline': 'job_title',
    'linkedin_url': 'linkedin_url', 'linkedinurl': 'linkedin_url', 'linkedin url': 'linkedin_url',
    'linkedin': 'linkedin_url', 'profile_url': 'linkedin_url', 'url': 'linkedin_url',
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, '').trim())
  const fieldMapping = headers.map(h => FIELD_MAP[h] || null)

  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    fieldMapping.forEach((field, i) => {
      if (field && values[i]) row[field] = values[i]
    })
    return row
  }).filter(r => Object.keys(r).length > 0)
}
