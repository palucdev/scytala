-- Migration: Create info audit table
-- Purpose: Track application deployments, versioning and initialization metadata

CREATE TABLE IF NOT EXISTS public.info (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    app_version TEXT NOT NULL,
    init_data TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.info ENABLE ROW LEVEL SECURITY;

-- Allow read operations on the info audit table
CREATE POLICY "Allow public read access to info"
    ON public.info
    FOR SELECT
    USING (true);

-- Allow insert operations on the info audit table
CREATE POLICY "Allow insert access to info"
    ON public.info
    FOR INSERT
    WITH CHECK (true);

-- Grant table permissions to Supabase roles
GRANT SELECT, INSERT ON TABLE public.info TO anon, authenticated, service_role;

-- Add index on app_version for fast lookups
CREATE INDEX IF NOT EXISTS idx_info_app_version ON public.info(app_version);

COMMENT ON TABLE public.info IS 'Audit table storing application versions and deployment initialization metadata';
COMMENT ON COLUMN public.info.app_version IS 'Application version deployed (e.g. 0.1.0)';
COMMENT ON COLUMN public.info.init_data IS 'Initialization and deployment metadata payload';
COMMENT ON COLUMN public.info.created_at IS 'Timestamp when the deployment was recorded';
