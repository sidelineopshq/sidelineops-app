import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-sky-400">
              SidelineOps
            </h1>
            <p className="text-sm text-slate-300">
              Beta dashboard foundation
            </p>
          </div>

          <nav className="hidden gap-6 text-sm text-slate-300 md:flex">
            <span>Dashboard</span>
            <span>Schedule</span>
            <span>Volunteers</span>
            <span>Messages</span>
            <span>Contacts</span>
          </nav>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-400">
            Team
          </p>
          <h2 className="text-3xl font-bold">James Clemens Softball</h2>
          <p className="mt-2 text-slate-300">
            This is the initial SidelineOps dashboard shell. Next, you'll build
            schedule management, notifications, and volunteer coordination.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Next Event
            </p>
            <h3 className="mt-3 text-xl font-semibold">Game vs Huntsville</h3>
            <p className="mt-2 text-slate-300">Feb 15 • 5:00 PM</p>
            <p className="text-slate-400">Arrival: 4:00 PM</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Quick Action
            </p>
            <h3 className="mt-3 text-xl font-semibold">Import Schedule</h3>
            <p className="mt-2 text-slate-300">
              Upload a DragonFly export and create events automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Volunteer Status
            </p>
            <h3 className="mt-3 text-xl font-semibold">3 Open Roles</h3>
            <p className="mt-2 text-slate-300">
              Concessions, Gate, and Scoreboard still need coverage.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Public Schedule
            </p>
            <h3 className="mt-3 text-xl font-semibold">Team Page Ready</h3>
            <p className="mt-2 text-slate-300">
              Shareable public-facing schedule page coming next.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Upcoming Work
          </p>
          <ul className="mt-4 space-y-3 text-slate-300">
            <li>• Build schedule management page</li>
            <li>• Add DragonFly import workflow</li>
            <li>• Add contact groups and messaging</li>
            <li>• Add volunteer signup tracking</li>
          </ul>
        </div>
      </section>
    </main>
  )
}
