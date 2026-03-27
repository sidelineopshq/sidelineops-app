import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { setPrimaryTeam } from './actions'
import { NotificationSettingsCard } from './NotificationSettingsCard'

export default async function TeamSettingsPage() {
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
    .select('id, name, slug, is_primary, program_id, notify_on_change, notify_digest_enabled, groupme_enabled, groupme_bot_id')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = teamsRaw ?? []

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', teams[0]?.program_id ?? '')
    .single()

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

    </section>
  )
}
