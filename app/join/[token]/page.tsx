import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import SignupForm from './SignupForm'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createServiceClient()

  // Validate token and get team
  const { data: joinToken } = await supabase
    .from('team_join_tokens')
    .select('team_id, is_active')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!joinToken) notFound()

  // Get team info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, program_id')
    .eq('id', joinToken.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, season_year, school_id')
    .eq('id', team?.program_id ?? '')
    .single()

  const { data: school } = await supabase
    .from('schools')
    .select('name')
    .eq('id', program?.school_id ?? '')
    .single()

  // Get active players for dropdown
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', joinToken.team_id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  return (
    <SignupForm
      token={token}
      teamId={joinToken.team_id}
      teamName={team?.name ?? ''}
      programName={program?.name ?? ''}
      sport={program?.sport ?? ''}
      seasonYear={program?.season_year ?? ''}
      schoolName={school?.name ?? ''}
      players={players ?? []}
    />
  )
}