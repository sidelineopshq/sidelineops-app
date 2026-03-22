'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function addPlayer(formData: {
  first_name: string
  last_name: string
  jersey_number?: string
  notes?: string
  team_id: string
}) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', formData.team_id)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to manage the roster.' }
  }

  if (!formData.first_name.trim() || !formData.last_name.trim()) {
    return { error: 'First and last name are required.' }
  }

  const supabase = createServiceClient()

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      team_id:        formData.team_id,
      first_name:     formData.first_name.trim(),
      last_name:      formData.last_name.trim(),
      jersey_number:  formData.jersey_number?.trim() || null,
      notes:          formData.notes?.trim() || null,
    })
    .select('id, first_name, last_name, jersey_number, is_active, notes')
    .single()

  if (error) {
    console.error('Add player error:', error)
    return { error: 'Failed to add player. Please try again.' }
  }

  return { success: true, player }
}

export async function updatePlayer(playerId: string, formData: {
  first_name: string
  last_name: string
  jersey_number?: string
  notes?: string
  team_id: string
}) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', formData.team_id)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to manage the roster.' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('players')
    .update({
      first_name:    formData.first_name.trim(),
      last_name:     formData.last_name.trim(),
      jersey_number: formData.jersey_number?.trim() || null,
      notes:         formData.notes?.trim() || null,
    })
    .eq('id', playerId)

  if (error) {
    console.error('Update player error:', error)
    return { error: 'Failed to update player.' }
  }

  return { success: true }
}

export async function deactivatePlayer(playerId: string, teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to manage the roster.' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('players')
    .update({ is_active: false })
    .eq('id', playerId)

  if (error) {
    return { error: 'Failed to remove player.' }
  }

  return { success: true }
}

export async function generateJoinToken(teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to generate join links.' }
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .rpc('generate_team_join_token', {
      p_team_id: teamId,
      p_user_id: user.id,
    })

  if (error) {
    console.error('Generate token error:', error)
    return { error: 'Failed to generate join link.' }
  }

  return { success: true, token: data as string }
}