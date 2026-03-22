import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContactsClient from './ContactsClient'

export default async function ContactsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await supabase
    .from('team_users')
    .select('team_id, can_manage_contacts')
    .eq('user_id', user.id)
    .single()

  if (!teamUser) redirect('/dashboard')

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, program_id')
    .eq('id', teamUser.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', team?.program_id ?? '')
    .single()

  // Fetch all active contacts for this team
  const { data: contacts } = await supabase
    .from('contacts')
    .select(`
      id,
      first_name,
      last_name,
      phone,
      email,
      contact_type,
      sms_consent,
      player_id,
      created_at,
      notes
    `)
    .eq('team_id', teamUser.team_id)
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  // Fetch players for the "linked to" display and filter dropdown
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', teamUser.team_id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })

  return (
    <ContactsClient
      contacts={contacts ?? []}
      players={players ?? []}
      teamId={teamUser.team_id}
      teamName={team?.name ?? ''}
      programName={program?.name ?? ''}
      canManageContacts={teamUser.can_manage_contacts ?? false}
    />
  )
}