import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function ConfirmedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: joinToken } = await supabase
    .from('team_join_tokens')
    .select('team_id')
    .eq('token', token)
    .single()

  if (!joinToken) notFound()

  const { data: team } = await supabase
    .from('teams')
    .select('name, program_id')
    .eq('id', joinToken.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, season_year')
    .eq('id', team?.program_id ?? '')
    .single()

  const publicScheduleUrl = `/schedule/${
    (await supabase
      .from('teams')
      .select('slug')
      .eq('id', joinToken.team_id)
      .single()
    ).data?.slug ?? ''
  }`

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">

        {/* Success icon */}
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path
              d="M7 16L13 22L25 10"
              stroke="#86efac"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">You're signed up!</h1>
        <p className="text-slate-400 text-sm mb-2">
          You're now connected to{' '}
          <span className="text-white font-semibold">{program?.name ?? team?.name}</span>.
        </p>
        <p className="text-slate-500 text-sm mb-8">
          You'll receive text messages when the coach sends schedule updates
          and important team notifications.
        </p>

        {/* What's next */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-left mb-6">
          <p className="text-sm font-bold text-white mb-3">What happens next</p>
          <ul className="space-y-2.5 text-xs text-slate-400">
            <li className="flex gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>Your contact info has been saved to the team roster</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>You'll receive SMS alerts for schedule changes and updates</span>
            </li>
            <li className="flex gap-2">
              <span className="text-sky-400 shrink-0">→</span>
              <span>Bookmark the team schedule page to check game times anytime</span>
            </li>
          </ul>
        </div>

        {/* Link to public schedule */}
        <a
          href={publicScheduleUrl}
          className="block w-full rounded-xl bg-sky-600 hover:bg-sky-500 px-6 py-3 text-sm font-semibold text-center transition-colors mb-3"
        >
          View Team Schedule
        </a>

        <p className="text-xs text-slate-600">
          Powered by{' '}
          <a href="https://sidelineopshq.com" className="text-slate-500 hover:text-slate-400">
            SidelineOps
          </a>
        </p>
      </div>
    </main>
  )
}