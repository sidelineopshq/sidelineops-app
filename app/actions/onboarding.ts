'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function slugify(val: string) {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface OnboardingData {
  schoolName:  string
  city:        string
  state:       string
  sport:       string
  seasonYear:  number
  teamName:    string
  level:       string
  teamSlug:    string
}

export async function createProgramAndTeam(data: OnboardingData) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const service      = createServiceClient()
  const schoolSlug   = slugify(data.schoolName)

  // ── 1. School ───────────────────────────────────────────────────────────────
  const { data: existingSchool } = await service
    .from('schools')
    .select('id')
    .eq('slug', schoolSlug)
    .maybeSingle()

  let schoolId: string

  if (existingSchool) {
    await service
      .from('schools')
      .update({ name: data.schoolName.trim(), city: data.city.trim(), state: data.state })
      .eq('id', existingSchool.id)
    schoolId = existingSchool.id
  } else {
    const { data: newSchool, error: schoolErr } = await service
      .from('schools')
      .insert({ name: data.schoolName.trim(), city: data.city.trim(), state: data.state, slug: schoolSlug, is_active: true })
      .select('id')
      .single()
    if (schoolErr || !newSchool) return { error: schoolErr?.message ?? 'Failed to create school' }
    schoolId = newSchool.id
  }

  // ── 2. Program ──────────────────────────────────────────────────────────────
  const programSlug = slugify(`${data.sport}-program`)
  const programName = `${data.sport.trim()} Program`

  const { data: existingProgram } = await service
    .from('programs')
    .select('id')
    .eq('school_id', schoolId)
    .eq('slug', programSlug)
    .maybeSingle()

  let programId: string

  if (existingProgram) {
    await service
      .from('programs')
      .update({ sport: data.sport.trim(), season_year: data.seasonYear })
      .eq('id', existingProgram.id)
    programId = existingProgram.id
  } else {
    const { data: newProgram, error: programErr } = await service
      .from('programs')
      .insert({
        school_id:   schoolId,
        name:        programName,
        sport:       data.sport.trim(),
        season_year: data.seasonYear,
        slug:        programSlug,
        is_active:   true,
      })
      .select('id')
      .single()
    if (programErr || !newProgram) return { error: programErr?.message ?? 'Failed to create program' }
    programId = newProgram.id
  }

  // ── 3. Team ─────────────────────────────────────────────────────────────────
  const teamSlug = data.teamSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!teamSlug) return { error: 'Invalid team slug' }

  const { data: slugConflict } = await service
    .from('teams')
    .select('id')
    .eq('slug', teamSlug)
    .maybeSingle()

  if (slugConflict) return { error: 'A team with this URL slug already exists. Please edit the slug.' }

  const { data: newTeam, error: teamErr } = await service
    .from('teams')
    .insert({
      program_id: programId,
      name:       data.teamName.trim(),
      level:      data.level || null,
      slug:       teamSlug,
      sort_order: 1,
      is_active:  true,
      is_default: true,
      is_primary: true,
    })
    .select('id')
    .single()

  if (teamErr || !newTeam) return { error: teamErr?.message ?? 'Failed to create team' }

  // ── 4. team_users ───────────────────────────────────────────────────────────
  const { error: tuErr } = await service.from('team_users').insert({
    team_id:                  newTeam.id,
    user_id:                  user.id,
    role:                     'admin',
    can_manage_events:        true,
    can_manage_contacts:      true,
    can_send_notifications:   true,
    can_manage_volunteers:    true,
    can_manage_team_settings: true,
  })

  if (tuErr) console.error('[createProgramAndTeam] team_users error:', tuErr)

  // ── 5. Billing ──────────────────────────────────────────────────────────────
  const { data: billing, error: billingErr } = await service
    .from('billing_accounts')
    .insert({
      name:          `${data.schoolName.trim()} ${data.sport.trim()}`,
      account_type:  'standard',
      owner_user_id: user.id,
      school_id:     schoolId,
      is_active:     true,
    })
    .select('id')
    .single()

  if (billingErr) {
    console.error('[createProgramAndTeam] billing_accounts error:', billingErr)
  } else if (billing) {
    const { error: batErr } = await service
      .from('billing_account_teams')
      .insert({ billing_account_id: billing.id, team_id: newTeam.id })
    if (batErr) console.error('[createProgramAndTeam] billing_account_teams error:', batErr)
  }

  revalidatePath('/dashboard')
  return { success: true }
}
