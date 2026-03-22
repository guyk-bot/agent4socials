-- Fix "Could not save account" / Postgres 22P02 when connecting Pinterest if the
-- Platform enum was never updated in production (migration skipped or failed).
--
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- PostgreSQL 15+ (IF NOT EXISTS on ADD VALUE). On older PG, use instead:
--   ALTER TYPE "Platform" ADD VALUE 'PINTEREST';
-- (ignore error if the value already exists)

ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'PINTEREST';
