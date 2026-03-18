-- ============================================================================
-- MIGRACIÓN: Control de Velocidad de Envíos (Throttle Control)
-- Añade max_actions_per_hour a linkedin_accounts para controlar el batch
-- del campaign-engine de forma dinámica por cuenta.
-- ============================================================================

ALTER TABLE public.linkedin_accounts
  ADD COLUMN IF NOT EXISTS max_actions_per_hour SMALLINT NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.linkedin_accounts.max_actions_per_hour IS
  'Máximo de acciones (mensajes/invitaciones) por hora para esta cuenta. '
  'Umbral conservador: ≤5. Moderado: 6-15. Peligroso (riesgo de baneo): >15.';
