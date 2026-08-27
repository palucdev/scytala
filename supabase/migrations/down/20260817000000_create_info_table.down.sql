-- Down Migration: Drop info audit table
-- Corresponds to: 20260817000000_create_info_table.sql

DROP TABLE IF EXISTS public.info CASCADE;
