'use client'

import { useState } from 'react'
import { updateNotificationSetting } from './actions'

type TeamSetting = {
  id:                    string
  name:                  string
  notify_on_change:      boolean | null
  notify_digest_enabled: boolean | null
}

// ── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked:  boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
        'transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        checked ? 'bg-sky-500' : 'bg-slate-700',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

// ── Main card ────────────────────────────────────────────────────────────────

export function NotificationSettingsCard({
  teams,
  canManage,
}: {
  teams:      TeamSetting[]
  canManage:  boolean
}) {
  const [settings, setSettings] = useState(() =>
    Object.fromEntries(
      teams.map(t => [
        t.id,
        {
          notify_on_change:      t.notify_on_change      ?? true,
          notify_digest_enabled: t.notify_digest_enabled ?? false,
        },
      ])
    )
  )

  // tracks which field just saved per team: teamId → field key | null
  const [saved, setSaved] = useState<Record<string, string | null>>({})

  async function handleToggle(
    teamId: string,
    field:  'notify_on_change' | 'notify_digest_enabled',
    value:  boolean,
  ) {
    // Optimistic update
    setSettings(prev => ({
      ...prev,
      [teamId]: { ...prev[teamId], [field]: value },
    }))

    const result = await updateNotificationSetting(teamId, field, value)

    if (result?.error) {
      // Revert on failure
      setSettings(prev => ({
        ...prev,
        [teamId]: { ...prev[teamId], [field]: !value },
      }))
    } else {
      setSaved(prev => ({ ...prev, [teamId]: field }))
      setTimeout(
        () => setSaved(prev => ({ ...prev, [teamId]: null })),
        2000,
      )
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mt-6">

      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
          Notification Settings
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          Control how and when contacts receive automated notifications.
        </p>
      </div>

      <div className="divide-y divide-white/5">
        {teams.map(team => {
          const s      = settings[team.id]
          const saving = saved[team.id]

          return (
            <div key={team.id} className="px-6 py-5">
              {teams.length > 1 && (
                <p className="text-sm font-semibold text-white mb-4">{team.name}</p>
              )}

              <div className="space-y-5">

                {/* Change Alerts */}
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Change Alerts</p>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-sm leading-relaxed">
                      Automatically notify contacts when game or practice details change within 24 hours of the event
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {saving === 'notify_on_change' && (
                      <span className="text-xs text-green-400 font-medium">Saved</span>
                    )}
                    <Toggle
                      checked={s.notify_on_change}
                      disabled={!canManage}
                      onChange={v => handleToggle(team.id, 'notify_on_change', v)}
                    />
                  </div>
                </div>

                {/* Weekly Digest */}
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Weekly Digest</p>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-sm leading-relaxed">
                      Send a weekly schedule summary to all contacts every Sunday at 4:00 PM
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {saving === 'notify_digest_enabled' && (
                      <span className="text-xs text-green-400 font-medium">Saved</span>
                    )}
                    <Toggle
                      checked={s.notify_digest_enabled}
                      disabled={!canManage}
                      onChange={v => handleToggle(team.id, 'notify_digest_enabled', v)}
                    />
                  </div>
                </div>

              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
