'use client'

import { validatePassword } from '@/lib/utils/password-validation'

const REQUIREMENTS = [
  { label: '8+ chars',  test: (p: string) => p.length >= 8 },
  { label: 'Uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number',    test: (p: string) => /[0-9]/.test(p) },
]

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {REQUIREMENTS.map(req => {
        const met = req.test(password)
        return (
          <span
            key={req.label}
            className={[
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
              met
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-slate-800 text-slate-500 border border-white/10',
            ].join(' ')}
          >
            {met ? '✓' : '✗'} {req.label}
          </span>
        )
      })}
    </div>
  )
}
