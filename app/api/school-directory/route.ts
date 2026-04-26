import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  // Auth check — this is NOT a public route
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json([])
  }

  const service = createServiceClient()

  // Try with normalized_name; fall back to name+city only if column missing
  let data: any[] = []

  const primary = await service
    .from('school_directory')
    .select('id, name, type, address, city, state, zip, full_address, district, county, normalized_name, latitude, longitude')
    .or(`name.ilike.%${q}%,normalized_name.ilike.%${q}%,city.ilike.%${q}%`)
    .order('name')
    .limit(10)

  if (!primary.error) {
    data = primary.data ?? []
  } else {
    // Fallback: search on name + city only
    const fallback = await service
      .from('school_directory')
      .select('id, name, type, address, city, state, zip, full_address, district, county, latitude, longitude')
      .or(`name.ilike.%${q}%,city.ilike.%${q}%`)
      .order('name')
      .limit(10)

    if (fallback.error) {
      console.error('[school-directory] search error:', fallback.error)
      return NextResponse.json([])
    }
    data = fallback.data ?? []
  }

  // Re-sort client-side: prefix matches first, then contains, then rest
  const qLower = q.toLowerCase()
  data.sort((a: any, b: any) => {
    const aL = a.name.toLowerCase()
    const bL = b.name.toLowerCase()
    const score = (name: string) =>
      name.startsWith(qLower) ? 0 : name.includes(qLower) ? 1 : 2
    const d = score(aL) - score(bL)
    return d !== 0 ? d : aL.localeCompare(bL)
  })

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  })
}
