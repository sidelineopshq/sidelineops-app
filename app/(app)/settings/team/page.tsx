import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Team Settings' }
import { NotificationSettingsCard } from '../teams/NotificationSettingsCard'
import { AppearanceTab } from './AppearanceTab'
import { GeneralTab } from './GeneralTab'
import { TeamMembersTab, type PendingInvite, type ActiveMember } from './TeamMembersTab'
import { ManageTeamsTab } from './ManageTeamsTab'
import type { ExternalSubscriber } from './TeamMembersTab'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const TABS = [
  { id: 'general',       label: 'General'       },
  { id: 'appearance',    label: 'Appearance'    },
  { id: 'notifications', label: 'Notifications' },
  { id: 'team-members',  label: 'Team Members'  },
  { id: 'manage-teams',  label: 'Manage Teams'  },
]

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_events, can_manage_team_settings')
    .eq('user_id', user.id)

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)
  if (teamIds.length === 0) redirect('/dashboard')

  const canManage             = teamUsersRaw?.some(t => t.can_manage_events)        ?? false
  const canManageTeamSettings = teamUsersRaw?.some(t => t.can_manage_team_settings) ?? false

  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id, name, level, slug, is_primary, sort_order, program_id, notify_on_change, notify_digest_enabled, groupme_enabled, groupme_bot_id, logo_url, primary_color, secondary_color, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = teamsRaw ?? []

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, home_location_name, home_location_address')
    .eq('id', teams[0]?.program_id ?? '')
    .single()

  const { tab: tabParam } = await searchParams
  const tab = tabParam ?? 'general'

  // ── Team Members tab data ──────────────────────────────────────────────────
  let pendingInvites:       PendingInvite[]       = []
  let activeMembers:        ActiveMember[]        = []
  let externalSubscribers:  ExternalSubscriber[]  = []

  if (tab === 'team-members') {
    const svc       = serviceClient()
    const programId = teams[0]?.program_id ?? ''
    const allTeamIds = teams.map(t => t.id)

    // Pending invites: accepted_at IS NULL and not expired
    const { data: invitesRaw } = await svc
      .from('coach_invites')
      .select('id, email, role, team_ids, created_at, expires_at')
      .eq('program_id', programId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    // Build formatted team name lookup from already-fetched teams
    const inviteTeamNameById = Object.fromEntries(teams.map(t => [
      t.id,
      formatTeamShortLabel((t as any).level ?? ''),
    ]))

    pendingInvites = (invitesRaw ?? []).map(r => ({
      id:         r.id,
      email:      r.email,
      role:       r.role as 'admin' | 'coach',
      team_names: (r.team_ids ?? []).map((id: string) => inviteTeamNameById[id]).filter(Boolean),
      created_at: r.created_at,
      expires_at: r.expires_at,
    }))

    // Active members: team_users for all program teams, joined with user profiles
    const { data: teamUsersAll } = await svc
      .from('team_users')
      .select('user_id, role, team_id, can_manage_team_settings')
      .in('team_id', allTeamIds)

    const userIds = [...new Set((teamUsersAll ?? []).map(r => r.user_id))]

    const { data: usersRaw } = userIds.length > 0
      ? await svc
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', userIds)
      : { data: [] }

    // Build lookup: teamId → formatted label
    const teamNameById = Object.fromEntries(teams.map(t => [
      t.id,
      formatTeamShortLabel((t as any).level ?? ''),
    ]))

    // Group team memberships by user_id
    const memberMap = new Map<string, ActiveMember>()
    for (const tu of teamUsersAll ?? []) {
      if (!memberMap.has(tu.user_id)) {
        const u = (usersRaw ?? []).find(u => u.id === tu.user_id)
        const name = u?.first_name
          ? `${u.first_name} ${u.last_name ?? ''}`.trim()
          : ''
        memberMap.set(tu.user_id, {
          user_id:    tu.user_id,
          name,
          email:      u?.email ?? '',
          role:       tu.role,
          team_names: [],
          team_ids:   [],
        })
      }
      const m = memberMap.get(tu.user_id)!
      const teamName = teamNameById[tu.team_id]
      if (teamName && !m.team_names.includes(teamName)) {
        m.team_names.push(teamName)
      }
      if (!m.team_ids.includes(tu.team_id)) {
        m.team_ids.push(tu.team_id)
      }
    }

    activeMembers = [...memberMap.values()].sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email),
    )

    // External subscribers
    const { data: extSubsRaw } = await svc
      .from('external_subscribers')
      .select('id, name, email, type, team_id, token, opted_in_at, unsubscribed_at')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    externalSubscribers = (extSubsRaw ?? []).map((r: any) => ({
      id:              r.id,
      name:            r.name,
      email:           r.email,
      type:            r.type ?? 'other',
      team_id:         r.team_id ?? null,
      token:           r.token,
      opted_in_at:     r.opted_in_at ?? null,
      unsubscribed_at: r.unsubscribed_at ?? null,
    }))
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">

      <div className="mb-8">
        <a
          href="/dashboard"
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block"
        >
          ← Back to Dashboard
        </a>
        <h1 className="text-2xl font-bold">Team Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          {program?.name ?? 'Your Program'} · {program?.sport}
        </p>
      </div>

      {/* ── Tab navigation ────────────────────────────────────────────────────── */}
      <div className="relative mb-6">
        <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
          {TABS.map(t => (
            <a
              key={t.id}
              href={`/settings/team?tab=${t.id}`}
              className={[
                'shrink-0 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'text-white border-b-2 border-sky-500 -mb-px'
                  : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              {t.label}
            </a>
          ))}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-[#0f172a] to-transparent" />
      </div>

      {/* ── General ───────────────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <GeneralTab
          teams={teams.map(t => ({
            id:    t.id,
            name:  t.name,
            level: (t as any).level ?? null,
            slug:  t.slug ?? null,
          }))}
          programId={teams[0]?.program_id ?? ''}
          homeLocationName={program?.home_location_name ?? null}
          homeLocationAddress={program?.home_location_address ?? null}
          canManage={canManage}
        />
      )}

      {/* ── Appearance ────────────────────────────────────────────────────────── */}
      {tab === 'appearance' && (
        <AppearanceTab
          teams={teams.map(t => ({
            id:              t.id,
            name:            t.name,
            logo_url:        t.logo_url        ?? null,
            primary_color:   t.primary_color   ?? null,
            secondary_color: t.secondary_color ?? null,
          }))}
          canManage={canManage}
        />
      )}

      {/* ── Notifications ─────────────────────────────────────────────────────── */}
      {tab === 'notifications' && (
        <NotificationSettingsCard
          teams={teams.map(t => ({
            id:                    t.id,
            name:                  t.name,
            notify_on_change:      t.notify_on_change      ?? null,
            notify_digest_enabled: t.notify_digest_enabled ?? null,
            groupme_enabled:       t.groupme_enabled       ?? null,
            groupme_bot_id:        t.groupme_bot_id        ?? null,
          }))}
          canManage={canManage}
        />
      )}

      {/* ── Team Members ──────────────────────────────────────────────────────── */}
      {tab === 'team-members' && (
        <TeamMembersTab
          teams={teams.map(t => ({ id: t.id, name: t.name }))}
          pendingInvites={pendingInvites}
          activeMembers={activeMembers}
          canManage={canManage}
          currentUserId={user.id}
          canManageTeamSettings={canManageTeamSettings}
          programId={teams[0]?.program_id ?? ''}
          externalSubscribers={externalSubscribers}
        />
      )}

      {/* ── Manage Teams ──────────────────────────────────────────────────────── */}
      {tab === 'manage-teams' && (
        <ManageTeamsTab
          teams={teams.map(t => ({
            id:         t.id,
            name:       t.name,
            slug:       t.slug        ?? null,
            is_primary: t.is_primary  ?? false,
            sort_order: (t as any).sort_order ?? null,
          }))}
          programId={teams[0]?.program_id ?? ''}
          canManage={canManage}
          canManageTeamSettings={canManageTeamSettings}
        />
      )}


      {/* ── Volunteer settings moved notice ──────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Volunteer settings have moved.</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Roles, templates, and standing volunteers are now managed in Volunteer Settings.
          </p>
        </div>
        <a
          href="/volunteers/settings"
          className="shrink-0 rounded-xl border border-white/20 hover:border-sky-500/40 hover:bg-sky-500/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap"
        >
          Go to Volunteer Settings →
        </a>
      </div>

    </section>
  )
}
