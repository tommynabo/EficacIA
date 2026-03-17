import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { getAuthUser } from '../_lib/auth.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// ─── Google Sheets: extract sheet ID and fetch CSV ───────────────────────────
async function fetchGoogleSheetsCsv(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('URL de Google Sheets no válida. Debe contener /spreadsheets/d/{ID}');
  const sheetId = match[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(csvUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.status === 401 || res.status === 403 || res.url?.includes('accounts.google.com')) {
    throw new Error('La hoja no es pública. Ve a "Compartir" → "Cualquiera con el enlace puede ver" y vuelve a intentarlo.');
  }
  if (!res.ok) throw new Error(`No se pudo acceder a la hoja (${res.status}). Verifica que la URL sea correcta y la hoja sea pública.`);
  return await res.text();
}

// ─── CSV parser: handles comma, semicolon and tab delimiters + quoted fields ─
function parseCsvToLeads(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('El CSV está vacío o solo tiene cabeceras, sin datos.');

  const firstLine = lines[0];
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const FIELD_MAP = {
    'first_name': 'first_name', 'firstname': 'first_name', 'first name': 'first_name',
    'nombre': 'first_name', 'name': 'first_name', 'given name': 'first_name',
    'last_name': 'last_name', 'lastname': 'last_name', 'last name': 'last_name',
    'apellido': 'last_name', 'surname': 'last_name', 'family name': 'last_name',
    'email': 'email', 'e-mail': 'email', 'correo': 'email', 'email address': 'email',
    'company': 'company', 'empresa': 'company', 'organization': 'company',
    'organisation': 'company', 'company name': 'company',
    'position': 'job_title', 'title': 'job_title', 'job_title': 'job_title',
    'jobtitle': 'job_title', 'job title': 'job_title', 'cargo': 'job_title',
    'puesto': 'job_title', 'headline': 'job_title', 'role': 'job_title',
    'linkedin_url': 'linkedin_url', 'linkedinurl': 'linkedin_url', 'linkedin url': 'linkedin_url',
    'linkedin': 'linkedin_url', 'profile_url': 'linkedin_url', 'url': 'linkedin_url',
    'profile url': 'linkedin_url', 'linkedin profile': 'linkedin_url',
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/['"]/g, '').trim());
  const fieldMapping = headers.map(h => FIELD_MAP[h] || null);

  const leads = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row = {};
    fieldMapping.forEach((field, i) => {
      if (field && values[i] !== undefined && values[i] !== '') {
        row[field] = values[i];
      }
    });
    return row;
  }).filter(row => Object.keys(row).length > 0);

  if (leads.length === 0) throw new Error('No se encontraron columnas reconocidas. Asegúrate de que las cabeceras incluyan: first_name, last_name, email, company, linkedin_url, etc.');
  return leads;
}

// ─── Unipile: retrieve all LinkedIn cookies for a managed account ─────────────
// Extracts li_at, JSESSIONID and any others to build a full cookie string.
async function getLinkedInCookiesFromUnipile(unipileAccountId) {
  const dsn    = (process.env.UNIPILE_DSN    || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();
  if (!dsn || !apiKey) return null;
  try {
    const res = await fetch(`https://${dsn}/api/v1/accounts/${unipileAccountId}`, {
      headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
    });
    if (!res.ok) {
      console.error('[UNIPILE] Failed to fetch account:', res.status);
      return null;
    }
    const data = await res.json();
    const cp = data.connection_params || {};
    const im = cp.im || {};
    
    // Try different possible paths for cookies
    let cookies = im.cookies || cp.cookies || data.cookies || null;
    
    console.log('[UNIPILE] Account structure keys:', Object.keys(data));
    console.log('[UNIPILE] connection_params keys:', Object.keys(cp));
    if (im) console.log('[UNIPILE] connection_params.im keys:', Object.keys(im));

    // If it's already a string, return as is
    if (typeof cookies === 'string') {
      console.log('[UNIPILE] Found raw cookie string');
      return cookies;
    }

    // Fallback: search for li_at directly if no cookies array
    if (!cookies || !Array.isArray(cookies)) {
      const liAt = im.li_at || cp.li_at || data.li_at;
      if (liAt) {
        console.log('[UNIPILE] Found li_at in alternative path');
        return `li_at=${liAt}`;
      }
    }

    if (Array.isArray(cookies)) {
      const cookieStr = cookies
        .map(c => `${c.name || c.key}=${c.value}`)
        .join('; ');
      
      console.log(`[UNIPILE] Built cookie string with ${cookies.length} cookies`);
      return cookieStr;
    }

    console.warn('[UNIPILE] No cookies found. Full Response:', JSON.stringify(data).slice(0, 500));
    return null;
  } catch (err) {
    console.error('[UNIPILE] Error fetching cookies:', err.message);
    return null;
  }
}

// ─── Apify-powered search (async — works within Vercel 10s limit) ────────────
// All search methods (Apollo, LinkedIn Search, Sales Navigator) use the Google
// Search Scraper to find LinkedIn profiles. No paid actors or cookies needed.
//   Actor: https://apify.com/apify/google-search-scraper
const ACTOR_GOOGLE    = 'apify~google-search-scraper';

async function startApifyRun(actorSlug, input) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  if (!token) throw new Error('APIFY_API_TOKEN no configurado en Vercel. Añádelo en Settings → Environment Variables.');
  const url = `https://api.apify.com/v2/acts/${actorSlug}/runs?token=${encodeURIComponent(token)}`;
  const safeInput = { ...input };
  if (safeInput.cookie) safeInput.cookie = '***';
  if (safeInput.liAtCookie) safeInput.liAtCookie = '***';
  console.log('[APIFY] Starting run:', actorSlug, 'input:', JSON.stringify(safeInput));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    const errBody = await res.text().catch(() => '');
    console.error('[APIFY] 401 Unauthorized:', errBody);
    throw new Error('Apify API Token inválido. Verifica APIFY_API_TOKEN en Vercel.');
  }
  if (res.status === 402) {
    const errBody = await res.text().catch(() => '');
    console.error('[APIFY] 402 Payment Required:', errBody);
    throw new Error('Créditos Apify insuficientes o suscripción al actor requerida. Revisa tu cuenta en apify.com.');
  }
  if (res.status === 403) {
    const errBody = await res.text().catch(() => '');
    console.error('[APIFY] 403 Forbidden:', errBody);
    throw new Error(`Sin permisos para ejecutar el actor ${actorSlug}. Es posible que necesites "alquilar" (rent) este actor en apify.com/store primero.`);
  }
  if (res.status === 404) {
    throw new Error(`Actor de Apify no encontrado: ${actorSlug}. Verifica que el nombre sea correcto.`);
  }
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[APIFY] startRun error:', res.status, err);
    throw new Error(`Error al iniciar búsqueda Apify (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  console.log('[APIFY] Run started OK. runId:', data.data.id, '| datasetId:', data.data.defaultDatasetId);
  return { runId: data.data.id, datasetId: data.data.defaultDatasetId };
}

async function checkApifyRun(runId) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Error polling Apify run: ${res.status}`);
  const data = await res.json();
  console.log('[APIFY POLL] Run', runId, '→ status:', data.data?.status);
  return data.data; // { status, defaultDatasetId, ... }
}

async function fetchApifyDataset(datasetId, limit = 50) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&limit=${limit}&format=json`
  );
  if (!res.ok) throw new Error(`Error fetching dataset: ${res.status}`);
  const items = await res.json();
  console.log('[APIFY DATASET] datasetId:', datasetId, '| items received:', Array.isArray(items) ? items.length : typeof items);
  return items;
}

function extractProfilesFromApify(items, limit) {
  const profiles = [];
  for (const item of (Array.isArray(items) ? items : [])) {
    if (profiles.length >= limit) break;
    if (!item.url && !item.linkedin_url && !item.linkedinUrl) continue;
    profiles.push({
      first_name:   item.first_name || item.firstName || '',
      last_name:    item.last_name || item.lastName || '',
      job_title:    item.job_title || item.title || item.position || '',
      company:      item.company || item.companyName || '',
      linkedin_url: item.linkedin_url || item.url || item.linkedinUrl || '',
      email:        item.email || null,
    });
  }
  return profiles;
}

// ─── Direct LinkedIn Sales Navigator API ────────────────────────────────────
// Calls LinkedIn's internal salesApiLeadSearch with the user's session cookie.
// Returns the EXACT same profiles shown in the Sales Navigator search URL.
async function fetchSalesNavProfiles(snUrl, liAt, count = 25) {
  const urlObj = new URL(snUrl);
  const queryParam = urlObj.searchParams.get('query') || '';
  if (!queryParam) throw new Error('No se encontraron filtros de búsqueda en la URL de Sales Navigator.');

  const results = [];
  const pageSize = Math.min(count, 25);
  let start = 0;

  while (results.length < count) {
    const remaining = count - results.length;
    const thisPageSize = Math.min(pageSize, remaining);

    const apiUrl = `https://www.linkedin.com/sales-api/salesApiLeadSearch?q=searchQuery&query=${encodeURIComponent(queryParam)}&start=${start}&count=${thisPageSize}&decorationId=com.linkedin.sales.deco.desktop.searchv2.LeadSearchResult-14`;

    console.log(`[SN-API] Fetching page start=${start} count=${thisPageSize}`);

    const response = await fetch(apiUrl, {
      headers: {
        'Cookie': `li_at=${liAt}; JSESSIONID="ajax:0"`,
        'csrf-token': 'ajax:0',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'Accept': 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    if (response.status === 401 || response.status === 403) {
      console.error('[SN-API] Auth failed:', response.status);
      throw new Error('Tu sesión de LinkedIn ha expirado. Ve a Cuentas LinkedIn y vuelve a conectar tu cuenta.');
    }
    if (response.status === 429) {
      console.warn('[SN-API] Rate limited');
      throw new Error('LinkedIn está limitando las peticiones. Espera unos minutos e inténtalo de nuevo.');
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[SN-API] Error:', response.status, errText.slice(0, 300));
      throw new Error(`Error de LinkedIn Sales Navigator (${response.status}). Puede que tu sesión haya expirado.`);
    }

    const data = await response.json();
    const elements = data.elements || [];
    console.log(`[SN-API] Got ${elements.length} elements`);

    if (elements.length === 0) break;

    for (const el of elements) {
      if (results.length >= count) break;
      const firstName = el.firstName || '';
      const lastName = el.lastName || '';
      const currentPos = (el.currentPositions || [])[0] || {};
      const jobTitle = currentPos.title || el.title || '';
      const company = currentPos.companyName || currentPos.companyUrnResolutionResult?.name || el.companyName || '';
      let linkedinUrl = '';
      const profileId = el.publicIdentifier || el.entityUrn?.split(':').pop() || '';
      if (profileId) linkedinUrl = `https://www.linkedin.com/in/${profileId}/`;
      results.push({
        first_name: firstName, last_name: lastName,
        job_title: jobTitle, company: company,
        linkedin_url: linkedinUrl, email: null,
        custom_vars: { location: el.geoRegion || '' },
      });
    }
    start += elements.length;
    if (elements.length < thisPageSize) break;
  }

  console.log(`[SN-API] Total profiles extracted: ${results.length}`);
  return results;
}

function extractProfilesFromUnipileSearch(items, limit) {
  const profiles = [];
  for (const item of (Array.isArray(items) ? items : [])) {
    if (profiles.length >= limit) break;
    // Unipile search results structure varies but usually has these
    profiles.push({
      first_name:   item.first_name || item.given_name || '',
      last_name:    item.last_name || item.family_name || '',
      job_title:    item.headline || item.job_title || '',
      company:      item.company || '',
      linkedin_url: item.public_url || item.linkedin_url || item.url || '',
      email:        item.email || null,
    });
  }
  return profiles;
}

async function getLiAtForUser(userId) {
  const { data } = await supabaseAdmin
    .from('linkedin_accounts')
    .select('session_cookie')
    .eq('user_id', userId)
    .eq('is_valid', true)
    .neq('session_cookie', 'managed_by_unipile')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!data?.session_cookie || data.session_cookie.length < 20) return null;
  return data.session_cookie;
}

// ─── Google-based LinkedIn profile search (no cookies needed) ───────────────
// Builds a site:linkedin.com/in query from structured filters.
function buildGoogleLinkedInQuery(filters = {}) {
  const toArr = v => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? (x.text || x.name || '') : String(x))).filter(Boolean);
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
  };
  const parts    = ['site:linkedin.com/in'];
  const titles   = toArr(filters.titles);
  const companies= toArr(filters.companies);
  const locations= [...toArr(filters.locations), ...toArr(filters.regions)].slice(0, 3);
  const keywords = toArr(filters.keywords);
  if (titles.length)    parts.push('(' + titles.map(t => `"${t}"`).join(' OR ') + ')');
  if (companies.length) parts.push('(' + companies.map(c => `"${c}"`).join(' OR ') + ')');
  if (locations.length) parts.push('(' + locations.map(l => `"${l}"`).join(' OR ') + ')');
  if (keywords.length)  parts.push(keywords.join(' '));
  return parts.join(' ');
}

// ─── Parse Sales Navigator URL into Google search query ─────────────────────
// Extracts keywords and filter text values from a SN URL and builds an
// equivalent Google site:linkedin.com/in query.
function parseSalesNavUrlToGoogleQuery(snUrl) {
  try {
    const normalizedUrl = snUrl.trim().startsWith('http') ? snUrl.trim() : 'https://' + snUrl.trim();
    const urlObj = new URL(normalizedUrl);

    // The query param is inside parentheses: ?query=(...)
    const rawQuery = urlObj.searchParams.get('query') || '';
    // Decode double-encoded values
    const decoded = decodeURIComponent(decodeURIComponent(rawQuery));

    const parts = ['site:linkedin.com/in'];

    // Extract keywords from the query string
    const kwMatch = decoded.match(/keywords[:\s]*([^,)]+)/i);
    if (kwMatch) {
      parts.push(kwMatch[1].trim());
    }

    // Extract region/location text values
    const regionTexts = [];
    const regionRegex = /type[:\s]*REGION.*?values[:\s]*List\(([^)]+)\)/is;
    const regionMatch = decoded.match(regionRegex);
    if (regionMatch) {
      const textMatches = regionMatch[1].matchAll(/text[:\s]*([^,)]+)/gi);
      for (const m of textMatches) {
        const clean = m[1].trim().replace(/%20/g, ' ');
        if (clean && clean.length > 2) regionTexts.push(clean);
      }
    }
    if (regionTexts.length) {
      parts.push('(' + regionTexts.slice(0, 3).map(r => `"${r}"`).join(' OR ') + ')');
    }

    // Extract job title text values
    const titleTexts = [];
    const titleRegex = /type[:\s]*(?:FUNCTION|SENIORITY_LEVEL|TITLE).*?values[:\s]*List\(([^)]+)\)/is;
    const titleMatch = decoded.match(titleRegex);
    if (titleMatch) {
      const textMatches = titleMatch[1].matchAll(/text[:\s]*([^,)]+)/gi);
      for (const m of textMatches) {
        const clean = m[1].trim().replace(/%20/g, ' ');
        if (clean && clean.length > 2) titleTexts.push(clean);
      }
    }
    if (titleTexts.length) {
      parts.push('(' + titleTexts.slice(0, 3).map(t => `"${t}"`).join(' OR ') + ')');
    }

    // Extract company text values
    const companyTexts = [];
    const companyRegex = /type[:\s]*(?:CURRENT_COMPANY|COMPANY).*?values[:\s]*List\(([^)]+)\)/is;
    const companyMatch = decoded.match(companyRegex);
    if (companyMatch) {
      const textMatches = companyMatch[1].matchAll(/text[:\s]*([^,)]+)/gi);
      for (const m of textMatches) {
        const clean = m[1].trim().replace(/%20/g, ' ');
        if (clean && clean.length > 2) companyTexts.push(clean);
      }
    }
    if (companyTexts.length) {
      parts.push('(' + companyTexts.slice(0, 3).map(c => `"${c}"`).join(' OR ') + ')');
    }

    const query = parts.join(' ');
    console.log('[SN→GOOGLE] Parsed SN URL into Google query:', query);
    return query;
  } catch (err) {
    console.warn('[SN→GOOGLE] Could not parse SN URL, using raw keywords:', err.message);
    // Fallback: try to extract any readable text
    const kwMatch = snUrl.match(/keywords[=:]+([^&]+)/i);
    const fallback = kwMatch ? decodeURIComponent(kwMatch[1]).replace(/[+%20]/g, ' ') : 'linkedin';
    return `site:linkedin.com/in ${fallback}`;
  }
}

// Parse Google Search Scraper dataset items into lead records.
// The actor outputs individual organic result items: { url, title, description }
// OR nested under item.organicResults[] depending on version.
function extractProfilesFromGoogle(rawItems, limit) {
  const results = [];
  for (const item of (Array.isArray(rawItems) ? rawItems : [])) {
    const toProcess = Array.isArray(item.organicResults) ? item.organicResults : [item];
    for (const r of toProcess) {
      if (!r.url || !r.url.includes('linkedin.com/in/')) continue;
      const cleanUrl  = r.url.split('?')[0].split('#')[0];
      // Google title: "FirstName LastName - Job Title - Company | LinkedIn"
      const rawTitle  = (r.title || '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      const parts     = rawTitle.split(/\s*[-–]\s*/);
      const nameWords = (parts[0] || '').trim().split(' ');
      results.push({
        first_name:   nameWords[0] || '',
        last_name:    nameWords.slice(1).join(' ') || '',
        job_title:    (parts[1] || '').trim(),
        company:      (parts[2] || '').trim(),
        linkedin_url: cleanUrl,
        email:        null,
      });
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  return results;
}

function buildLinkedInSearchUrl(q) {
  const parts = [
    ...(q.titles    ? q.titles.split(',').map(s => s.trim())    : []),
    ...(q.companies ? q.companies.split(',').map(s => s.trim()) : []),
    ...(q.locations ? q.locations.split(',').map(s => s.trim()) : []),
    q.keywords || '',
  ].filter(Boolean);
  const params = new URLSearchParams({ keywords: parts.join(' '), origin: 'GLOBAL_SEARCH_HEADER' });
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

// ─── DB helper: insert leads + update campaign counter ────────────────────────
async function insertLeadsIntoDB(teamId, campaignId, rawLeads) {
  const leadsToInsert = rawLeads.map((lead) => {
    const title = lead.job_title || lead.jobTitle || lead.position || lead.title || '';
    return {
      team_id: teamId,
      campaign_id: campaignId || null,
      first_name: lead.first_name || lead.firstName || '',
      last_name: lead.last_name || lead.lastName || '',
      company: lead.company || '',
      position: title,
      job_title: title,
      linkedin_url: lead.linkedin_url || lead.linkedinUrl || lead.url || '',
      email: lead.email || null,
      custom_vars: lead.custom_vars || {},
      status: 'new',
      sent_message: false,
    };
  });

  const { data: inserted, error } = await supabaseAdmin
    .from('leads')
    .insert(leadsToInsert)
    .select();

  if (error) throw new Error(error.message);

  if (campaignId) {
    const { count } = await supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);
    await supabaseAdmin
      .from('campaigns')
      .update({ leads_count: count || 0 })
      .eq('id', campaignId);
  }

  return inserted?.length || 0;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('[BULK-IMPORT]', req.method, req.query?.poll_token ? '(poll)' : '');

  const { userId, error: authError } = await getAuthUser(req);
  if (!userId) {
    console.error('[BULK-IMPORT] Auth error:', authError);
    return res.status(401).json({ error: authError || 'No autenticado' });
  }

  // ── GET: poll Apify job status ──────────────────────────────────────────
  if (req.method === 'GET') {
    const { poll_token } = req.query || {};
    if (!poll_token) return res.status(400).json({ error: 'poll_token requerido' });
    let pollData;
    try {
      pollData = jwt.verify(poll_token, process.env.JWT_SECRET || 'dev-secret');
    } catch {
      return res.status(400).json({ error: 'poll_token inválido o expirado' });
    }
    if (pollData.userId !== userId) return res.status(403).json({ error: 'No autorizado' });
    try {
      const run = await checkApifyRun(pollData.runId);
      if (['RUNNING', 'READY', 'INITIALIZING', 'PAUSING', 'PAUSED'].includes(run.status)) {
        return res.status(200).json({ status: 'processing', message: 'Buscando en LinkedIn...' });
      }
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
        console.error('[APIFY POLL] Run failed:', run.status, run.id);
        return res.status(200).json({ status: 'error', error: 'La búsqueda falló en Apify. Inténtalo de nuevo.' });
      }
      if (run.status === 'SUCCEEDED') {
        const items = await fetchApifyDataset(run.defaultDatasetId || pollData.datasetId, pollData.limit);
        let rawLeads = [];
        // All methods now use Google Search Scraper
        rawLeads = extractProfilesFromGoogle(items, pollData.limit);
        if (rawLeads.length === 0) {
          return res.status(200).json({ status: 'done', success: true, imported: 0, message: '✓ Búsqueda completada sin resultados. Prueba con otros filtros.' });
        }
        const imported = await insertLeadsIntoDB(pollData.teamId, pollData.campaignId, rawLeads);
        return res.status(200).json({ status: 'done', success: true, imported, message: `✓ ${imported} lead${imported !== 1 ? 's' : ''} importado${imported !== 1 ? 's' : ''} desde LinkedIn` });
      }
      return res.status(200).json({ status: 'processing' });
    } catch (err) {
      console.error('[APIFY POLL] Error:', err.message);
      return res.status(200).json({ status: 'error', error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { type, leads, campaign_id, url, account_id, lead, limit = 25, filters, apollo_query, li_at: bodyLiAt } = req.body || {};
    const importType = type || (Array.isArray(leads) ? 'csv' : 'unknown');

    console.log('[BULK-IMPORT] POST type:', importType, '| has account_id:', !!account_id);

    if (!importType || importType === 'unknown') {
      return res.status(400).json({ error: 'Tipo de importación no especificado' });
    }

    // ── Get or create team ──────────────────────────────────────────────────
    let teamId;
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);

    if (teams && teams.length > 0) {
      teamId = teams[0].id;
    } else {
      const { data: newTeam } = await supabaseAdmin
        .from('teams')
        .insert({ owner_id: userId, name: 'Mi Equipo' })
        .select()
        .single();
      teamId = newTeam?.id;
    }

    if (!teamId) return res.status(500).json({ error: 'No se pudo obtener el equipo' });

    let rawLeads = [];

    try {
      // ── Extension / CSV / leads array ─────────────────────────────────────
      if (importType === 'csv' || importType === 'leads' || importType === 'extension') {
        if (!leads || !Array.isArray(leads) || leads.length === 0) {
          return res.status(400).json({ error: 'No se proporcionaron leads para importar' });
        }
        rawLeads = leads;

      // ── Google Sheets ─────────────────────────────────────────────────────
      } else if (importType === 'google_sheets') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de Google Sheets' });
        const csvText = await fetchGoogleSheetsCsv(url);
        rawLeads = parseCsvToLeads(csvText);

      // ── Apollo → Google LinkedIn people search ────────────────────────────
      } else if (importType === 'apollo') {
        const q = apollo_query || {};
        if (!q.titles && !q.keywords && !q.companies) {
          return res.status(400).json({ error: 'Introduce al menos un cargo, empresa o palabra clave.' });
        }
        const searchLimit = Math.min(limit, 50);
        const googleQuery = buildGoogleLinkedInQuery(q);
        console.log('[GOOGLE] apollo query:', googleQuery);
        const { runId, datasetId } = await startApifyRun(ACTOR_GOOGLE, {
          queries:          googleQuery,
          maxPagesPerQuery: Math.ceil(searchLimit / 10),
          resultsPerPage:   10,
        });
        const pollToken = jwt.sign(
          { runId, datasetId, teamId, campaignId: campaign_id || null, limit: searchLimit, userId, actor: 'google' },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: '10m' }
        );
        return res.status(202).json({ status: 'processing', poll_token: pollToken, message: 'Buscando perfiles en LinkedIn…' });

      // ── LinkedIn Search URL → Google ──────────────────────────────────────
      } else if (importType === 'linkedin_search') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de búsqueda' });
        const searchLimit = Math.min(limit, 50);
        // Extract keywords from the LinkedIn search URL and build a Google query
        let googleQuery;
        try {
          const normalizedUrl = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
          const urlObj = new URL(normalizedUrl);
          const keywords = urlObj.searchParams.get('keywords') || '';
          googleQuery = buildGoogleLinkedInQuery({ keywords });
        } catch {
          googleQuery = `site:linkedin.com/in ${url}`;
        }
        console.log('[GOOGLE] linkedin_search query:', googleQuery);
        const { runId, datasetId } = await startApifyRun(ACTOR_GOOGLE, {
          queries:          googleQuery,
          maxPagesPerQuery: Math.ceil(searchLimit / 10),
          resultsPerPage:   10,
        });
        const pollToken = jwt.sign(
          { runId, datasetId, teamId, campaignId: campaign_id || null, limit: searchLimit, userId, actor: 'google' },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: '10m' }
        );
        return res.status(202).json({ status: 'processing', poll_token: pollToken, message: 'Buscando perfiles en LinkedIn…' });

      // ── Sales Navigator → Direct LinkedIn API (exact profiles) ──────────
      } else if (importType === 'sales_navigator') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de Sales Navigator' });
        const searchLimit = Math.min(limit, 50);

        // 1. Resolve Session Cookie (li_at) from user's connected account
        let liAt = bodyLiAt; // Manual override from body (if any)

        if (!liAt && account_id) {
          const { data: acc } = await supabaseAdmin
            .from('linkedin_accounts')
            .select('*')
            .eq('id', account_id)
            .single();

          if (acc) {
            if (acc.session_cookie && acc.session_cookie !== 'managed_by_unipile') {
              liAt = acc.session_cookie;
              console.log('[SALES NAV] Using stored session_cookie from account', account_id);
            } else if (acc.unipile_account_id) {
              liAt = await getLinkedInCookiesFromUnipile(acc.unipile_account_id);
              console.log('[SALES NAV] Tried Unipile cookie, got:', liAt ? 'yes' : 'no');
            }
          }
        }

        // Fallback: any valid cookie from user's accounts
        if (!liAt) {
          liAt = await getLiAtForUser(userId);
          if (liAt) console.log('[SALES NAV] Using fallback cookie from getLiAtForUser');
        }

        if (!liAt || liAt.length < 20) {
          return res.status(400).json({
            error: 'No se encontró una cookie de sesión válida. Ve a Cuentas LinkedIn y reconecta tu cuenta.'
          });
        }

        // 2. Call LinkedIn's own Sales Navigator API directly
        console.log('[SALES NAV] Calling LinkedIn API directly for exact profiles...');
        rawLeads = await fetchSalesNavProfiles(url, liAt, searchLimit);

        if (rawLeads.length === 0) {
          return res.status(200).json({
            success: true,
            imported: 0,
            message: '✓ Búsqueda completada sin resultados. Prueba con otros filtros en Sales Navigator.'
          });
        }
        // Falls through to insertLeadsIntoDB below

      // ── Manual single lead ────────────────────────────────────────────────
      } else if (importType === 'manual') {
        if (!lead) return res.status(400).json({ error: 'No se proporcionó ningún lead' });
        rawLeads = [lead];

      } else {
        return res.status(400).json({ error: `Tipo de importación no reconocido: "${importType}"` });
      }
    } catch (err) {
      console.error('[BULK-IMPORT]', err.message);
      return res.status(400).json({ error: err.message });
    }

    // ── Insert into DB ──────────────────────────────────────────────────────
    try {
      const importedCount = await insertLeadsIntoDB(teamId, campaign_id, rawLeads);
      return res.status(201).json({
        success: true,
        imported: importedCount,
        message: `✓ ${importedCount} lead${importedCount !== 1 ? 's' : ''} importado${importedCount !== 1 ? 's' : ''}`,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
