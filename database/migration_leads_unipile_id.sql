-- Migración: Añadir columna unipile_id a la tabla leads
-- Esta columna almacena el provider_id de Unipile/LinkedIn para filtrar
-- chats bloqueados en la Unibox sin depender del slug de la URL.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS unipile_id VARCHAR(255);

-- Índice para búsquedas rápidas por unipile_id
CREATE INDEX IF NOT EXISTS idx_leads_unipile_id
  ON public.leads(unipile_id)
  WHERE unipile_id IS NOT NULL;
