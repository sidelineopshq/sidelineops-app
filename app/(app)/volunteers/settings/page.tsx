import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { VolunteerRolesTab, type VolunteerRole, type StandingAssignment, type TabContact, type TemplateSlot } from '@/app/(app)/settings/team/VolunteerRolesTab'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function VolunteerSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Access control: must have can_manage_volunteers OR role = 'admin'
  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_volunteers, can_manage_events')
    .eq('user_id', user.id)

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)
  if (teamIds.length === 0) redirect('/dashboard')

  const canManageVolunteers = teamUsersRaw?.some(t => t.can_manage_volunteers) ?? false
  const isAdmin             = teamUsersRaw?.some(t => t.role === 'admin')      ?? false

  if (!canManageVolunteers && !isAdmin) redirect('/dashboard')

  // Fetch teams + program
  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id, name, level, is_primary, program_id, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name',       { ascending: true  })

  const teams     = teamsRaw ?? []
  const programId = teams[0]?.program_id ?? ''

  if (!programId) redirect('/dashboard')

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', programId)
    .single()

  const primaryTeam   = teams[0]
  const levelLabel    = formatTeamShortLabel((primaryTeam as any)?.level ?? '')
  const allTeamIds    = teams.map(t => t.id)
  const canManage     = teamUsersRaw?.some(t => t.can_manage_volunteers || t.role === 'admin') ?? false

  const svc = serviceClient()

  // Fetch all four data sets in parallel
  const [rolesResult, standingResult, contactsResult, templateResult] = await Promise.all([
    svc
      .from('volunteer_roles')
      .select('id, name, description, is_active, suppress_reminders')
      .eq('program_id', programId)
      .order('created_at', { ascending: true }),
    svc
      .from('volunteer_standing_assignments')
      .select(`
        id, volunteer_role_id, contact_id, volunteer_name, volunteer_email,
        volunteer_roles!volunteer_role_id(name),
        contacts(first_name, last_name, email)
      `)
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    allTeamIds.length > 0
      ? svc
          .from('contacts')
          .select('id, first_name, last_name, email')
          .in('team_id', allTeamIds)
          .is('deleted_at', null)
          .order('last_name',  { ascending: true })
          .order('first_name', { ascending: true })
      : Promise.resolve({ data: [] }),
    svc
      .from('volunteer_slot_templates')
      .select('id, volunteer_role_id, slot_count, start_time, end_time, notes, volunteer_roles!volunteer_role_id(name)')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ])

  const volunteerRoles: VolunteerRole[] = (rolesResult.data ?? []) as VolunteerRole[]

  const standingAssignments: StandingAssignment[] = (standingResult.data ?? []).map((row: any) => {
    const contact = row.contacts as any
    return {
      id:                row.id,
      volunteer_role_id: row.volunteer_role_id,
      role_name:         (row.volunteer_roles as any)?.name ?? '',
      contact_id:    row.contact_id,
      display_name:  row.volunteer_name ?? (contact ? `${contact.first_name} ${contact.last_name ?? ''}`.trim() : ''),
      display_email: row.volunteer_email ?? contact?.email ?? null,
    } satisfies StandingAssignment
  })

  const tabContacts: TabContact[] = (contactsResult.data ?? []).map((c: any) => ({
    id:         c.id,
    first_name: c.first_name,
    last_name:  c.last_name ?? null,
    email:      c.email     ?? null,
  }))

  const templateSlots: TemplateSlot[] = (templateResult.data ?? []).map((t: any) => ({
    id:                t.id,
    volunteer_role_id: t.volunteer_role_id,
    role_name:         (t.volunteer_roles as any)?.name ?? 'Unknown',
    slot_count: t.slot_count,
    start_time: t.start_time ?? null,
    end_time:   t.end_time   ?? null,
    notes:      t.notes      ?? null,
  }))

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">

      {/* Page header */}
      <div className="mb-8">
        <a
          href="/volunteers"
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block"
        >
          ← Volunteer Management
        </a>
        <h1 className="text-2xl font-bold">Volunteer Settings</h1>
        {levelLabel && (
          <p className="text-slate-400 text-sm mt-1">{levelLabel}</p>
        )}
      </div>

      <VolunteerRolesTab
        programId={programId}
        roles={volunteerRoles}
        standingAssignments={standingAssignments}
        contacts={tabContacts}
        canManage={canManage}
        templateSlots={templateSlots}
      />

    </section>
  )
}
