import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { setPrimaryTeam } from '../teams/actions'
import { NotificationSettingsCard } from '../teams/NotificationSettingsCard'
import { AppearanceTab } from './AppearanceTab'
import { TeamMembersTab, type PendingInvite, type ActiveMember } from './TeamMembersTab'

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
  searchParams: { tab?: string }
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_events')
    .eq('user_id', user.id)

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)
  if (teamIds.length === 0) redirect('/dashboard')

  const canManage = teamUsersRaw?.some(t => t.can_manage_events) ?? false

  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id, name, slug, is_primary, program_id, notify_on_change, notify_digest_enabled, groupme_enabled, groupme_bot_id, logo_url, primary_color, secondary_color')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = teamsRaw ?? []

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', teams[0]?.program_id ?? '')
    .single()

  const tab = searchParams.tab ?? 'general'

  // ── Team Members tab data ──────────────────────────────────────────────────
  let pendingInvites: PendingInvite[] = []
  let activeMembers:  ActiveMember[]  = []

  if (tab === 'team-members') {
    const svc       = serviceClient()
    const programId = teams[0]?.program_id ?? ''
    const allTeamIds = teams.map(t => t.id)

    // Pending invites: accepted_at IS NULL and not expired
    const { data: invitesRaw } = await svc
      .from('coach_invites')
      .select('id, email, role, team_names, created_at, expires_at')
      .eq('program_id', programId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    pendingInvites = (invitesRaw ?? []).map(r => ({
      id:         r.id,
      email:      r.email,
      role:       r.role as 'admin' | 'coach',
      team_names: r.team_names ?? [],
      created_at: r.created_at,
      expires_at: r.expires_at,
    }))

    // Active members: team_users for all program teams, joined with user profiles
    const { data: teamUsersAll } = await svc
      .from('team_users')
      .select('user_id, role, team_id')
      .in('team_id', allTeamIds)

    const userIds = [...new Set((teamUsersAll ?? []).map(r => r.user_id))]

    const { data: usersRaw } = userIds.length > 0
      ? await svc
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', userIds)
      : { data: [] }

    // Build lookup: teamId → name
    const teamNameById = Object.fromEntries(teams.map(t => [t.id, t.name]))

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
        })
      }
      const m = memberMap.get(tu.user_id)!
      const teamName = teamNameById[tu.team_id]
      if (teamName && !m.team_names.includes(teamName)) {
        m.team_names.push(teamName)
      }
    }

    activeMembers = [...memberMap.values()].sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email),
    )
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
      <div className="flex gap-1 border-b border-white/10 mb-6 overflow-x-auto">
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

      {/* ── General ───────────────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">General</h2>
            <p className="text-slate-400 text-xs mt-1">Basic team configuration.</p>
          </div>
          <div className="px-6 py-10 text-center text-slate-500 text-sm">Coming soon</div>
        </div>
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
        />
      )}

      {/* ── Manage Teams ──────────────────────────────────────────────────────── */}
      {tab === 'manage-teams' && (
        <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Primary Team
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              The primary team&apos;s start time is used as the default display time on the public schedule.
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {teams.map(team => (
              <div key={team.id} className="flex items-center justify-between px-6 py-4 gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white">{team.name}</p>
                  {team.slug && (
                    <p className="text-xs text-slate-500 mt-0.5">/schedule/{team.slug}</p>
                  )}
                </div>
                {team.is_primary ? (
                  <span className="shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
                    Primary Team
                  </span>
                ) : canManage ? (
                  <form
                    action={async () => {
                      'use server'
                      await setPrimaryTeam(team.id)
                    }}
                  >
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                      Set as Primary
                    </button>
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-slate-600">Not primary</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </section>
  )
}
