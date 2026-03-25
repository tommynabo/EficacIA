-- ============================================================================
-- FIX: users_subscription_status_check constraint
-- El constraint antiguo sólo permitía ('free', 'pro', 'enterprise')
-- pero el sistema usa: 'free', 'active', 'trial', 'canceled', 'pro',
-- 'growth', 'scale', 'starter', 'enterprise'
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Eliminar el constraint antiguo
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_status_check;

-- 2. (Opcional) Eliminar también si existe con nombre alternativo
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS "users_subscription_status_check";

-- 3. Añadir el nuevo constraint con todos los valores válidos
ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN (
    'free',
    'active',
    'trial',
    'canceled',
    'cancelled',
    'pro',
    'growth',
    'scale',
    'scale_oferta',
    'starter',
    'enterprise',
    'past_due',
    'unpaid'
  ));

-- ============================================================================
-- VERIFICAR que el constraint se actualizó correctamente:
-- ============================================================================
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.users'::regclass AND contype = 'c';
