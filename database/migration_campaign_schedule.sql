-- ============================================================================
-- MIGRACIÓN: Horario de Envío por Campaña (Campaign Schedule)
-- Añade columna JSONB `schedule` a la tabla campaigns para almacenar
-- la configuración de días, horas y zona horaria de envío.
-- ============================================================================

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '{"enabled": false, "timezone": "Europe/Madrid", "days": [1,2,3,4,5], "start_time": "09:00", "end_time": "18:00"}';

COMMENT ON COLUMN public.campaigns.schedule IS
  'Configuración de horario de envío. Estructura: '
  '{ "enabled": boolean, "timezone": "Europe/Madrid", '
  '"days": [0-6] (0=Dom,1=Lun,...,6=Sáb), '
  '"start_time": "HH:MM", "end_time": "HH:MM" }';
