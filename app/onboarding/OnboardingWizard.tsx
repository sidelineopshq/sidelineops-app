'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProgramAndTeam } from '@/app/actions/onboarding'
import { LEVELS, formatProgramLabel, formatSchoolName } from '@/lib/utils/team-label'

// ── Constants ──────────────────────────────────────────────────────────────────

const SPORTS = [
  'Softball', 'Baseball', 'Basketball', 'Football', 'Soccer',
  'Volleyball', 'Track & Field', 'Swimming', 'Tennis',
  'Cross Country', 'Golf', 'Wrestling', 'Lacrosse',
  'Cheerleading', 'Dance', 'Other',
]

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],
  ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],
  ['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
  ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
  ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
  ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
  ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],
  ['WI','Wisconsin'],['WY','Wyoming'],
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(val: string) {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const router = useRouter()

  const [step, setStep] = useState(1)

  // ── Form state ─────────────────────────────────────────────────────────────
  const [schoolName, setSchoolName] = useState('')
  const [city,       setCity]       = useState('')
  const [state,      setState]      = useState('')
  const [sport,      setSport]      = useState('')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [level,      setLevel]      = useState('Varsity')
  const [teamSlug,   setTeamSlug]   = useState('')
  const [teamSlugTouched, setTeamSlugTouched] = useState(false)

  const [step1Error,   setStep1Error]  = useState<string | null>(null)
  const [step2Error,   setStep2Error]  = useState<string | null>(null)
  const [submitError,  setSubmitError] = useState<string | null>(null)
  const [isSubmitting, startSubmit]   = useTransition()

  // ── Derived program label ──────────────────────────────────────────────────
  const programLabel = schoolName && sport
    ? formatProgramLabel(schoolName, sport)
    : ''

  // ── Auto-generate slug from program label + level ──────────────────────────
  useEffect(() => {
    if (!teamSlugTouched && programLabel && level) {
      setTeamSlug(slugify(`${programLabel} ${level}`))
    }
  }, [programLabel, level, teamSlugTouched])

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goToStep2() {
    if (!schoolName.trim()) { setStep1Error('School name is required.'); return }
    if (!city.trim())       { setStep1Error('City is required.'); return }
    if (!state)             { setStep1Error('Please select a state.'); return }
    setStep1Error(null)
    setStep(2)
  }

  function goToStep3() {
    if (!sport) { setStep2Error('Please select a program.'); return }
    setStep2Error(null)
    setStep(3)
  }

  function handleSubmit() {
    setSubmitError(null)
    startSubmit(async () => {
      const result = await createProgramAndTeam({
        schoolName, city, state, sport, seasonYear,
        level, teamSlug,
      })
      if (result?.error) {
        setSubmitError(result.error)
        return
      }
      setStep(4)
    })
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"

  const btnPrimary   = "w-full rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
  const btnSecondary = "w-full rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors"

  // ── Progress dots (Steps 1-3 only) ─────────────────────────────────────────
  function ProgressDots() {
    if (step === 4) return null
    return (
      <div className="mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={[
                'h-2 rounded-full transition-all duration-300',
                n === step ? 'w-8 bg-sky-500'
                : n < step ? 'w-2 bg-sky-500/60'
                :             'w-2 bg-slate-700',
              ].join(' ')}
            />
          ))}
        </div>
        <p className="text-center text-xs text-slate-500">Step {step} of 3</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="mb-8">
        <img
          src="/sidelineops-logo-cropped.png"
          alt="SidelineOps"
          style={{ height: '36px' }}
        />
      </div>

      <div className="w-full max-w-[480px]">

        {/* ── Step 1: School Info ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bg-gray-900 rounded-2xl shadow-xl p-8 space-y-5">
            <ProgressDots />

            <div>
              <h1 className="text-xl font-bold text-white">Welcome to SidelineOps!</h1>
              <p className="text-slate-400 text-sm mt-1">Let&apos;s get you set up. First, tell us about your school.</p>
            </div>

            <div>
              <label className={labelClass}>School Name</label>
              <input
                type="text"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && goToStep2()}
                placeholder="e.g. Lincoln High School"
                className={inputClass}
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1.5">
                Enter your school name (e.g. &apos;Lincoln High&apos; or &apos;Lincoln High School&apos; — we&apos;ll clean it up)
              </p>
            </div>

            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && goToStep2()}
                placeholder="Madison"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>State</label>
              <select
                value={state}
                onChange={e => setState(e.target.value)}
                className={inputClass}
                style={{ appearance: 'auto' }}
              >
                <option value="">Select a state…</option>
                {US_STATES.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>{name}</option>
                ))}
              </select>
            </div>

            {step1Error && (
              <p className="text-sm text-red-400">{step1Error}</p>
            )}

            <button onClick={goToStep2} className={btnPrimary}>
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Program Info ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="bg-gray-900 rounded-2xl shadow-xl p-8 space-y-5">
            <ProgressDots />

            <div>
              <h1 className="text-xl font-bold text-white">Tell us about your program</h1>
              <p className="text-slate-400 text-sm mt-1">What sport do you coach?</p>
            </div>

            <div>
              <label className={labelClass}>Program</label>
              <select
                value={sport}
                onChange={e => setSport(e.target.value)}
                className={inputClass}
                style={{ appearance: 'auto' }}
                autoFocus
              >
                <option value="">Select a sport…</option>
                {SPORTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1.5">
                Select the sport for this program
              </p>
            </div>

            <div>
              <label className={labelClass}>Season Year</label>
              <input
                type="number"
                value={seasonYear}
                onChange={e => setSeasonYear(Number(e.target.value))}
                min={2020}
                max={2040}
                className={inputClass}
              />
            </div>

            <p className="text-xs text-slate-500">
              You can add your home field location in Team Settings after setup.
            </p>

            {step2Error && (
              <p className="text-sm text-red-400">{step2Error}</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className={btnSecondary}>
                ← Back
              </button>
              <button onClick={goToStep3} className={btnPrimary}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: First Team ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="bg-gray-900 rounded-2xl shadow-xl p-8 space-y-5">
            <ProgressDots />

            <div>
              <h1 className="text-xl font-bold text-white">Set up your first team</h1>
              <p className="text-slate-400 text-sm mt-1">You can add more teams later from Team Settings.</p>
            </div>

            {programLabel && (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                <p className="text-xs text-slate-400">Your program will be called:</p>
                <p className="text-sm font-semibold text-white mt-0.5">{programLabel}</p>
              </div>
            )}

            <div>
              <label className={labelClass}>Level</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                className={inputClass}
                style={{ appearance: 'auto' }}
                autoFocus
              >
                {LEVELS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>URL Slug</label>
              <div className="flex items-center">
                <span className="rounded-l-xl border border-r-0 border-white/10 bg-slate-700 px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                  /schedule/
                </span>
                <input
                  type="text"
                  value={teamSlug}
                  onChange={e => { setTeamSlugTouched(true); setTeamSlug(e.target.value) }}
                  placeholder="lincoln-softball-varsity"
                  className="flex-1 rounded-r-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                This is the public URL for your schedule page.
              </p>
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {submitError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} disabled={isSubmitting} className={btnSecondary}>
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !teamSlug.trim()}
                className={btnPrimary}
              >
                {isSubmitting ? 'Creating…' : 'Create My Team →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Success ──────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="bg-gray-900 rounded-2xl shadow-xl p-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h1 className="text-xl font-bold text-white">
              {programLabel ? `${programLabel} is ready!` : "You're all set!"}
            </h1>
            <p className="text-slate-400 text-sm">
              Your program is ready. Start by adding your schedule and inviting your coaching staff.
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <a
                href="/events/new"
                className="block rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                Add Events
              </a>
              <a
                href="/dashboard"
                className="block rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
