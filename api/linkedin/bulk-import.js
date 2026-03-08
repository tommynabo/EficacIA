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

// ─── Apollo.io People Search (free tier: 600 credits/month) ─────────────────
// Apollo has a proper people search API that works from server-side.
// Set APOLLO_API_KEY env var in Vercel. Free at: https://app.apollo.io/settings/integrations/api
async function searchViaApollo(keywords, limit) {
  const apolloKey = (process.env.APOLLO_API_KEY || '').trim();
  console.log('[APOLLO] Key length:', apolloKey.length, '| starts:', apolloKey.slice(0, 5));

  // Parse keywords into title / person_titles for Apollo
  // e.g. "CEO Spain" → person_titles: ["CEO"], person_locations: ["Spain"]
  const words = keywords.split(/\s+/).filter(Boolean);
  const locationWords = ['spain','españa','madrid','barcelona','valencia','sevilla',
    'bilbao','france','germany','uk','italy','usa','mexico','latam','europa','europe'];
  const titles = words.filter(w => !locationWords.includes(w.toLowerCase()));
  const locations = words.filter(w => locationWords.includes(w.toLowerCase()));

  // If no Apollo key, fail early with clear message
  if (!apolloKey) {
    throw new Error('Búsqueda de LinkedIn requiere una clave Apollo API. Configura APOLLO_API_KEY en las variables de entorno de Vercel.');
  }

  const body = {
    q_keywords: keywords,
    page: 1,
    per_page: Math.min(limit, 25),
    ...(titles.length > 0 && { person_titles: titles }),
    ...(locations.length > 0 && { person_locations: locations }),
  };

  const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apolloKey,
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403 || response.status === 422) {
    const errText = await response.text().catch(() => '');
    console.error('[APOLLO SEARCH] Auth error:', response.status, errText);
    throw new Error('Apollo API Key inválida. Verifica la variable APOLLO_API_KEY en Vercel.');
  }
  if (response.status === 429) {
    throw new Error('Límite de búsquedas alcanzado en Apollo. Espera unos minutos o amplía tu plan.');
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[APOLLO SEARCH] Error:', response.status, errText);
    throw new Error(`Error en la búsqueda (${response.status}). Inténtalo de nuevo.`);
  }

  const data = await response.json();
  return extractProfilesFromApollo(data, limit);
}

function extractProfilesFromApollo(data, limit) {
  const people = data.people || data.contacts || [];
  const profiles = [];

  for (const p of people) {
    if (profiles.length >= limit) break;
    profiles.push({
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      job_title: p.title || '',
      company: p.organization_name || p.organization?.name || '',
      linkedin_url: p.linkedin_url || '',
      email: p.email || null,
    });
  }
  return profiles;
}

// ─── Apollo structured query search (from native Apollo form) ────────────────
async function searchViaApolloQuery(q, limit) {
  const apolloKey = (process.env.APOLLO_API_KEY || '').trim();
  if (!apolloKey) {
    throw new Error('Búsqueda con Apollo requiere APOLLO_API_KEY configurada en Vercel.');
  }

  const splitCsv = (str) => (str || '').split(',').map(s => s.trim()).filter(Boolean);

  const body = {
    page: 1,
    per_page: Math.min(limit, 25),
    ...(q.titles    && { person_titles:      splitCsv(q.titles) }),
    ...(q.locations && { person_locations:   splitCsv(q.locations) }),
    ...(q.companies && { organization_names: splitCsv(q.companies) }),
    ...(q.keywords  && { q_keywords:         q.keywords }),
  };

  const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apolloKey,
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403 || response.status === 422) {
    const errText = await response.text().catch(() => '');
    console.error('[APOLLO STRUCTURED SEARCH] Auth error:', response.status, errText);
    throw new Error('Apollo API Key inválida. Verifica la variable APOLLO_API_KEY en Vercel.');
  }
  if (response.status === 429) {
    throw new Error('Límite de búsquedas alcanzado en Apollo. Espera unos minutos.');
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[APOLLO STRUCTURED SEARCH] Error:', response.status, errText);
    throw new Error(`Error en la búsqueda (${response.status}). Inténtalo de nuevo.`);
  }

  const data = await response.json();
  return extractProfilesFromApollo(data, limit);
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

      // ── Apollo direct search ───────────────────────────────────────────────
      } else if (importType === 'apollo') {
        const q = apollo_query || {};
        if (!q.titles && !q.keywords && !q.companies) {
          return res.status(400).json({ error: 'Introduce al menos un cargo, empresa o palabra clave.' });
        }
        rawLeads = await searchViaApolloQuery(q, Math.min(limit, 100));
        if (rawLeads.length === 0) {
          return res.status(200).json({ success: true, imported: 0, message: '✓ Búsqueda completada sin resultados. Prueba con otros filtros.' });
        }

      // ── LinkedIn Search URL ───────────────────────────────────────────────
      } else if (importType === 'linkedin_search') {
        if (!url) return res.status(400).json({ error: 'Se requiere la URL de búsqueda' });
        if (!account_id) return res.status(400).json({ error: 'Se requiere una cuenta de LinkedIn' });

        const { data: account, error: accErr } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id, is_valid')
          .eq('id', account_id)
          .eq('team_id', teamId)
          .single();
        if (accErr || !account) return res.status(404).json({ error: 'Cuenta de LinkedIn no encontrada' });
        if (!account.is_valid) return res.status(400).json({ error: 'La sesión de LinkedIn ha expirado. Vuelve a conectar la cuenta en Cuentas.' });

        // Robust keyword extraction — try multiple strategies
        let keywords = '';
        try {
          const normalized = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
          const urlObj = new URL(normalized);
          keywords = decodeURIComponent(urlObj.searchParams.get('keywords') || '');
        } catch { /* fall through to regex */ }

        if (!keywords) {
          const m = url.match(/[?&]keywords=([^&]+)/i);
          if (m) keywords = decodeURIComponent(m[1].replace(/\+/g, ' '));
        }

        if (!keywords && !url.includes('linkedin.com')) {
          keywords = url.trim();
        }

        if (!keywords) return res.status(400).json({ error: 'No se encontraron palabras clave. Usa una URL como: linkedin.com/search/results/all/?keywords=CEO+Spain' });

        rawLeads = await searchViaApollo(keywords, Math.min(limit, 100));
        if (rawLeads.length === 0) {
          return res.status(200).json({ success: true, imported: 0, message: '✓ Búsqueda completada sin resultados. Prueba con otros filtros.' });
        }

      // ── Sales Navigator URL ───────────────────────────────────────────────
      } else if (importType === 'sales_navigator') {
        if (!account_id) return res.status(400).json({ error: 'Se requiere una cuenta de LinkedIn' });

        const { data: account, error: accErr } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id, is_valid, unipile_account_id')
          .eq('id', account_id)
          .eq('team_id', teamId)
          .single();
        if (accErr || !account) return res.status(404).json({ error: 'Cuenta de LinkedIn no encontrada' });
        if (!account.is_valid) return res.status(400).json({ error: 'La sesión de LinkedIn ha expirado. Vuelve a conectar la cuenta en Cuentas.' });

        // Use pre-parsed filters sent from frontend
        const f = filters || {};
        const parts = [
          ...(f.titles || []),
          ...(f.keywords || []),
        ].filter(Boolean);

        if (parts.length === 0) {
          return res.status(400).json({ error: 'No se pudieron extraer filtros de la URL de Sales Navigator. Verifica que la URL sea correcta.' });
        }

        let keywords = parts.join(' OR ');
        if (f.companies && f.companies.length > 0) {
          keywords += ` ${f.companies.join(' ')}`;
        }

        if (!account.unipile_account_id) {
          return res.status(400).json({ error: 'Esta cuenta no está conectada via Unipile. Ve a Cuentas y vuelve a conectar tu LinkedIn.' });
        }

        rawLeads = await searchViaApollo(keywords.trim(), Math.min(limit, 100));
        if (rawLeads.length === 0) {
          return res.status(200).json({ success: true, imported: 0, message: '✓ Búsqueda completada sin resultados. Prueba ajustando los filtros del Sales Navigator.' });
        }

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
