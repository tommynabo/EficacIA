import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

function getUserId(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return decoded.userId;
  } catch {
    return null;
  }
}

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

// ─── Apify LinkedIn Search (async — works within Vercel 10s limit) ───────────
// Each search starts an Apify actor run and returns a poll_token (signed JWT).
// Frontend polls GET /api/linkedin/bulk-import?poll_token=xxx every 3s.
//
// Apify actor docs:
//   LinkedIn search: https://apify.com/apify/linkedin-search-scraper
//   Sales Navigator: https://apify.com/apify/linkedin-sales-navigator-scraper
const ACTOR_LINKEDIN  = 'apify/linkedin-search-scraper';
const ACTOR_SALES_NAV = 'apify/linkedin-sales-navigator-scraper';
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
  if (res.status === 401 || res.status === 403) {
    throw new Error('Apify API Token inválido. Verifica APIFY_API_TOKEN en Vercel.');
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
  if (!res.ok) throw new Error(`Error al verificar búsqueda (${res.status})`);
  const data = await res.json();
  console.log('[APIFY POLL] Run', runId, '→ status:', data.data?.status);
  return data.data; // { status, defaultDatasetId, ... }
}

async function fetchApifyDataset(datasetId, limit) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&limit=${limit}&format=json`
  );
  if (!res.ok) throw new Error(`Error al obtener resultados (${res.status})`);
  const items = await res.json();
  console.log('[APIFY DATASET] datasetId:', datasetId, '| items received:', Array.isArray(items) ? items.length : typeof items);
  return items;
}

function extractProfilesFromApify(items, limit) {
  const profiles = [];
  for (const item of (Array.isArray(items) ? items : [])) {
    if (profiles.length >= limit) break;
    const firstName = item.firstName || item.first_name || item.given_name || '';
    const lastName  = item.lastName  || item.last_name  || item.family_name || '';
    const fullName  = item.fullName  || item.name       || `${firstName} ${lastName}`.trim();
    const nameParts = fullName.split(' ');
    profiles.push({
      first_name:   firstName   || nameParts[0] || '',
      last_name:    lastName    || nameParts.slice(1).join(' ') || '',
      job_title:    item.headline || item.title || item.jobTitle || item.job_title || item.position || '',
      company:      item.companyName || item.company || item.currentCompany || item.organizationName || item.organization_name || '',
      linkedin_url: item.linkedinUrl || item.linkedin_url || item.profileUrl || item.url || '',
      email:        item.email || null,
    });
  }
  return profiles;
}

function extractProfilesFromSalesNavActor(items, limit) {
  const profiles = [];
  for (const item of (Array.isArray(items) ? items : [])) {
    if (profiles.length >= limit) break;
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('[BULK-IMPORT]', req.method, req.query?.poll_token ? '(poll)' : '');

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

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
        if (pollData.actor === 'google') {
          rawLeads = extractProfilesFromGoogle(items, pollData.limit);
        } else if (pollData.actor === 'sales_navigator') {
          rawLeads = extractProfilesFromSalesNavActor(items, pollData.limit);
        } else {
          rawLeads = extractProfilesFromApify(items, pollData.limit);
        }
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

    console.log('[BULK-IMPORT] POST type:', importType, '| has account_id:', !!account_id, '| has li_at in body:', !!(bodyLiAt && bodyLiAt.length > 20));

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
      // ── CSV / leads array ─────────────────────────────────────────────────
      if (importType === 'csv' || importType === 'leads') {
        if (!leads || !Array.isArray(leads) || leads.length === 0) {
          return res.status(400).json({ error: 'No se proporcionaron leads para importar' });
        }
        rawLeads = leads;

      // ── Google Sheets ─────────────────────────────────────────────────────
      } else if (importType === 'google_sheets') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de Google Sheets' });
        const csvText = await fetchGoogleSheetsCsv(url);
        rawLeads = parseCsvToLeads(csvText);

      // ── Apollo → Google LinkedIn people search (no li_at needed) ──────────────
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

      // ── LinkedIn Search URL → Google (no li_at needed) ───────────────────────
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

      // ── Sales Navigator → Apify Scraper ────────────────────────────
      } else if (importType === 'sales_navigator') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de Sales Navigator' });
        const searchLimit = Math.min(limit, 50);

        // Resolve Session Cookie (li_at)
        let liAt = bodyLiAt;
        
        if (!liAt && account_id) {
          const { data: acc } = await supabaseAdmin
            .from('linkedin_accounts')
            .select('*')
            .eq('id', account_id)
            .single();

          if (acc) {
            if (acc.session_cookie && acc.session_cookie !== 'managed_by_unipile') {
              liAt = acc.session_cookie;
            } else if (acc.unipile_account_id) {
              liAt = await getLinkedInCookiesFromUnipile(acc.unipile_account_id);
            }
          }
        }

        if (!liAt) liAt = await getLiAtForUser(userId);

        if (!liAt || liAt.length < 20) {
          return res.status(400).json({ error: 'No se pudo obtener la cookie de sesión (li_at) requerida. Por favor, realiza una conexión manual o pega la cookie li_at en el modal.' });
        }

        console.log('[SALES NAV] Starting run with actor:', ACTOR_SALES_NAV);
        const { runId, datasetId } = await startApifyRun(ACTOR_SALES_NAV, {
          searchUrl: url,
          cookie: liAt,
          li_at: liAt,
          limit: searchLimit,
        });

        const pollToken = jwt.sign(
          { runId, datasetId, teamId, campaignId: campaign_id || null, limit: searchLimit, userId, actor: 'sales_navigator' },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: '10m' }
        );
        return res.status(202).json({ status: 'processing', poll_token: pollToken, message: 'Extrayendo resultados de Sales Navigator...' });

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
