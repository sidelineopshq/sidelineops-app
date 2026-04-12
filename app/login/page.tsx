'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, #0f2540 0%, #020817 100%)',
      }}
    >
      {/* Logo + tagline */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <Image
          src="/sidelineops-logo-cropped.png"
          alt="SidelineOps"
          width={180}
          height={48}
          className="h-10 w-auto sm:h-12"
          priority
        />
        <p className="text-sm text-gray-400 text-center tracking-wide">
          Coordinate. Communicate. Win.
        </p>
        <div className="w-16 h-px bg-white/10" />
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] rounded-2xl border border-gray-700/50 bg-slate-900 p-6 shadow-2xl sm:p-8">

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-gray-700 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-colors placeholder:text-gray-600 min-h-[44px]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-gray-700 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-colors placeholder:text-gray-600 min-h-[44px]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>

        {/* Links */}
        <div className="mt-5 space-y-3">
          <p className="text-center text-sm">
            <a href="/forgot-password" className="text-sky-400 hover:text-sky-300 transition-colors">
              Forgot your password?
            </a>
          </p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
          </div>

          <p className="text-center text-sm text-gray-400 pt-1">
            Don&apos;t have an account?{' '}
            <a href="/signup" className="text-sky-400 hover:text-sky-300 transition-colors font-medium">
              Request access →
            </a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-gray-500 text-center">
        © 2026 SidelineOps ·{' '}
        <a href="/legal/terms" className="hover:text-gray-400 underline transition-colors">Terms</a>
        {' '}·{' '}
        <a href="/legal/privacy" className="hover:text-gray-400 underline transition-colors">Privacy</a>
      </p>
    </div>
  )
}
