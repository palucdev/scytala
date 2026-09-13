-- Additive migration: re-apply update_note_with_version so the optimistic
-- concurrency failure raises a stable PostgreSQL errcode (P0002) instead of
-- relying on error-message text matching in the application layer.
--
-- Forward-only: same function signature, so existing call sites and grants
-- are unaffected; privileges are re-asserted defensively below.

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
        RAISE EXCEPTION 'Version mismatch or note not found (expected version %)', p_expected_version
            USING ERRCODE = 'P0002';
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

REVOKE ALL ON FUNCTION public.update_note_with_version(uuid, int, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_note_with_version(uuid, int, text, text, uuid) TO service_role;
