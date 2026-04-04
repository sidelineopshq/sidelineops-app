'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { formatProgramLabel } from '@/lib/utils/team-label'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function addTeam(
  level: string,
  slug: string,
  sortOrder: number,
  programId: string,
) {
  if (!slug.trim())  return { error: 'Slug is required' }
  if (!programId)    return { error: 'Program ID is required' }

  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // Verify caller has can_manage_team_settings on at least one team in the program
  const { data: programTeams } = await service
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const programTeamIds = (programTeams ?? []).map((t: { id: string }) => t.id)

  if (programTeamIds.length > 0) {
    const { data: callerTeams } = await authClient
      .from('team_users')
      .select('can_manage_team_settings')
      .eq('user_id', user.id)
      .in('team_id', programTeamIds)

    if (!callerTeams?.some((t: { can_manage_team_settings: boolean }) => t.can_manage_team_settings)) {
      return { error: 'Not authorized' }
    }
  }

  // Fetch program + school to compute team name
  const { data: programRow } = await service
    .from('programs')
    .select('sport, schools(name)')
    .eq('id', programId)
    .single()

  const schoolName = (programRow as any)?.schools?.name ?? ''
  const sport      = programRow?.sport ?? ''
  const teamName   = formatProgramLabel(schoolName, sport)

  if (!teamName) return { error: 'Could not determine team name from program' }

  // Sanitize slug
  const trimmedSlug = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!trimmedSlug) return { error: 'Invalid slug' }

  // Validate slug uniqueness globally (slugs are used in public URLs)
  const { data: existing } = await service
    .from('teams')
    .select('id')
    .eq('slug', trimmedSlug)
    .maybeSingle()

  if (existing) return { error: 'A team with this URL slug already exists' }

  // Insert the new team
  const { data: newTeam, error: insertError } = await service
    .from('teams')
    .insert({
      program_id: programId,
      name:       teamName,
      level:      level || null,
      slug:       trimmedSlug,
      sort_order: sortOrder,
      is_active:  true,
      is_default: false,
      is_primary: false,
    })
    .select()
    .single()

  if (insertError || !newTeam) {
    return { error: insertError?.message ?? 'Failed to create team' }
  }

  // Grant the creating user full admin access to the new team
  const { error: teamUserError } = await service
    .from('team_users')
    .insert({
      team_id:                  newTeam.id,
      user_id:                  user.id,
      role:                     'admin',
      can_manage_events:        true,
      can_manage_contacts:      true,
      can_send_notifications:   true,
      can_manage_volunteers:    true,
      can_manage_team_settings: true,
    })

  if (teamUserError) {
    console.error('[addTeam] team_users insert error:', teamUserError)
  }

  revalidatePath('/settings/team')
  revalidatePath('/dashboard')
  return { success: true, team: newTeam }
}
