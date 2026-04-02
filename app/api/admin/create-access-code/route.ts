import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const ADJECTIVES = [
  'swift', 'bright', 'bold', 'clear', 'crisp', 'fresh', 'grand', 'keen',
  'prime', 'sharp', 'solid', 'spare', 'stark', 'stern', 'stout', 'true',
  'vast', 'warm', 'wise', 'calm', 'clean', 'cool', 'dark', 'deep',
  'fair', 'fast', 'fine', 'firm', 'free', 'full', 'gold', 'good',
]

const NOUNS = [
  'eagle', 'falcon', 'hawk', 'raven', 'heron', 'crane', 'finch', 'swift',
  'cedar', 'maple', 'birch', 'aspen', 'ember', 'flint', 'slate', 'stone',
  'creek', 'ridge', 'grove', 'field', 'bluff', 'cliff', 'coast', 'crest',
  'delta', 'forge', 'haven', 'inlet', 'march', 'plain', 'trail', 'vault',
]

function generateCode(): string {
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun   = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  return `${adj}-${noun}-${digits}`
}

export async function POST(req: NextRequest) {
  // 1. Auth check
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const secret     = process.env.ADMIN_SECRET

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: { description?: string; maxUses?: number; expiresInDays?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const description   = body.description   ?? ''
  const maxUses       = Number(body.maxUses ?? 1)
  const expiresInDays = Number(body.expiresInDays ?? 30)

  if (maxUses < 1 || !Number.isInteger(maxUses)) {
    return NextResponse.json({ error: 'maxUses must be a positive integer' }, { status: 400 })
  }
  if (expiresInDays < 1 || !Number.isInteger(expiresInDays)) {
    return NextResponse.json({ error: 'expiresInDays must be a positive integer' }, { status: 400 })
  }

  // 3. Generate a unique code (retry on collision)
  const supabase = serviceClient()
  let code = ''
  let attempts = 0

  while (attempts < 10) {
    const candidate = generateCode()
    const { data: existing } = await supabase
      .from('access_codes')
      .select('id')
      .eq('code', candidate)
      .maybeSingle()

    if (!existing) {
      code = candidate
      break
    }
    attempts++
  }

  if (!code) {
    return NextResponse.json({ error: 'Failed to generate unique code — try again' }, { status: 500 })
  }

  // 4. Insert
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { error: insertError } = await supabase
    .from('access_codes')
    .insert({
      code,
      description,
      max_uses:   maxUses,
      use_count:  0,
      expires_at: expiresAt,
      is_active:  true,
    })

  if (insertError) {
    console.error('[create-access-code] insert error:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ code, expiresAt, maxUses })
}
