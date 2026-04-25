import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamPlayerCount = {
  base_count:    number  // regular (non-call-up) members of this team
  called_up_in:  number  // external players called up TO this team
  called_up_out: number  // this team's players called up to another team
  total:         number  // base_count + called_up_in - called_up_out
}

export async function getTeamPlayerCount(
  teamId: string,
  svc: SupabaseClient,
): Promise<TeamPlayerCount> {
  // 1. Regular players on this team (non-call-up rows)
  const { count: regularCount } = await svc
    .from('player_teams')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('is_call_up', false)

  // 2. Call-ups TO this team (from another team)
  const { count: callUpsIn } = await svc
    .from('player_teams')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('is_call_up', true)

  // 3. Players from this team called up elsewhere
  const { data: regularPlayers } = await svc
    .from('player_teams')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('is_call_up', false)

  const playerIds = (regularPlayers ?? []).map(p => p.player_id)

  let callUpsOut = 0
  if (playerIds.length > 0) {
    const { count } = await svc
      .from('player_teams')
      .select('*', { count: 'exact', head: true })
      .in('player_id', playerIds)
      .neq('team_id', teamId)
      .eq('is_call_up', true)
    callUpsOut = count ?? 0
  }

  const base = regularCount ?? 0
  return {
    base_count:    base,
    called_up_in:  callUpsIn  ?? 0,
    called_up_out: callUpsOut,
    total:         base + (callUpsIn ?? 0) - callUpsOut,
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
