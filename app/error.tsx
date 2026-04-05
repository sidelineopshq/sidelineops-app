'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <img
        src="/sidelineops-logo-cropped.png"
        alt="SidelineOps"
        style={{ height: '32px', width: 'auto', opacity: 0.7 }}
        className="mb-8"
      />
      <p className="text-5xl mb-4">⚠️</p>
      <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
      <p className="text-sm text-slate-400 mb-8 max-w-xs">
        An unexpected error occurred. Try again or return to the dashboard.
      </p>
      {process.env.NODE_ENV === 'development' && error?.message && (
        <pre className="mb-6 max-w-md rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400 text-left whitespace-pre-wrap break-all">
          {error.message}
        </pre>
      )}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          Try Again
        </button>
        <a
          href="/dashboard"
          className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
      <a
        href="?feedback=true"
        className="mt-8 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Report this problem
      </a>
    </div>
  )
}
