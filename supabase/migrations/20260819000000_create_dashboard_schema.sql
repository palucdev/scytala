-- Migration: Create dashboard, participant users, notes, and note version history schema
-- Change: F-01 (dashboard-data-schema-and-auth-scaffold)
-- Purpose: Foundational relational data model with strict RLS and cascading deletions

-- 1. Create handle_updated_at trigger helper function if not exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create public.dashboards table
CREATE TABLE IF NOT EXISTS public.dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash VARCHAR(16) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Trigger to auto-update updated_at on dashboards
DROP TRIGGER IF EXISTS set_dashboards_updated_at ON public.dashboards;
CREATE TRIGGER set_dashboards_updated_at
    BEFORE UPDATE ON public.dashboards
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 3. Create public.dashboard_users table
CREATE TABLE IF NOT EXISTS public.dashboard_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
    user_alias TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    CONSTRAINT uq_dashboard_user_alias UNIQUE (dashboard_id, user_alias)
);

-- 4. Create public.notes table
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Trigger to auto-update updated_at on notes
DROP TRIGGER IF EXISTS set_notes_updated_at ON public.notes;
CREATE TRIGGER set_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Create public.note_versions table
CREATE TABLE IF NOT EXISTS public.note_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    version INT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    author_id UUID REFERENCES public.dashboard_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    CONSTRAINT uq_note_version UNIQUE (note_id, version)
);

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notes_dashboard ON public.notes(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_note_history ON public.note_versions(note_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_note_versions_author ON public.note_versions(author_id);

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_versions ENABLE ROW LEVEL SECURITY;

-- Revoke direct permissions from anon and authenticated roles
REVOKE ALL ON TABLE public.dashboards FROM anon, authenticated;
REVOKE ALL ON TABLE public.dashboard_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.notes FROM anon, authenticated;
REVOKE ALL ON TABLE public.note_versions FROM anon, authenticated;

-- Grant all permissions strictly to service_role
GRANT ALL ON TABLE public.dashboards TO service_role;
GRANT ALL ON TABLE public.dashboard_users TO service_role;
GRANT ALL ON TABLE public.notes TO service_role;
GRANT ALL ON TABLE public.note_versions TO service_role;

-- Explicit RLS Policies for service_role
DROP POLICY IF EXISTS "Service role full access on dashboards" ON public.dashboards;
CREATE POLICY "Service role full access on dashboards"
    ON public.dashboards
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on dashboard_users" ON public.dashboard_users;
CREATE POLICY "Service role full access on dashboard_users"
    ON public.dashboard_users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on notes" ON public.notes;
CREATE POLICY "Service role full access on notes"
    ON public.notes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on note_versions" ON public.note_versions;
CREATE POLICY "Service role full access on note_versions"
    ON public.note_versions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 8. Table Comments for schema documentation
COMMENT ON TABLE public.dashboards IS 'Private collaborative dashboards identified by a secure 16-character hash slug';
COMMENT ON COLUMN public.dashboards.hash IS 'Unique 16-character URL-safe identifier for dashboard sharing';
COMMENT ON COLUMN public.dashboards.title IS 'Display title of the collaborative dashboard';

COMMENT ON TABLE public.dashboard_users IS 'Participants provisioned with unique user aliases and PBKDF2 password hashes per dashboard';
COMMENT ON COLUMN public.dashboard_users.user_alias IS 'Unique participant alias within this dashboard';
COMMENT ON COLUMN public.dashboard_users.password_hash IS 'PBKDF2 SHA-256 hashed password with random salt';

COMMENT ON TABLE public.notes IS 'Collaborative note tiles belonging to a dashboard with optimistic concurrency versioning';
COMMENT ON COLUMN public.notes.version IS 'Monotonically increasing version number for optimistic concurrency';

COMMENT ON TABLE public.note_versions IS 'Immutable append-only version history snapshots of note edits';
COMMENT ON COLUMN public.note_versions.author_id IS 'Participant who authored this version snapshot';
