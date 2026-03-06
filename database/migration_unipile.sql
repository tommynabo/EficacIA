-- Migración: Añadir campos de Unipile a linkedin_accounts
-- Ejecutar en Supabase SQL Editor

-- 1. Añadir columna para el ID de cuenta en Unipile
ALTER TABLE public.linkedin_accounts 
  ADD COLUMN IF NOT EXISTS unipile_account_id VARCHAR(255);

-- 2. Añadir columna para el método de conexión (cookie manual / unipile / browser)
ALTER TABLE public.linkedin_accounts 
  ADD COLUMN IF NOT EXISTS connection_method VARCHAR(50) DEFAULT 'cookie';

-- 3. Hacer session_cookie nullable (Unipile gestiona la sesión, no necesitamos la cookie real)
ALTER TABLE public.linkedin_accounts 
  ALTER COLUMN session_cookie DROP NOT NULL;

-- 4. Índice único en unipile_account_id para evitar duplicados
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_accounts_unipile_id 
  ON public.linkedin_accounts(unipile_account_id) 
  WHERE unipile_account_id IS NOT NULL;
