---
name: SidelineOps App Architecture
description: Core architecture and patterns for the SidelineOps Next.js app
type: project
---

Next.js 16 app with Supabase, TypeScript, React 19, Tailwind CSS 4.

**Why:** Foundational context for all development work.
**How to apply:** Reference when adding routes, actions, or DB queries.

## Stack
- Next.js App Router with route groups
- `@supabase/ssr` for server-side auth
- Service role client for all DB writes (bypasses RLS)
- Auth client (ANON_KEY) for reads + permission checks

## Route Structure
- `app/(app)/` — protected routes (auth enforced in layout.tsx)
- `app/schedule/[teamSlug]/` — public schedule pages
- `app/embed/schedule/[teamSlug]/` — embeddable iframe widget
- `app/join/[token]/` — parent signup flow
- `app/api/team/[teamId]/join/` — parent signup API endpoint

## Server Actions Pattern
- File: `app/(app)/[feature]/actions.ts` with `'use server'`
- Auth check via `createClient()` (anon key) → verify user + permissions
- Writes via service role client using `SUPABASE_SERVICE_ROLE_KEY`
- Returns `{ success: true }` or `{ error: string }`

## Supabase Clients
- `lib/supabase/server.ts` — cookie-based server client (ANON_KEY)
- `lib/supabase/client.ts` — browser client (ANON_KEY)
- Service role client created inline in actions (not a shared helper)

## Key DB Tables
- `teams`, `programs`, `schools`
- `team_users` — membership + permissions (can_manage_events, can_manage_contacts, etc.)
- `events`, `event_team_details`, `event_volunteer_slots`, `volunteer_assignments`
- `players` — roster entries
- `contacts` — parents/guardians (soft-deleted via `deleted_at`)
- `team_join_tokens` — token-based parent signup

## Permissions Model
- `team_users` has boolean permission columns per feature
- Every server action checks the relevant permission before writing
