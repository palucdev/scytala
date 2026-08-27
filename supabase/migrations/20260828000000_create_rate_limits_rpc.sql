-- Migration: Add rate_limits table and check_rate_limit atomic Token Bucket RPC function
-- Change: S-02 (dashboard-auth-login-and-tiles-view)
-- Purpose: Native PostgreSQL distributed rate limiting for account and dashboard creation throttling

-- 1. Create rate_limits table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT PRIMARY KEY,
    tokens DOUBLE PRECISION NOT NULL,
    last_refill TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. Revoke direct access from public, anon, and authenticated roles
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;

-- 4. Grant full access strictly to service_role
GRANT ALL ON TABLE public.rate_limits TO service_role;

-- 5. Create atomic Token Bucket stored procedure with lazy refill
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key TEXT,
    p_max_tokens DOUBLE PRECISION,
    p_refill_rate DOUBLE PRECISION,
    p_cost DOUBLE PRECISION DEFAULT 1.0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := TIMEZONE('utc'::text, NOW());
    v_tokens DOUBLE PRECISION;
    v_last_refill TIMESTAMPTZ;
    v_elapsed_seconds DOUBLE PRECISION;
    v_calculated_tokens DOUBLE PRECISION;
    v_new_tokens DOUBLE PRECISION;
    v_retry_after INT := 0;
BEGIN
    -- Select existing record with row-level lock
    SELECT tokens, last_refill INTO v_tokens, v_last_refill
    FROM public.rate_limits
    WHERE key = p_key
    FOR UPDATE;

    IF NOT FOUND THEN
        -- First request for this key
        IF p_max_tokens >= p_cost THEN
            INSERT INTO public.rate_limits (key, tokens, last_refill)
            VALUES (p_key, p_max_tokens - p_cost, v_now)
            ON CONFLICT (key) DO UPDATE
            SET tokens = EXCLUDED.tokens, last_refill = EXCLUDED.last_refill;

            RETURN jsonb_build_object(
                'success', true,
                'remaining', floor(p_max_tokens - p_cost)::INT,
                'retry_after_seconds', 0
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'remaining', 0,
                'retry_after_seconds', GREATEST(1, CEIL(p_cost / p_refill_rate)::INT)
            );
        END IF;
    ELSE
        -- Refill tokens based on elapsed time
        v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_last_refill));
        v_calculated_tokens := LEAST(p_max_tokens, v_tokens + (v_elapsed_seconds * p_refill_rate));

        IF v_calculated_tokens >= p_cost THEN
            v_new_tokens := v_calculated_tokens - p_cost;
            UPDATE public.rate_limits
            SET tokens = v_new_tokens,
                last_refill = v_now
            WHERE key = p_key;

            RETURN jsonb_build_object(
                'success', true,
                'remaining', floor(v_new_tokens)::INT,
                'retry_after_seconds', 0
            );
        ELSE
            -- Quota exceeded: calculate retry after seconds
            v_retry_after := GREATEST(1, CEIL((p_cost - v_calculated_tokens) / p_refill_rate)::INT);

            -- Update tokens and timestamp to prevent timestamp drift
            UPDATE public.rate_limits
            SET tokens = v_calculated_tokens,
                last_refill = v_now
            WHERE key = p_key;

            RETURN jsonb_build_object(
                'success', false,
                'remaining', floor(v_calculated_tokens)::INT,
                'retry_after_seconds', v_retry_after
            );
        END IF;
    END IF;
END;
$$;

-- Revoke execute from public/anon/authenticated and grant to service_role
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
