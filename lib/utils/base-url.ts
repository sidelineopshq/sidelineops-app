/**
 * Returns the canonical base URL for this deployment.
 *
 * Resolution order:
 *   1. BASE_URL          — explicitly set in Vercel env (preferred)
 *   2. VERCEL_URL        — Vercel auto-sets this to the deployment hostname
 *   3. localhost:3000    — local dev fallback
 */
export function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
