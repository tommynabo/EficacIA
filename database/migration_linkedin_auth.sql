-- ============================================================================
-- MIGRACIÓN: Añadir columnas de autenticación LinkedIn
-- Pegar en Supabase > SQL Editor > Run
-- ============================================================================

-- 1. Añadir columnas de auth a linkedin_accounts
ALTER TABLE public.linkedin_accounts
  ADD COLUMN IF NOT EXISTS session_cookie TEXT,
  ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_name TEXT,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMP;

-- El campo username ya existe y lo usaremos como identificador
-- El campo profile_name es el nombre visible (nombre completo de LinkedIn)

-- 2. Añadir columnas de mensajería a leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS sent_message BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ai_message TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- 3. Índices adicionales
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_is_valid ON public.linkedin_accounts(is_valid);
CREATE INDEX IF NOT EXISTS idx_leads_sent_message ON public.leads(sent_message);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON public.leads(campaign_id);

-- 4. Políticas RLS para linkedin_accounts (permitir INSERT/UPDATE/DELETE para owners del team)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team owners can manage linkedin accounts' AND tablename = 'linkedin_accounts') THEN
    CREATE POLICY "Team owners can manage linkedin accounts"
      ON public.linkedin_accounts FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.teams
          WHERE teams.id = linkedin_accounts.team_id AND owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 5. Políticas RLS para leads (INSERT/UPDATE/DELETE)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team owners can manage leads' AND tablename = 'leads') THEN
    CREATE POLICY "Team owners can manage leads"
      ON public.leads FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.teams
          WHERE teams.id = leads.team_id AND owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 6. Políticas RLS para campaigns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team owners can manage campaigns' AND tablename = 'campaigns') THEN
    CREATE POLICY "Team owners can manage campaigns"
      ON public.campaigns FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.teams
          WHERE teams.id = campaigns.team_id AND owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 7. Política para teams: owners pueden insertar/modificar
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create teams' AND tablename = 'teams') THEN
    CREATE POLICY "Users can create teams"
      ON public.teams FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners can update teams' AND tablename = 'teams') THEN
    CREATE POLICY "Owners can update teams"
      ON public.teams FOR UPDATE
      USING (owner_id = auth.uid());
  END IF;
END $$;
