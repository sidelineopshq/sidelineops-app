export const metadata = { title: 'Access Denied' }

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <img
        src="/sidelineops-logo-cropped.png"
        alt="SidelineOps"
        style={{ height: '32px', width: 'auto', opacity: 0.7 }}
        className="mb-8"
      />
      <p className="text-5xl mb-4">🔒</p>
      <h1 className="text-xl font-semibold text-white mb-2">Access Denied</h1>
      <p className="text-sm text-slate-400 mb-8 max-w-xs">
        You don't have permission to view this page.
      </p>
      <a
        href="/dashboard"
        className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold transition-colors"
      >
        Go to Dashboard
      </a>
      <a
        href="?feedback=true"
        className="mt-8 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Report a problem
      </a>
    </div>
  )
}
