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

// ── Volunteer Role helpers ────────────────────────────────────────────────────

async function assertProgramManageAccess(userId: string, programId: string) {
  const authClient = await createServerClient()
  const { data: teams } = await authClient
    .from('teams')
    .select('id')
    .eq('program_id', programId)
  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length === 0) return false
  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', userId)
    .in('team_id', teamIds)
  return teamUsers?.some(t => t.can_manage_events) ?? false
}

export async function addVolunteerRole(
  programId:   string,
  name:        string,
  description: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Role name is required' }

  const service = createServiceClient()
  const { error } = await service
    .from('volunteer_roles')
    .insert({
      program_id:  programId,
      name:        trimmed,
      description: description.trim() || null,
      is_active:   true,
    })

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function updateVolunteerRole(
  roleId:      string,
  name:        string,
  description: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  // Look up program_id to verify access
  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Role name is required' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ name: trimmed, description: description.trim() || null })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function setSuppressReminders(roleId: string, suppress: boolean) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ suppress_reminders: suppress })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function deactivateVolunteerRole(roleId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ is_active: false })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function reactivateVolunteerRole(roleId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ is_active: true })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function saveHomeLocation(
  programId: string,
  homeLocationName: string,
  homeLocationAddress: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify user has can_manage_events on at least one team in this program
  const { data: teams } = await authClient
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length === 0) return { error: 'Not authorized' }

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .in('team_id', teamIds)

  if (!teamUsers?.some(t => t.can_manage_events)) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('programs')
    .update({
      home_location_name:    homeLocationName.trim()    || null,
      home_location_address: homeLocationAddress.trim() || null,
    })
    .eq('id', programId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}

export async function saveTeamInfo(
  teamId: string,
  name: string,
  level: string,
  slug: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const trimmedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!name.trim()) return { error: 'Team name is required' }
  if (!trimmedSlug) return { error: 'Slug is required' }

  const service = createServiceClient()
  const { error } = await service
    .from('teams')
    .update({ name: name.trim(), level: level.trim() || null, slug: trimmedSlug })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function saveColors(
  teamId: string,
  primaryColor: string,
  secondaryColor: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('teams')
    .update({ primary_color: primaryColor, secondary_color: secondaryColor })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}

export async function uploadLogo(teamId: string, formData: FormData) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { error: 'No file provided' }

  const ACCEPTED = ['image/png', 'image/jpeg', 'image/svg+xml']
  if (!ACCEPTED.includes(file.type)) return { error: 'File must be PNG, JPG, or SVG' }
  if (file.size > 2 * 1024 * 1024) return { error: 'File must be under 2 MB' }

  const ext = file.type === 'image/svg+xml' ? 'svg'
             : file.type === 'image/jpeg'    ? 'jpg'
             : 'png'
  const storagePath = `${teamId}/logo.${ext}`

  const bytes = await file.arrayBuffer()
  const service = createServiceClient()

  const { error: uploadError } = await service.storage
    .from('team-assets')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = service.storage
    .from('team-assets')
    .getPublicUrl(storagePath)

  const { error: updateError } = await service
    .from('teams')
    .update({ logo_url: publicUrl })
    .eq('id', teamId)

  if (updateError) return { error: updateError.message }

  revalidatePath('/settings/team')
  return { success: true, logoUrl: publicUrl }
}

export async function removeLogo(teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const service = createServiceClient()

  // Determine storage path from the current logo_url
  const { data: team } = await service
    .from('teams')
    .select('logo_url')
    .eq('id', teamId)
    .single()

  if (team?.logo_url) {
    const marker = '/object/public/team-assets/'
    const idx = team.logo_url.indexOf(marker)
    if (idx !== -1) {
      const storagePath = team.logo_url.slice(idx + marker.length)
      await service.storage.from('team-assets').remove([storagePath])
    }
  }

  const { error } = await service
    .from('teams')
    .update({ logo_url: null })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}
