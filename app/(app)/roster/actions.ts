'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

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
      first_name:    formData.first_name.trim(),
      last_name:     formData.last_name.trim(),
      jersey_number: formData.jersey_number?.trim() || null,
      notes:         formData.notes?.trim() || null,
    })
    .select('id, first_name, last_name, jersey_number, is_active, notes')
    .single()

  if (error || !player) {
    console.error('Add player error:', error)
    return { error: 'Failed to add player. Please try again.' }
  }

  // Assign player to the selected team in the junction table
  const { error: ptError } = await supabase
    .from('player_teams')
    .insert({ player_id: player.id, team_id: formData.team_id, is_call_up: false })

  if (ptError) {
    console.error('Add player_teams error:', ptError)
    // Clean up the orphaned player row so the roster stays consistent
    await supabase.from('players').delete().eq('id', player.id)
    return { error: 'Failed to assign player to team. Please try again.' }
  }

  return {
    success: true,
    player: {
      ...player,
      primary_team_id: formData.team_id,
      team_assignments: [{ team_id: formData.team_id, is_call_up: false }],
    },
  }
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

// Changes a player's primary team. Clears call-up status for the new team if present.
export async function setPlayerPrimaryTeam(playerId: string, newTeamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', newTeamId)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to manage the roster.' }
  }

  const supabase = createServiceClient()

  // Remove old primary row (is_call_up = false) and any existing row for new team
  await supabase.from('player_teams').delete()
    .eq('player_id', playerId).eq('is_call_up', false)
  await supabase.from('player_teams').delete()
    .eq('player_id', playerId).eq('team_id', newTeamId)

  // Insert new primary row
  await supabase.from('player_teams')
    .insert({ player_id: playerId, team_id: newTeamId, is_call_up: false })

  return { success: true }
}

// Adds or removes a call-up assignment for a player to a second team.
export async function setCallUp(playerId: string, callUpTeamId: string, enabled: boolean) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts')
    .eq('user_id', user.id)
    .eq('team_id', callUpTeamId)
    .single()

  if (!teamUser?.can_manage_contacts) {
    return { error: 'You do not have permission to manage this team\'s roster.' }
  }

  const supabase = createServiceClient()

  if (enabled) {
    const { error } = await supabase
      .from('player_teams')
      .upsert(
        { player_id: playerId, team_id: callUpTeamId, is_call_up: true },
        { onConflict: 'player_id,team_id' }
      )
    if (error) {
      console.error('setCallUp insert error:', error)
      return { error: 'Failed to add call-up.' }
    }
  } else {
    const { error } = await supabase
      .from('player_teams')
      .delete()
      .eq('player_id', playerId)
      .eq('team_id', callUpTeamId)
    if (error) {
      console.error('setCallUp delete error:', error)
      return { error: 'Failed to remove call-up.' }
    }
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

  // Clean up all team assignments
  await supabase.from('player_teams').delete().eq('player_id', playerId)

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
