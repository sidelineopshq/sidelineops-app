'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function setPrimaryTeam(teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Verify the user belongs to this team
  const { data: teamUser } = await authClient
    .from('team_users')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser) return { error: 'Not authorized' }

  // Get the program_id for this team
  const { data: team } = await authClient
    .from('teams')
    .select('program_id')
    .eq('id', teamId)
    .single()

  if (!team) return { error: 'Team not found' }

  const service = createServiceClient()

  // Clear primary on all teams in the program, then set on selected team
  await service
    .from('teams')
    .update({ is_primary: false })
    .eq('program_id', team.program_id)

  const { error } = await service
    .from('teams')
    .update({ is_primary: true })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/teams')
  revalidatePath('/dashboard')
  return { success: true }
}
