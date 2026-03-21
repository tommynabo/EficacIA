-- Migration: Add ai_credits column to users table
-- ai_credits = saldo actual del usuario (cuántos le quedan).
-- Empieza en 0. Cada pack comprado suma +1000.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ai_credits INTEGER NOT NULL DEFAULT 0;

-- Corregir cualquier valor negativo en cuentas existentes
UPDATE public.users
SET ai_credits = 0
WHERE ai_credits < 0;
