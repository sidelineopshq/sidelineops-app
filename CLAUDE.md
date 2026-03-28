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
