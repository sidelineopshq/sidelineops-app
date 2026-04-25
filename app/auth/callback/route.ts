import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const next       = searchParams.get('next') ?? '/dashboard'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    },
  )

  // ── Token-hash flow (cross-device safe) ───────────────────────
  // Used by the updated password-reset email template. Does not
  // require a PKCE verifier cookie, so it works when the user
  // opens the link in a different browser or device.
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    })
    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    // Token expired or already used
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/forgot-password?error=link_expired`)
    }
    return NextResponse.redirect(`${origin}/login?error=invalid_link`)
  }

  // ── PKCE code flow (signup, magic link, invite, etc.) ─────────
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const isRecovery = type === 'recovery' || next === '/reset-password'
      if (isRecovery) {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    // PKCE exchange failed — most commonly because the user opened the link
    // in a different browser/device than the one that requested the reset.
    if (next === '/reset-password' || type === 'recovery') {
      return NextResponse.redirect(`${origin}/forgot-password?error=link_expired`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
