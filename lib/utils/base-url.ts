/**
 * Returns the canonical base URL for this deployment.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_BASE_URL — explicitly set, works in both server and client
 *   2. BASE_URL             — server-only explicit override
 *   3. VERCEL_URL           — Vercel auto-sets this to the deployment hostname
 *   4. localhost:3000       — local dev fallback
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.BASE_URL) return process.env.BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
