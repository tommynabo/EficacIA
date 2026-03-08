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

// ─── Apify LinkedIn Search (async — works within Vercel 10s limit) ───────────
// Each search starts an Apify actor run and returns a poll_token (signed JWT).
// Frontend polls GET /api/linkedin/bulk-import?poll_token=xxx every 3s.
// Actor IDs — change if you want different scrapers:
const ACTOR_LINKEDIN  = 'curious_coder~linkedin-search-scraper';
const ACTOR_SALES_NAV = 'anchor~sales-navigator-leads-scraper';

async function startApifyRun(actorSlug, input) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  if (!token) throw new Error('APIFY_API_TOKEN no configurado en Vercel. Añádelo en Settings → Environment Variables.');
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorSlug}/runs?token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error('Apify API Token inválido. Verifica APIFY_API_TOKEN en Vercel.');
  }
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[APIFY] startRun error:', res.status, err);
    throw new Error(`Error al iniciar búsqueda Apify (${res.status}). Verifica el actor y el token.`);
  }
  const data = await res.json();
  return { runId: data.data.id, datasetId: data.data.defaultDatasetId };
}

async function checkApifyRun(runId) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Error al verificar búsqueda (${res.status})`);
  const data = await res.json();
  return data.data; // { status, defaultDatasetId, ... }
}

async function fetchApifyDataset(datasetId, limit) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&limit=${limit}&format=json`
  );
  if (!res.ok) throw new Error(`Error al obtener resultados (${res.status})`);
  return await res.json();
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
        const rawLeads = extractProfilesFromApify(items, pollData.limit);
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
    const { type, leads, campaign_id, url, account_id, lead, limit = 25, filters, apollo_query } = req.body || {};
    const importType = type || (Array.isArray(leads) ? 'csv' : 'unknown');

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

      // ── People Search via Apify (async) ────────────────────────────────────
      } else if (importType === 'apollo') {
        const q = apollo_query || {};
        if (!q.titles && !q.keywords && !q.companies) {
          return res.status(400).json({ error: 'Introduce al menos un cargo, empresa o palabra clave.' });
        }
        const liAt = account_id
          ? (await supabaseAdmin.from('linkedin_accounts').select('session_cookie').eq('id', account_id).eq('team_id', teamId).single()).data?.session_cookie
          : await getLiAtForUser(userId);
        if (!liAt || liAt === 'managed_by_unipile') {
          return res.status(400).json({ error: 'Esta búsqueda requiere una cuenta LinkedIn conectada con cookie li_at. Ve a Cuentas y usa "Sesión manual".' });
        }
        const searchUrl = buildLinkedInSearchUrl(q);
        const { runId, datasetId } = await startApifyRun(ACTOR_LINKEDIN, {
          startUrls: [{ url: searchUrl }],
          maxResults: Math.min(limit, 50),
          cookie: `li_at=${liAt}`,
        });
        const pollToken = jwt.sign(
          { runId, datasetId, teamId, campaignId: campaign_id || null, limit: Math.min(limit, 50), userId },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: '10m' }
        );
        return res.status(202).json({ status: 'processing', poll_token: pollToken, message: 'Iniciando búsqueda en LinkedIn...' });

      // ── LinkedIn Search URL via Apify (async) ─────────────────────────────
      } else if (importType === 'linkedin_search') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de búsqueda' });
        if (!account_id) return res.status(400).json({ error: 'Se requiere una cuenta de LinkedIn' });

        const { data: account, error: accErr } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id, is_valid, session_cookie')
          .eq('id', account_id)
          .eq('team_id', teamId)
          .single();
        if (accErr || !account) return res.status(404).json({ error: 'Cuenta de LinkedIn no encontrada' });
        if (!account.is_valid) return res.status(400).json({ error: 'La sesión de LinkedIn ha expirado. Vuelve a conectar la cuenta en Cuentas.' });
        if (!account.session_cookie || account.session_cookie === 'managed_by_unipile') {
          return res.status(400).json({ error: 'Esta cuenta fue conectada via Unipile. Para búsquedas directas conecta también tu li_at desde Cuentas → "Sesión manual".' });
        }

        const normalizedUrl = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
        const { runId, datasetId } = await startApifyRun(ACTOR_LINKEDIN, {
          startUrls: [{ url: normalizedUrl }],
          maxResults: Math.min(limit, 50),
          cookie: `li_at=${account.session_cookie}`,
        });
        const pollToken = jwt.sign(
          { runId, datasetId, teamId, campaignId: campaign_id || null, limit: Math.min(limit, 50), userId },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: '10m' }
        );
        return res.status(202).json({ status: 'processing', poll_token: pollToken, message: 'Iniciando búsqueda en LinkedIn...' });

      // ── Sales Navigator URL via Apify (async) ─────────────────────────────
      } else if (importType === 'sales_navigator') {
        if (!url)        return res.status(400).json({ error: 'Se requiere la URL de Sales Navigator' });
        if (!account_id) return res.status(400).json({ error: 'Se requiere una cuenta de LinkedIn' });

        const { data: account, error: accErr } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id, is_valid, session_cookie')
          .eq('id', account_id)
          .eq('team_id', teamId)
          .single();
        if (accErr || !account) return res.status(404).json({ error: 'Cuenta de LinkedIn no encontrada' });
        if (!account.is_valid) return res.status(400).json({ error: 'La sesión de LinkedIn ha expirado. Vuelve a conectar la cuenta en Cuentas.' });
        if (!account.session_cookie || account.session_cookie === 'managed_by_unipile') {
          return res.status(400).json({ error: 'Esta cuenta fue conectada via Unipile. Para buscar en Sales Navigator conecta también tu li_at desde Cuentas → "Sesión manual".' });
        }

        const { runId, datasetId } = await startApifyRun(ACTOR_SALES_NAV, {
          startUrls: [{ url }],
          maxLeads:   Math.min(limit, 50),
          maxResults: Math.min(limit, 50),
          cookie: `li_at=${account.session_cookie}`,
        });
        const pollToken = jwt.sign(
          { runId, datasetId, teamId, campaignId: campaign_id || null, limit: Math.min(limit, 50), userId },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: '10m' }
        );
        return res.status(202).json({ status: 'processing', poll_token: pollToken, message: 'Iniciando búsqueda en Sales Navigator...' });

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
