import Link from 'next/link'

export const metadata = { title: 'Page Not Found' }

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <img
        src="/sidelineops-logo-cropped.png"
        alt="SidelineOps"
        style={{ height: '32px', width: 'auto', opacity: 0.7 }}
        className="mb-8"
      />
      <p className="text-6xl font-bold text-slate-700 mb-3">404</p>
      <h1 className="text-xl font-semibold text-white mb-2">Page not found</h1>
      <p className="text-sm text-slate-400 mb-8 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
        >
          Home
        </Link>
      </div>
      <a
        href="/?feedback=true"
        className="mt-8 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Report a problem
      </a>
    </div>
  )
}
