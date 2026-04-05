import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContactsClient from './ContactsClient'
import { formatProgramLabel } from '@/lib/utils/team-label'
import QRCode from 'qrcode'

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
    .select('id, name, slug, program_id')
    .eq('id', teamUser.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, schools(name)')
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
      notes,
      email_unsubscribed
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

  // Fetch active join token for QR code
  const { data: joinTokenRow } = await supabase
    .from('team_join_tokens')
    .select('token')
    .eq('team_id', teamUser.team_id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const baseUrl = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const joinToken = joinTokenRow?.token ?? null
  const signupUrl = joinToken ? `${baseUrl}/join/${joinToken}` : null
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
      programName={formatProgramLabel((program as any)?.schools?.name ?? '', program?.sport ?? '') || program?.name || ''}
      canManageContacts={teamUser.can_manage_contacts ?? false}
      canShowSignupSection={canShowSignupSection}
      signupUrl={signupUrl}
      qrDataUrl={qrDataUrl}
    />
  )
}