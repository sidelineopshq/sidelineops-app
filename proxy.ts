import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = [
  // Public page routes
  '/schedule/',
  '/embed/',
  '/join/',
  '/volunteer/',
  '/accept-invite',
  '/external-subscribe/',
  '/unsubscribe',
  '/signup',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/',
  '/legal/',
  // Public API routes
  '/api/cron/',
  '/api/admin/',
  '/api/feedback',
  '/api/unsubscribe',
  '/api/groupme/',
  '/api/accept-invite',
  '/api/team/',
]

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Embed routes: public + must have iframe headers
  if (pathname.startsWith('/embed/')) {
    const response = NextResponse.next()
    response.headers.set('X-Frame-Options', 'ALLOWALL')
    response.headers.set('Content-Security-Policy', "frame-ancestors *")
    return response
  }

  // Skip session refresh for all other public routes
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}