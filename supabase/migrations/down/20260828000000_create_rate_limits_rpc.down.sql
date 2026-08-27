-- Down Migration: Drop rate_limits table and check_rate_limit RPC function
-- Change: S-02 (dashboard-auth-login-and-tiles-view)

DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
DROP TABLE IF EXISTS public.rate_limits CASCADE;
