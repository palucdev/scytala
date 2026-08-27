-- Down Migration: Drop atomic transactional RPC functions
-- Corresponds to: 20260820000000_create_dashboard_rpcs.sql

DROP FUNCTION IF EXISTS public.create_dashboard_with_users(TEXT, TEXT, VARCHAR(16), JSONB);
DROP FUNCTION IF EXISTS public.create_dashboard_with_users(TEXT, TEXT, VARCHAR, JSONB);
DROP FUNCTION IF EXISTS public.create_note_with_version(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.update_note_with_version(UUID, INT, TEXT, TEXT, UUID);
