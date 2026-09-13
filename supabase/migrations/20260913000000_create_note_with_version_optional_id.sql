-- Additive migration: extend create_note_with_version with an optional
-- pre-generated note ID so the application layer can bind AES-GCM AAD =
-- note ID at creation time (envelope encryption of title/content at rest).
--
-- Forward-only, additive: existing 4-arg call sites keep working via the
-- COALESCE(p_note_id, gen_random_uuid()) default path; the old 4-arg overload
-- is dropped after the replacement is in place (no other callers exist).

CREATE OR REPLACE FUNCTION public.create_note_with_version(
    p_dashboard_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_author_id UUID DEFAULT NULL,
    p_note_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_note public.notes%ROWTYPE;
    v_version public.note_versions%ROWTYPE;
    v_note_id UUID := COALESCE(p_note_id, gen_random_uuid());
BEGIN
    INSERT INTO public.notes (id, dashboard_id, title, content, version)
    VALUES (v_note_id, p_dashboard_id, COALESCE(p_title, ''), p_content, 1)
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

-- The new 5-arg signature is a new function identity under CREATE OR REPLACE;
-- re-apply the hardening so it does not inherit default PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.create_note_with_version(uuid, text, text, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_note_with_version(uuid, text, text, uuid, uuid) TO service_role;

-- Remove the now-superseded 4-arg overload.
DROP FUNCTION public.create_note_with_version(uuid, text, text, uuid);
