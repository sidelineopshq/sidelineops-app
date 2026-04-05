import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_API_PREFIXES = [
  '/api/admin/',
  '/api/cron/',
  '/api/unsubscribe',
  '/api/groupme/',
  '/api/accept-invite',
  '/api/team/',
  '/api/feedback',
  '/auth/callback',
]

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip session refresh for routes that handle their own auth
  if (PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
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

  // Set iframe headers on both request and response for embed routes
  if (request.nextUrl.pathname.startsWith('/embed/')) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('Content-Security-Policy', "frame-ancestors *")
    
    supabaseResponse = NextResponse.next({
      request: { headers: requestHeaders },
    })
    supabaseResponse.headers.set('X-Frame-Options', 'ALLOWALL')
    supabaseResponse.headers.set('Content-Security-Policy', "frame-ancestors *")
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}