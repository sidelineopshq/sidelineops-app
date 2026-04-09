import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import JoinProgramClient from './JoinProgramClient'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function JoinProgramPage({
  params,
  searchParams,
}: {
  params:       Promise<{ programSlug: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { programSlug }  = await params
  const { t: tokenParam } = await searchParams
  const supabase          = svc()

  // Validate program and token
  const { data: program } = await supabase
    .from('programs')
    .select('id, name, sport, join_token, join_token_enabled, schools(name)')
    .eq('slug', programSlug)
    .maybeSingle()

  if (!program) notFound()

  const isValid =
    program.join_token_enabled &&
    program.join_token &&
    tokenParam &&
    program.join_token === tokenParam

  if (!isValid) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-xl font-bold text-white mb-2">Invalid or expired signup link</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            This signup link is no longer active. Contact your coach for an updated link.
          </p>
        </div>
      </div>
    )
  }

  const schoolName         = (program as any).schools?.name ?? ''
  const programDisplayName = formatProgramLabel(schoolName, program.sport) || program.name

  // Fetch active teams for this program
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, level, slug, primary_color')
    .eq('program_id', program.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const teamIds = (teams ?? []).map(t => t.id)

  // Fetch all active players across all program teams via player_teams junction
  const { data: ptRows } = teamIds.length > 0
    ? await supabase
        .from('player_teams')
        .select('player_id, team_id')
        .in('team_id', teamIds)
    : { data: [] as any[] }

  const playerIds = [...new Set((ptRows ?? []).map((r: any) => r.player_id as string))]

  console.log('[JOIN] Program id:', program.id)
  console.log('[JOIN] Team IDs:', teamIds)
  console.log('[JOIN] Player IDs from player_teams:', playerIds.length)

  const { data: playerRows, error: playersError } = playerIds.length > 0
    ? await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .in('id', playerIds)
        .eq('is_active', true)
        .order('last_name',  { ascending: true })
        .order('first_name', { ascending: true })
    : { data: [] as any[], error: null }

  console.log('[JOIN] Players found:', playerRows?.length)
  console.log('[JOIN] Players error:', playersError)

  const brandPrimary = (teams?.[0] as any)?.primary_color ?? null
  const firstTeamSlug = (teams?.[0] as any)?.slug ?? null

  // Build lookup maps for team info
  const teamMap = new Map((teams ?? []).map(t => [t.id, t]))
  const playerTeamMap: Record<string, string> = {}
  for (const row of ptRows ?? []) {
    if (!playerTeamMap[(row as any).player_id]) {
      playerTeamMap[(row as any).player_id] = (row as any).team_id
    }
  }

  return (
    <JoinProgramClient
      programId={program.id}
      programName={programDisplayName}
      sport={program.sport ?? ''}
      schoolName={schoolName}
      firstTeamSlug={firstTeamSlug}
      brandPrimary={brandPrimary}
      players={(playerRows ?? []).map((p: any) => {
        const tid = playerTeamMap[p.id] ?? ''
        const t = teamMap.get(tid)
        return {
          id:             p.id,
          first_name:     p.first_name,
          last_name:      p.last_name,
          jersey_number:  p.jersey_number ?? null,
          team_id:        tid,
          team_level:     formatTeamShortLabel((t as any)?.level ?? '') || (t as any)?.name || '',
        }
      })}
    />
  )
}
