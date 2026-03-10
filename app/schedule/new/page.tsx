"use client";

import Link from "next/link";
import { useState } from "react";

type EventType = "Game" | "Practice" | "Scrimmage" | "Tournament";
type EventStatus = "Scheduled" | "Postponed" | "Cancelled" | "Rescheduled";
type NotificationGroup = "Parents" | "Players" | "Officials" | "Volunteers";

type EventFormData = {
  eventType: EventType;
  opponent: string;
  location: string;
  date: string;
  startTime: string;
  arrivalTime: string;
  teams: string;
  status: EventStatus;
  uniformNotes: string;
  notes: string;
  notifications: NotificationGroup[];
  sendNotifications: boolean;
};

const initialFormData: EventFormData = {
  eventType: "Game",
  opponent: "",
  location: "",
  date: "",
  startTime: "",
  arrivalTime: "",
  teams: "Varsity",
  status: "Scheduled",
  uniformNotes: "",
  notes: "",
  notifications: ["Parents", "Players"],
  sendNotifications: true,
};

export default function NewEventPage() {
  const [formData, setFormData] = useState<EventFormData>(initialFormData);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleNotificationChange(group: NotificationGroup) {
    setFormData((prev) => {
        const alreadySelected = prev.notifications.includes(group);

        return {
        ...prev,
        notifications: alreadySelected
            ? prev.notifications.filter((item) => item !== group)
            : [...prev.notifications, group],
        };
    })        ;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    console.log("New event submitted:", formData);

    if(formData.sendNotifications) {
        console.log("Send notifications to:", formData.notifications);
    }

    alert("Event saved.");

    setFormData(initialFormData);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              SidelineOps
            </p>
            <h1 className="mt-1 text-3xl font-bold">Add Event</h1>
            <p className="mt-2 text-slate-300">
              Create a new game, practice, or shared program event.
            </p>
          </div>

          <Link
            href="/schedule"
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Back to Schedule
          </Link>
        </div>
      </div>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Event Type
              </label>
              <select
                name="eventType"
                value={formData.eventType}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
              >
                <option>Game</option>
                <option>Practice</option>
                <option>Scrimmage</option>
                <option>Tournament</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Opponent
              </label>
              <input
                type="text"
                name="opponent"
                value={formData.opponent}
                onChange={handleChange}
                placeholder="Huntsville"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Location
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="JC Softball Field"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Date
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Start Time
              </label>
              <input
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Arrival Time
              </label>
              <input
                type="time"
                name="arrivalTime"
                value={formData.arrivalTime}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Teams
              </label>
              <select
                name="teams"
                value={formData.teams}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
              >
                <option>Varsity</option>
                <option>JV</option>
                <option>Varsity + JV</option>                
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400"
              >
                <option>Scheduled</option>
                <option>Postponed</option>
                <option>Cancelled</option>
                <option>Rescheduled</option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Uniform
            </label>
            <textarea
              name="uniformNotes"
              value={formData.uniformNotes}
              onChange={handleChange}
              rows={2}
              placeholder="Uniform notes..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
            />
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={5}
              placeholder="Weather notes, event details..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
            />
          </div>

          <div className="mt-6">
            <label className="mb-3 block text-sm font-medium text-slate-200">
                Notify Groups
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
                {(["Parents", "Players", "Officials", "Volunteers"] as NotificationGroup[]).map(
                (group) => (
                    <label
                    key={group}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                    >
                    <input
                        type="checkbox"
                        checked={formData.notifications.includes(group)}
                        onChange={() => handleNotificationChange(group)}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-sky-400 focus:ring-sky-400"
                    />
                    <span>{group}</span>
                    </label>
                )
                )}
            </div>
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-3 text-sm text-slate-200">
                <input
                type="checkbox"
                checked={formData.sendNotifications}
                onChange={(e) =>
                    setFormData((prev) => ({
                    ...prev,
                    sendNotifications: e.target.checked
                    }))
                }
                className="h-4 w-4 rounded border-white/20 bg-slate-900 text-sky-400"
                />

                Send notifications immediately after saving
            </label>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              Save Event
            </button>

            <Link
              href="/schedule"
              className="rounded-xl border border-white/10 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}