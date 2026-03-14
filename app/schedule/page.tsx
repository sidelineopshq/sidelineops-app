import Link from "next/link";

type EventStatus = "Scheduled" | "Cancelled" | "Rescheduled" | "Postponed";
type EventType = "Game" | "Practice" | "Scrimmage" | "Tournament";

type ScheduleEvent = {
  id: number;
  date: string;
  type: EventType;
  opponent?: string;
  location: string;
  startTime: string;
  arrivalTime?: string;
  teams: string;
  status: EventStatus;
};



const mockEvents: ScheduleEvent[] = [
  {
    id: 1,
    date: "2026-08-12",
    type: "Practice",
    location: "JC Softball Field",
    startTime: "4:00 PM",
    arrivalTime: "3:45 PM",
    teams: "Varsity + JV",
    status: "Scheduled",
  },
  {
    id: 2,
    date: "2026-08-15",
    type: "Game",
    opponent: "Huntsville",
    location: "Home",
    startTime: "5:00 PM",
    arrivalTime: "4:00 PM",
    teams: "Varsity",
    status: "Scheduled",
  },
  {
    id: 3,
    date: "2026-08-15",
    type: "Game",
    opponent: "Huntsville",
    location: "Home",
    startTime: "6:30 PM",
    arrivalTime: "5:30 PM",
    teams: "JV",
    status: "Postponed",
  },
  {
    id: 4,
    date: "2026-08-19",
    type: "Game",
    opponent: "Bob Jones",
    location: "Away",
    startTime: "5:30 PM",
    arrivalTime: "4:30 PM",
    teams: "Varsity + JV",
    status: "Rescheduled",
  },
  {
    id: 5,
    date: "2026-08-22",
    type: "Scrimmage",
    opponent: "Sparkman",
    location: "Home",
    startTime: "10:00 AM",
    arrivalTime: "9:00 AM",
    teams: "Varsity",
    status: "Cancelled",
  },
];

function formatDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getStatusClasses(status: EventStatus) {
  switch (status) {
    case "Scheduled":
      return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20";
    case "Cancelled":
      return "bg-red-500/15 text-red-300 ring-1 ring-red-400/20";
    case "Rescheduled":
      return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20";
    case "Postponed":
      return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20";
    default:
      return "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/20";
  }
}

export default function SchedulePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              SidelineOps
            </p>
            <h1 className="mt-1 text-3xl font-bold">Schedule</h1>
            <p className="mt-2 text-slate-300">
              Manage games, practices, and shared varsity/JV program events.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/schedule/new"
              className="rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              Add Event
            </Link>
            <button className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
              Import Schedule
            </button>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Total Events
            </p>
            <p className="mt-3 text-3xl font-bold">{mockEvents.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Next Event
            </p>
            <p className="mt-3 text-lg font-semibold">
              {mockEvents[0].type} • {formatDate(mockEvents[0].date)}
            </p>
            <p className="mt-1 text-slate-300">{mockEvents[0].location}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Program Coverage
            </p>
            <p className="mt-3 text-lg font-semibold">Varsity + JV</p>
            <p className="mt-1 text-slate-300">
              Shared schedule structure enabled
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-lg">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold">Upcoming Events</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-900/80">
                <tr className="border-b border-white/10 text-sm text-slate-300">
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Type</th>
                  <th className="px-5 py-4 font-semibold">Opponent / Title</th>
                  <th className="px-5 py-4 font-semibold">Location</th>
                  <th className="px-5 py-4 font-semibold">Start</th>
                  <th className="px-5 py-4 font-semibold">Arrival</th>
                  <th className="px-5 py-4 font-semibold">Teams</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {mockEvents.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-white/5 text-sm text-slate-200 transition hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      {formatDate(event.date)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">{event.type}</td>
                    <td className="px-5 py-4">
                      {event.opponent ? event.opponent : "Team Event"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {event.location}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {event.startTime}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {event.arrivalTime ?? "—"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {event.teams}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          event.status
                        )}`}
                      >
                        {event.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
                       Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}