import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamPlayerCount = {
  base_count:    number
  called_up_in:  number   // external players called up TO this team
  called_up_out: number   // this team's players called up to another team
  total:         number   // base_count + called_up_in - called_up_out
}

export async function getTeamPlayerCount(
  teamId: string,
  svc: SupabaseClient,
): Promise<TeamPlayerCount> {
  // 1. Base roster: active players whose primary team is this team
  const { count: base_count } = await svc
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('is_active', true)

  // 2. All call-up assignments targeting this team
  const { data: callUpRows } = await svc
    .from('player_teams')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('is_call_up', true)

  const callUpIds = (callUpRows ?? []).map(r => r.player_id)

  // 3. Among those call-ups, how many are from external teams (called_up_in)
  let called_up_in = 0
  if (callUpIds.length > 0) {
    const { count } = await svc
      .from('players')
      .select('*', { count: 'exact', head: true })
      .in('id', callUpIds)
      .neq('team_id', teamId)
    called_up_in = count ?? 0
  }

  // 4. This team's players called up to another team (called_up_out)
  const { data: basePlayerRows } = await svc
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .eq('is_active', true)

  const baseIds = (basePlayerRows ?? []).map(r => r.id)

  let called_up_out = 0
  if (baseIds.length > 0) {
    const { count } = await svc
      .from('player_teams')
      .select('*', { count: 'exact', head: true })
      .in('player_id', baseIds)
      .neq('team_id', teamId)
      .eq('is_call_up', true)
    called_up_out = count ?? 0
  }

  const base = base_count ?? 0
  return {
    base_count:    base,
    called_up_in,
    called_up_out,
    total:         base + called_up_in - called_up_out,
  }
}

/** Fetch player counts for multiple teams in parallel. Returns a map keyed by teamId. */
export async function getTeamPlayerCounts(
  teamIds: string[],
  svc: SupabaseClient,
): Promise<Record<string, TeamPlayerCount>> {
  if (teamIds.length === 0) return {}
  const results = await Promise.all(
    teamIds.map(id => getTeamPlayerCount(id, svc).then(count => ({ id, count }))),
  )
  return Object.fromEntries(results.map(r => [r.id, r.count]))
}
