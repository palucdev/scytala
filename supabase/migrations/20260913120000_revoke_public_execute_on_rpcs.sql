-- Migration: Revoke default PUBLIC EXECUTE on SECURITY DEFINER RPCs
-- Change: S-07 (note-encryption) impl-review F1 fix-forward
-- Purpose: CREATE OR REPLACE gives every new function identity the PostgreSQL
-- default EXECUTE grant to PUBLIC. REVOKE ... FROM anon, authenticated does not
-- remove it (every role implicitly inherits PUBLIC), so anon-key callers could
-- execute these SECURITY DEFINER functions directly. Mirrors the correct
-- hardening pattern from 20260828000000_create_rate_limits_rpc.sql.

REVOKE ALL ON FUNCTION public.create_note_with_version(uuid, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_dashboard_with_users(text, text, varchar, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_note_with_version(uuid, int, text, text, uuid) FROM PUBLIC;
