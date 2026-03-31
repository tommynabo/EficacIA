/**
 * fix-diego-account.mjs
 *
 * Diagnóstico y corrección manual: inserta en Supabase las cuentas de Unipile
 * que existen en Unipile pero no en linkedin_accounts.
 *
 * Uso:
 *   node fix-diego-account.mjs                     → modo DRY-RUN (solo diagnostica)
 *   node fix-diego-account.mjs --email diego@...   → filtra por email de usuario
 *   node fix-diego-account.mjs --insert            → inserta realmente en Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const UNIPILE_DSN = (process.env.UNIPILE_DSN || '').trim();
const UNIPILE_API_KEY = (process.env.UNIPILE_API_KEY || '').trim();

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--insert');
const emailArg = (() => {
  const i = args.indexOf('--email');
  return i !== -1 ? args[i + 1] : null;
})();

async function fetchUnipileAccounts() {
  console.log('\n📡 Obteniendo cuentas de Unipile...');
  const res = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts?limit=100`, {
    headers: { 'X-API-KEY': UNIPILE_API_KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Unipile API error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.items || data || [];
}

async function fetchUnipileAccountDetail(accountId) {
  const res = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts/${accountId}`, {
    headers: { 'X-API-KEY': UNIPILE_API_KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DIAGNÓSTICO DE CUENTAS UNIPILE ↔ SUPABASE');
  console.log(`  Modo: ${DRY_RUN ? '🔍 DRY-RUN (solo lee, no escribe)' : '✏️  INSERT activo'}`);
  if (emailArg) console.log(`  Filtro usuario: ${emailArg}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Obtener todos los usuarios de Supabase (o filtrar por email)
  let usersQuery = supabase.from('users').select('id, email, subscription_status');
  if (emailArg) usersQuery = usersQuery.ilike('email', `%${emailArg}%`);
  const { data: users, error: usersError } = await usersQuery;

  if (usersError) throw new Error(`Error obteniendo usuarios: ${usersError.message}`);
  if (!users || users.length === 0) {
    console.log('❌ No se encontraron usuarios con ese filtro.');
    return;
  }

  console.log(`👥 Usuarios encontrados: ${users.length}`);
  users.forEach(u => console.log(`   • ${u.email} (${u.id}) [${u.subscription_status || 'free'}]`));

  // 2. Obtener todas las cuentas de Supabase linkedin_accounts
  const { data: allDbAccounts, error: dbError } = await supabase
    .from('linkedin_accounts')
    .select('id, team_id, unipile_account_id, profile_name, username, is_valid, created_at');

  if (dbError) throw new Error(`Error obteniendo linkedin_accounts: ${dbError.message}`);
  const dbUnipileIds = new Set((allDbAccounts || []).map(a => a.unipile_account_id).filter(Boolean));

  console.log(`\n📊 Cuentas en Supabase linkedin_accounts: ${allDbAccounts?.length || 0}`);
  if (allDbAccounts && allDbAccounts.length > 0) {
    allDbAccounts.forEach(a => console.log(`   • [${a.id}] ${a.profile_name || a.username} (unipile: ${a.unipile_account_id || 'ninguno'})`));
  }

  // 3. Obtener cuentas de Unipile
  const unipileAccounts = await fetchUnipileAccounts();
  console.log(`\n🔗 Cuentas en Unipile: ${unipileAccounts.length}`);
  unipileAccounts.forEach(u => {
    const inDb = dbUnipileIds.has(u.id) ? '✓ EN DB' : '❌ FALTA EN DB';
    console.log(`   • [${u.id}] name="${u.name}" type=${u.type} status=${u.status || '?'} → ${inDb}`);
  });

  // 4. Identificar cuentas huérfanas (en Unipile pero no en Supabase)
  const allOrphans = unipileAccounts.filter(u => !dbUnipileIds.has(u.id));

  // Deduplicar por publicIdentifier de LinkedIn (mismo perfil conectado varias veces)
  const seenIdentifiers = new Set();
  const orphanAccounts = [];
  for (const orphan of allOrphans) {
    const detail = await fetchUnipileAccountDetail(orphan.id);
    const pubId = detail?.connection_params?.im?.publicIdentifier || orphan.id;
    orphan._detail = detail; // cachear para no volver a pedir
    if (!seenIdentifiers.has(pubId)) {
      seenIdentifiers.add(pubId);
      orphanAccounts.push(orphan);
    } else {
      console.log(`   ⚠️  [SKIP DUPLICADO] ${orphan.id} (${pubId}) ya procesado con otra cuenta Unipile del mismo perfil.`);
    }
  }
  console.log(`\n⚠️  Cuentas huérfanas (en Unipile, NO en Supabase): ${orphanAccounts.length}`);

  if (orphanAccounts.length === 0) {
    console.log('✅ No hay cuentas huérfanas. Todo está sincronizado.\n');
    return;
  }

  // 5. Para cada cuenta huérfana, intentar asociarla a un usuario
  for (const orphan of orphanAccounts) {
    console.log(`\n── Cuenta huérfana: ${orphan.id} ──────────────────────────`);

    // Usar detalles ya cacheados en el paso de deduplicación
    const detail = orphan._detail || await fetchUnipileAccountDetail(orphan.id);
    console.log('   Datos Unipile:', JSON.stringify(detail, null, 2).slice(0, 500));

    const profileName = detail?.connection_params?.im?.username
      || detail?.name
      || null;

    // El campo 'name' de Unipile debería ser el userId (así lo seteamos en handleGenerateLink)
    const possibleUserId = orphan.name && orphan.name.length > 30 ? orphan.name : null;

    let matchedUser = null;
    if (possibleUserId) {
      matchedUser = users.find(u => u.id === possibleUserId);
      if (matchedUser) {
        console.log(`   🎯 Usuario detectado por campo name: ${matchedUser.email} (${matchedUser.id})`);
      }
    }

    if (!matchedUser) {
      console.log(`   ⚠️  No se pudo detectar usuario automáticamente.`);
      if (users.length === 1) {
        matchedUser = users[0];
        console.log(`   🎯 Asignando al único usuario filtrado: ${matchedUser.email}`);
      } else {
        console.log(`   ℹ️  Usuarios disponibles para asignación manual:`);
        users.forEach((u, i) => console.log(`      [${i}] ${u.email} (${u.id})`));
        console.log(`   → Para asignar específicamente, pasa --email <email> al ejecutar el script.`);
        continue;
      }
    }

    // Obtener/crear team del usuario
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', matchedUser.id)
      .limit(1);

    let teamId = teams?.[0]?.id;
    if (!teamId) {
      if (DRY_RUN) {
        console.log(`   [DRY-RUN] Se crearía equipo para usuario ${matchedUser.id}`);
        continue;
      }
      const { data: newTeam, error: teamError } = await supabase
        .from('teams')
        .insert({ owner_id: matchedUser.id, name: 'Mi Equipo' })
        .select()
        .single();
      if (teamError) {
        console.error(`   ❌ Error creando equipo: ${teamError.message}`);
        continue;
      }
      teamId = newTeam.id;
      console.log(`   ✓ Equipo creado: ${teamId}`);
    } else {
      console.log(`   ✓ Team ID encontrado: ${teamId}`);
    }

    // Verificar si ya existe (doble check con team_id)
    const { data: existing } = await supabase
      .from('linkedin_accounts')
      .select('id')
      .eq('unipile_account_id', orphan.id)
      .eq('team_id', teamId)
      .single();

    if (existing) {
      console.log(`   ✓ Ya existe en Supabase con team_id correcto: ${existing.id}. Skipping.`);
      continue;
    }

    const username = (profileName
      ? profileName.toLowerCase().replace(/\s+/g, '-')
      : `linkedin-${orphan.id.slice(0, 8)}`
    );

    const insertPayload = {
      team_id: teamId,
      username: username,
      unipile_account_id: orphan.id,
      profile_name: profileName || `LinkedIn (${orphan.type || 'LINKEDIN'})`,
      connection_method: 'unipile',
      is_valid: true,
      session_cookie: 'managed_by_unipile',
      last_validated_at: new Date().toISOString(),
    };

    console.log(`\n   📝 Payload a insertar:`);
    console.log('  ', JSON.stringify(insertPayload, null, 2));

    if (DRY_RUN) {
      console.log(`\n   [DRY-RUN] ⚠️  NO SE INSERTÓ. Ejecuta con --insert para insertar realmente.`);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('linkedin_accounts')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        console.error(`   ❌ Error insertando: ${insertError.message}`);
      } else {
        console.log(`   ✅ INSERTADO: ${inserted.id} → ${matchedUser.email} (team: ${teamId})`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  if (DRY_RUN) {
    console.log('  ⚠️  DRY-RUN completado. Para insertar, ejecuta:');
    console.log(`  node fix-diego-account.mjs --email <email_de_diego> --insert`);
  } else {
    console.log('  ✅ Proceso completado.');
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
