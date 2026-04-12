# Claude Code Notes

## Notification Architecture

### Blocking vs non-blocking calls
- **Cancellation and change alert notifications use `await`** (blocking). The server action does not return until the notification completes, guaranteeing delivery on Vercel serverless. The slight extra UI delay is acceptable.
- **New event notifications use `void`** (non-blocking). A short delay is acceptable for new event alerts, and the create action can redirect immediately.

### Routing
All outbound notifications route through `lib/notifications/channel-router.ts`.

### Change detection
`lib/notifications/change-detector.ts` accepts `teamName` as a parameter to produce human-readable change labels (e.g. "Varsity Start Time" instead of a raw field name).

### Intentionally excluded fields
`default_start_time` is excluded from notifiable fields. Only team-specific start times (`event_team_details.start_time`) are surfaced to parents.

### Required environment variables
`UNSUBSCRIBE_SECRET` and `BASE_URL` must be set in Vercel environment variables. If either is missing, email notifications will fail silently in production.

## Infrastructure Notes

### Middleware
- This project uses `proxy.ts` **NOT** `middleware.ts` for route protection. **Never create `middleware.ts`** — it conflicts with `proxy.ts` and breaks the Vercel build. `proxy.ts` is the ONLY middleware file and is recognized by the custom framework setup.
- When adding new public routes (API routes, public pages) that should bypass auth, add them to `proxy.ts`
- Public routes that must be excluded from auth (defined as `PUBLIC_PREFIXES` in `proxy.ts`):
  - `/schedule/` — public schedule pages
  - `/embed/` — embedded widget (handled separately for iframe headers)
  - `/join/` — program parent signup
  - `/volunteer/` — public volunteer signup
  - `/accept-invite` — coach invite acceptance
  - `/external-subscribe/` — external subscriber flow
  - `/unsubscribe` — email unsubscribe page
  - `/signup`, `/login`, `/forgot-password`, `/reset-password` — auth pages
  - `/auth/` — auth callbacks
  - `/legal/` — terms and privacy pages
  - `/api/cron/`, `/api/admin/`, `/api/feedback`, `/api/unsubscribe`, `/api/groupme/`, `/api/accept-invite`, `/api/team/` — public API routes

### Environment Variables
- `ADMIN_SECRET` — required for `/api/admin/create-access-code`
- Must be added to both `.env.local` and Vercel dashboard
- Never commit actual secret values to GitHub

## Parent Signup Architecture

### Program-level signup (current)
- Parents sign up at `/join/[programSlug]?t=[token]` — one link per **program**, not per team
- The join token lives on `programs.join_token` + `programs.join_token_enabled` + `programs.slug`
- Contacts created via signup have `team_id = null`; they are linked to teams via the `contact_teams` junction table
- Player selection during signup upserts rows into `contact_teams` for each team the player belongs to (checks both `players.team_id` and `player_teams.team_id`)
- Token regeneration: `regenerateProgramJoinToken()` in `app/join/[programSlug]/actions.ts` — requires coach/admin role

### Contact association — TWO sources
Contacts can be associated with teams via **two methods**:
1. `contacts.team_id` — legacy direct column (may be null for program-join contacts)
2. `contact_teams` table — junction table used by the program-level signup flow

**ALL contact queries must check both** to avoid missing program-join contacts. Standard pattern:

```typescript
// Step 1: get contact IDs from junction table
const { data: ctRows } = await supabase
  .from('contact_teams')
  .select('contact_id')
  .in('team_id', teamIds)               // or .eq('team_id', teamId) for single team
const ctContactIds = [...new Set((ctRows ?? []).map(r => r.contact_id))]

// Step 2: query contacts — legacy OR junction
const builder = supabase.from('contacts').select('...').is('deleted_at', null)
const { data: contacts } = ctContactIds.length > 0
  ? await builder.or(`team_id.in.(${teamIds.join(',')}),id.in.(${ctContactIds.join(',')})`)
  : await builder.in('team_id', teamIds)
```

Files using this pattern: `contacts/page.tsx`, `events/[id]/notify/page.tsx`, `events/[id]/notify/actions.ts`, `fire-change-notifications.ts`, `events/new/actions.ts`, `schedule/tournament-actions.ts`, `api/cron/weekly-digest/route.ts`

**Volunteer-reminders cron** (`api/cron/volunteer-reminders/route.ts`) does NOT query the contacts table — it sends to volunteer assignments and admin users only. No change needed there.
