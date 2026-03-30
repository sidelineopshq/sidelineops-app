---
name: SidelineOps Project Brief
description: Full product brief — goals, design decisions, features built, and roadmap
type: project
---

SaaS team operations platform for high school athletic programs.
Beta target: August 2026. Initial sport: softball. Domain: SidelineOpsHQ.com.

**Why:** Foundational product context for all feature and architecture decisions.
**How to apply:** Use to prioritize work, avoid over-engineering, and understand intent behind design choices.

## Tech Stack
- Next.js 16 (App Router) + TypeScript
- Supabase (PostgreSQL + Auth + RLS)
- Tailwind CSS
- Vercel (auto-deploy from GitHub)
- Dev: M1 Mac Mini

## Critical Architecture Rules
- Middleware file is `proxy.ts` at project root (NOT `middleware.ts` — Next.js 16 renamed it)
- Dynamic route params must be awaited: `const { id } = await params`
- Two-client pattern is mandatory:
  - Auth/permission checks: SSR client (`createServerClient` from `@/lib/supabase/server`)
  - All DB writes: service role client (`createClient` from `@supabase/supabase-js`) — bypasses RLS
  - Public pages with no auth user also use service role client for reads

## Production Seed Data
- School: James Clemens High School
- Program: James Clemens Softball
- Team: Varsity — slug: `jc-softball-varsity`, token: `13dfe1150c0c`
- Full 2026 softball schedule loaded
- Early Adopter billing plan active

## Key DB Design Decisions
- `team_users` has boolean permission flags (not role strings): `can_manage_events`, `can_manage_volunteers`, `can_manage_contacts`, `can_send_notifications`, `can_manage_team_settings`
- Tournament child games: `parent_event_id` self-reference on `events` table. All schedule queries filter with `.is('parent_event_id', null)` to exclude children
- `contacts.sms_consent` can only be set via parent signup flow — RLS blocks coach-created contacts from setting it
- `players` is separate from `contacts` — roster exists before parents sign up
- `contacts` soft-deleted via `deleted_at` column

## UI Rules
- Dark theme: `bg-slate-950` base, `bg-slate-900` cards, `border-white/10` borders
- `rounded-2xl` cards, `sky-500` primary accent
- Mobile-first — must work on iPhone
- Safari fixes: inline styles for logo sizing, `style={{ appearance: 'auto' }}` on selects, inline grid styles instead of Tailwind grid classes for calendar
- `AppNav`: client component, desktop nav + mobile hamburger dropdown
- Server actions: always return `{ error: string }` or `{ success: true }` — never throw

## Features Already Built
- Dashboard: next event, quick actions, volunteer status, public schedule links
- Schedule: list + calendar views (calendar → grouped list on mobile), tournament nested game rows with amber left border
- Public schedule page with Next Game hero
- Team schedule (token-gated, shows practices + meal details)
- Embeddable iframe widget at `/embed/schedule/[teamSlug]`
- ICS calendar feed
- Roster: add/edit/remove players, join link generation with rotation
- Parent signup: token validation, player dropdown, phone formatting, SMS consent, phone dedup
- Contacts: filter by role/player/unlinked, edit modal, soft delete, SMS text button

## Immediate Next Priority: Multi-Team Support
Schema already supports multiple teams via `event_team_details`.
Work needed:
- Add JV team to program
- Event creation UI: assign events to one or multiple teams with per-team start times
- Team filter on schedule view
- Roster: primary team assignment + call-up flag
- Unified coach view filterable by team

## Roadmap After Multi-Team
1. Email notifications (consented contacts exist)
2. Volunteer management
3. DragonFly schedule import (SheetJS)
4. Account/user management (invite coaches, set permissions)
5. School color palette for embed widget theming
