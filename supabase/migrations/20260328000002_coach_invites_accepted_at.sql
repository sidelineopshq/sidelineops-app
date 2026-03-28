ALTER TABLE public.coach_invites
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
