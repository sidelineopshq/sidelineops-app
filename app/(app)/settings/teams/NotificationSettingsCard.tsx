'use client'

import { useState, useRef } from 'react'
import { updateNotificationSetting, saveGroupMeBotId } from './actions'

type TeamSetting = {
  id:                    string
  name:                  string
  notify_on_change:      boolean | null
  notify_digest_enabled: boolean | null
  groupme_enabled:       boolean | null
  groupme_bot_id:        string | null
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

// ── Per-team state ────────────────────────────────────────────────────────────

type TeamState = {
  notify_on_change:      boolean
  notify_digest_enabled: boolean
  groupme_enabled:       boolean
  groupme_bot_id:        string
}

// ── Main card ────────────────────────────────────────────────────────────────

export function NotificationSettingsCard({
  teams,
  canManage,
}: {
  teams:     TeamSetting[]
  canManage: boolean
}) {
  const [settings, setSettings] = useState<Record<string, TeamState>>(() =>
    Object.fromEntries(
      teams.map(t => [
        t.id,
        {
          notify_on_change:      t.notify_on_change      ?? true,
          notify_digest_enabled: t.notify_digest_enabled ?? false,
          groupme_enabled:       t.groupme_enabled       ?? false,
          groupme_bot_id:        t.groupme_bot_id        ?? '',
        },
      ])
    )
  )

  // tracks which field just saved per team: teamId → field key | null
  const [saved, setSaved] = useState<Record<string, string | null>>({})
  const [botIdSaving, setBotIdSaving] = useState<Record<string, boolean>>({})

  // refs for bot ID inputs (one per team)
  const botIdRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function flashSaved(teamId: string, field: string) {
    setSaved(prev => ({ ...prev, [teamId]: field }))
    setTimeout(() => setSaved(prev => ({ ...prev, [teamId]: null })), 2000)
  }

  async function handleToggle(
    teamId: string,
    field:  'notify_on_change' | 'notify_digest_enabled' | 'groupme_enabled',
    value:  boolean,
  ) {
    setSettings(prev => ({
      ...prev,
      [teamId]: { ...prev[teamId], [field]: value },
    }))

    const result = await updateNotificationSetting(teamId, field, value)

    if (result?.error) {
      setSettings(prev => ({
        ...prev,
        [teamId]: { ...prev[teamId], [field]: !value },
      }))
    } else {
      flashSaved(teamId, field)
    }
  }

  async function handleBotIdSave(teamId: string) {
    const botId = settings[teamId].groupme_bot_id.trim()
    setBotIdSaving(prev => ({ ...prev, [teamId]: true }))
    const result = await saveGroupMeBotId(teamId, botId)
    setBotIdSaving(prev => ({ ...prev, [teamId]: false }))
    if (!result?.error) flashSaved(teamId, 'groupme_bot_id')
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

                {/* ── GroupMe Integration ──────────────────────────────────── */}
                <div className="pt-4 border-t border-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">
                    GroupMe Integration
                  </p>

                  {/* Enable toggle */}
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">Enable GroupMe notifications</p>
                      <p className="text-xs text-slate-400 mt-0.5 max-w-sm leading-relaxed">
                        Post change alerts to a GroupMe group via a bot
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {saving === 'groupme_enabled' && (
                        <span className="text-xs text-green-400 font-medium">Saved</span>
                      )}
                      <Toggle
                        checked={s.groupme_enabled}
                        disabled={!canManage}
                        onChange={v => handleToggle(team.id, 'groupme_enabled', v)}
                      />
                    </div>
                  </div>

                  {/* Bot ID input — only shown when enabled */}
                  {s.groupme_enabled && (
                    <div className="mt-4 space-y-2">
                      <label className="block text-xs font-medium text-slate-300">
                        Bot ID
                      </label>
                      <div className="flex gap-2">
                        <input
                          ref={el => { botIdRefs.current[team.id] = el }}
                          type="text"
                          disabled={!canManage}
                          value={s.groupme_bot_id}
                          placeholder="Paste your GroupMe bot ID here"
                          onChange={e =>
                            setSettings(prev => ({
                              ...prev,
                              [team.id]: { ...prev[team.id], groupme_bot_id: e.target.value },
                            }))
                          }
                          onBlur={() => handleBotIdSave(team.id)}
                          className={[
                            'flex-1 rounded-lg border bg-slate-800 px-3 py-2 text-sm text-white',
                            'placeholder:text-slate-600',
                            'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 focus:ring-offset-slate-900',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            'border-white/10',
                          ].join(' ')}
                        />
                        {canManage && (
                          <button
                            type="button"
                            disabled={botIdSaving[team.id]}
                            onClick={() => handleBotIdSave(team.id)}
                            className={[
                              'shrink-0 rounded-lg border border-white/10 bg-slate-800',
                              'hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-300',
                              'hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                            ].join(' ')}
                          >
                            {botIdSaving[team.id] ? 'Saving…' : 'Save'}
                          </button>
                        )}
                      </div>

                      {/* Helper text */}
                      <p className="text-xs text-slate-500">
                        Create a bot at{' '}
                        <a
                          href="https://dev.groupme.com/bots"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-500 hover:text-sky-400 underline"
                        >
                          dev.groupme.com
                        </a>{' '}
                        and paste the bot_id here
                      </p>

                      {/* Warning: enabled but no bot ID */}
                      {!s.groupme_bot_id.trim() && (
                        <p className="text-xs text-amber-400 flex items-center gap-1.5">
                          <span aria-hidden>⚠</span>
                          Enter a Bot ID to enable GroupMe notifications
                        </p>
                      )}

                      {/* Save confirmation */}
                      {saving === 'groupme_bot_id' && (
                        <p className="text-xs text-green-400 font-medium">Saved</p>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
