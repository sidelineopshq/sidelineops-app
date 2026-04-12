import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContactsClient from './ContactsClient'
import { formatProgramLabel } from '@/lib/utils/team-label'
import QRCode from 'qrcode'
import { getBaseUrl } from '@/lib/utils/base-url'

export const metadata = { title: 'Contacts' }

export default async function ContactsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_contacts')
    .eq('user_id', user.id)

  const teamUser = teamUsersRaw?.[0]
  if (!teamUser) redirect('/dashboard')

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, program_id, primary_color')
    .eq('id', teamUser.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('id, name, sport, slug, join_token, join_token_enabled, schools(name)')
    .eq('id', team?.program_id ?? '')
    .single()

  // Fetch contact_teams to include program-join contacts (team_id = null)
  console.log('[CONTACTS] Fetching for team:', teamUser.team_id)
  console.log('[CONTACTS] Program id:', (program as any)?.id)
  const { data: ctRows } = await supabase
    .from('contact_teams')
    .select('contact_id')
    .eq('team_id', teamUser.team_id)
  const ctContactIds = (ctRows ?? []).map((r: any) => r.contact_id)
  console.log('[CONTACTS] contact_teams rows found:', ctRows?.length ?? 0)

  // Fetch all active contacts for this team (legacy team_id + program-join via contact_teams)
  const contactsBuilder = supabase
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
      notes,
      email_unsubscribed
    `)
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  const { data: contacts } = ctContactIds.length > 0
    ? await contactsBuilder.or(`team_id.eq.${teamUser.team_id},id.in.(${ctContactIds.join(',')})`)
    : await contactsBuilder.eq('team_id', teamUser.team_id)
  console.log('[CONTACTS] Raw results count:', contacts?.length)
  console.log('[CONTACTS] First contact:', JSON.stringify(contacts?.[0]))

  // Fetch players for the "linked to" display and filter dropdown
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', teamUser.team_id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })

  const baseUrl = getBaseUrl()
  const joinToken = (program as any)?.join_token_enabled && (program as any)?.join_token
    ? (program as any).join_token
    : null
  const programSlug = (program as any)?.slug ?? null
  const signupUrl = (joinToken && programSlug)
    ? `${baseUrl}/join/${programSlug}?t=${joinToken}`
    : null
  const qrDataUrl = signupUrl
    ? await QRCode.toDataURL(signupUrl, {
        width: 160,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
    : null

  const role = teamUser.role as string
  const canShowSignupSection =
    (teamUser.can_manage_contacts ?? false) ||
    role === 'admin' ||
    role === 'coach'

  return (
    <ContactsClient
      contacts={contacts ?? []}
      players={players ?? []}
      teamId={teamUser.team_id}
      teamName={team?.name ?? ''}
      teamSlug={team?.slug ?? ''}
      programId={(program as any)?.id ?? ''}
      programSlug={programSlug}
      programName={formatProgramLabel((program as any)?.schools?.name ?? '', program?.sport ?? '') || program?.name || ''}
      canManageContacts={teamUser.can_manage_contacts ?? false}
      canShowSignupSection={canShowSignupSection}
      signupUrl={signupUrl}
      qrDataUrl={qrDataUrl}
      brandPrimary={(team as any)?.primary_color ?? null}
    />
  )
}