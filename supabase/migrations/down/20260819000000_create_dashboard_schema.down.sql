-- Down Migration: Drop dashboard schema tables and helper functions
-- Corresponds to: 20260819000000_create_dashboard_schema.sql

DROP TABLE IF EXISTS public.note_versions CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.dashboard_users CASCADE;
DROP TABLE IF EXISTS public.dashboards CASCADE;

DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
