-- Add appearance columns to teams table
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS logo_url        text,
  ADD COLUMN IF NOT EXISTS primary_color   text,
  ADD COLUMN IF NOT EXISTS secondary_color text;
