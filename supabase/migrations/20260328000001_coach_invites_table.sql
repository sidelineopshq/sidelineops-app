CREATE TABLE IF NOT EXISTS public.coach_invites (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id      uuid        NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  team_ids        uuid[]      NOT NULL,
  team_names      text[]      NOT NULL DEFAULT '{}',
  email           text        NOT NULL,
  role            text        NOT NULL CHECK (role IN ('admin', 'coach')),
  token           text        NOT NULL UNIQUE,
  invited_by      uuid        REFERENCES auth.users(id),
  invited_by_name text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_invites_program_email_idx ON public.coach_invites (program_id, email);
CREATE INDEX IF NOT EXISTS coach_invites_token_idx         ON public.coach_invites (token);
