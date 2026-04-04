---
name: Infrastructure Notes
description: Middleware file, public route exclusions, and environment variable requirements for SidelineOps
type: project
---

## Middleware

`proxy.ts` (project root) is the active Next.js middleware — NOT `middleware.ts`.

**Why:** This project uses `proxy.ts` as the middleware entry point. Creating a `middleware.ts` alongside it causes a Vercel build error: "Both middleware file and proxy file are detected."

**How to apply:** When adding public routes that should bypass Supabase session refresh, add their path prefix to the `PUBLIC_API_PREFIXES` array in `proxy.ts`.

### Currently excluded public routes (in proxy.ts):
- `/api/admin/` — Bearer-authenticated admin routes
- `/api/cron/` — CRON_SECRET authenticated cron jobs
- `/api/unsubscribe` — public unsubscribe handler
- `/api/groupme/` — GroupMe callback
- `/api/accept-invite` — invite acceptance
- `/api/team/` — public team join routes
- `/auth/callback` — Supabase auth callback

### Other public pages (not in proxy.ts exclusions but don't require team_users):
- `/volunteer/[teamSlug]` — public volunteer signup
- `/accept-invite` — invite acceptance page
- `/external-subscribe/confirm` and `/unsubscribe`
- `/signup`, `/forgot-password`, `/reset-password`

## Environment Variables

| Variable | Purpose | Required in Vercel |
|---|---|---|
| `ADMIN_SECRET` | Bearer token for `/api/admin/create-access-code` | Yes |
| `ADMIN_SECRET` value | `a8c5553f4dc0a9dbcf5ee044fd18f48c74038d8d8fc7dc023114b68087c1a508` | (in .env.local only) |
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe tokens for email links | Yes |
| `BASE_URL` | Used in email links and server-side redirects | Yes |
| `CRON_SECRET` | Authenticates cron job API routes | Yes |

**Never commit actual secret values to GitHub.** `.env.local` is gitignored. All secrets must be added manually to the Vercel dashboard under Project → Settings → Environment Variables.
