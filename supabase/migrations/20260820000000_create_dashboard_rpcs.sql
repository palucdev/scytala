-- Migration: Add atomic transactional RPC functions for dashboards and note operations
-- Change: F-01 (dashboard-data-schema-and-auth-scaffold)
-- Purpose: ACID transactional guarantees for multi-table inserts/updates with automatic rollback

-- 1. Atomic Dashboard + Initial Users Creation
CREATE OR REPLACE FUNCTION public.create_dashboard_with_users(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_hash VARCHAR(16) DEFAULT NULL,
    p_users JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_dashboard public.dashboards%ROWTYPE;
    v_users JSONB := '[]'::jsonb;
    v_user RECORD;
BEGIN
    INSERT INTO public.dashboards (title, description, hash)
    VALUES (p_title, p_description, p_hash)
    RETURNING * INTO v_dashboard;

    IF p_users IS NOT NULL AND jsonb_array_length(p_users) > 0 THEN
        FOR v_user IN
            SELECT
                (u->>'user_alias')::TEXT AS user_alias,
                (u->>'password_hash')::TEXT AS password_hash
            FROM jsonb_array_elements(p_users) AS u
        LOOP
            INSERT INTO public.dashboard_users (dashboard_id, user_alias, password_hash)
            VALUES (v_dashboard.id, v_user.user_alias, v_user.password_hash);
        END LOOP;

        SELECT jsonb_agg(
            jsonb_build_object(
                'id', du.id,
                'dashboard_id', du.dashboard_id,
                'user_alias', du.user_alias,
                'created_at', du.created_at
            )
        )
        INTO v_users
        FROM public.dashboard_users du
        WHERE du.dashboard_id = v_dashboard.id;
    END IF;

    RETURN jsonb_build_object(
        'dashboard', to_jsonb(v_dashboard),
        'users', COALESCE(v_users, '[]'::jsonb)
    );
END;
$$;

-- 2. Atomic Note Creation with Initial Version 1 Snapshot
CREATE OR REPLACE FUNCTION public.create_note_with_version(
    p_dashboard_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_author_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_note public.notes%ROWTYPE;
    v_version public.note_versions%ROWTYPE;
BEGIN
    INSERT INTO public.notes (dashboard_id, title, content, version)
    VALUES (p_dashboard_id, COALESCE(p_title, ''), p_content, 1)
    RETURNING * INTO v_note;

    INSERT INTO public.note_versions (note_id, version, title, content, author_id)
    VALUES (v_note.id, 1, v_note.title, v_note.content, p_author_id)
    RETURNING * INTO v_version;

    RETURN jsonb_build_object(
        'note', to_jsonb(v_note),
        'initialVersion', to_jsonb(v_version)
    );
END;
$$;

-- 3. Atomic Note Update with Optimistic Concurrency and Snapshot Insertion
CREATE OR REPLACE FUNCTION public.update_note_with_version(
    p_note_id UUID,
    p_expected_version INT,
    p_content TEXT,
    p_title TEXT DEFAULT NULL,
    p_author_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_note public.notes%ROWTYPE;
    v_version public.note_versions%ROWTYPE;
BEGIN
    IF p_title IS NOT NULL THEN
        UPDATE public.notes
        SET
            title = p_title,
            content = p_content,
            version = p_expected_version + 1,
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE id = p_note_id AND version = p_expected_version
        RETURNING * INTO v_note;
    ELSE
        UPDATE public.notes
        SET
            content = p_content,
            version = p_expected_version + 1,
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE id = p_note_id AND version = p_expected_version
        RETURNING * INTO v_note;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version mismatch or note not found (expected version %)', p_expected_version;
    END IF;

    INSERT INTO public.note_versions (note_id, version, title, content, author_id)
    VALUES (v_note.id, v_note.version, v_note.title, v_note.content, p_author_id)
    RETURNING * INTO v_version;

    RETURN jsonb_build_object(
        'note', to_jsonb(v_note),
        'newVersion', to_jsonb(v_version)
    );
END;
$$;

-- Grant execution permissions strictly to service_role
REVOKE ALL ON FUNCTION public.create_dashboard_with_users FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_note_with_version FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_note_with_version FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_dashboard_with_users TO service_role;
GRANT EXECUTE ON FUNCTION public.create_note_with_version TO service_role;
GRANT EXECUTE ON FUNCTION public.update_note_with_version TO service_role;
