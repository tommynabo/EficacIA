-- ============================================================================
-- MIGRATION: Refund Protection & Anti-Fraud (Hit & Run Defense)
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- 1. Añadir columna fraud_flag a users para marcar usuarios que han hecho refund
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS fraud_flag BOOLEAN DEFAULT false;

-- 2. Añadir columna stripe_transfer_id a invoices para poder revertir transfers al partner
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

-- 3. Índice para búsquedas rápidas de invoices por stripe_invoice_id (ya existe UNIQUE, pero por si acaso)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id ON public.invoices(stripe_invoice_id);

-- 4. Índice para búsquedas de usuarios con fraud_flag activo (panel admin)
CREATE INDEX IF NOT EXISTS idx_users_fraud_flag ON public.users(fraud_flag) WHERE fraud_flag = true;

-- ============================================================================
-- Verificación: ejecuta estas queries para confirmar que las columnas existen
-- ============================================================================
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fraud_flag';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'stripe_transfer_id';
