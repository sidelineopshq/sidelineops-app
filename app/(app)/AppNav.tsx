'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { signOut } from './actions'

const ROLE_LABELS: Record<string, string> = {
  admin:            'Admin',
  coach:            'Coach',
  volunteer_admin:  'Volunteer Admin',
  meal_coordinator: 'Meal Coordinator',
}
function roleLabel(r: string) { return ROLE_LABELS[r] ?? r }

const ALL_NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard',  icon: '⚡', hideFor: [] as string[] },
  { label: 'Schedule',   href: '/schedule',   icon: '📅', hideFor: [] },
  { label: 'Volunteers', href: '/volunteers', icon: '🙋', hideFor: [] },
  { label: 'Roster',     href: '/roster',     icon: '👥', hideFor: ['volunteer_admin', 'meal_coordinator'] },
  { label: 'Contacts',   href: '/contacts',   icon: '👥', hideFor: ['volunteer_admin', 'meal_coordinator'] },
]

function getNavItems(role: string, canManageVolunteers: boolean) {
  return ALL_NAV_ITEMS.filter(item => {
    if (item.hideFor.includes(role)) return false
    if (item.label === 'Volunteers') {
      return canManageVolunteers || role === 'admin' || role === 'volunteer_admin'
    }
    return true
  })
}

function AvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" className="text-white">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
  )
}

export default function AppNav({
  displayName,
  initials,
  email,
  teams,
  programName,
  sport,
  role,
  canManageEvents,
  canSendNotifications,
  canManageVolunteers,
  logoUrl,
  brandPrimary,
  brandSecondary,
}: {
  displayName: string
  initials: string
  email: string
  teams: { id: string; name: string }[]
  programName: string
  sport: string
  role: string
  canManageEvents: boolean
  canSendNotifications: boolean
  canManageVolunteers: boolean
  logoUrl: string | null
  brandPrimary: string
  brandSecondary: string
}) {
  const pathname = usePathname()
  const navItems = getNavItems(role, canManageVolunteers)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false)
    setDropdownOpen(false)
  }, [pathname])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <div
      className="bg-slate-900/90 backdrop-blur sticky top-0 z-40"
      style={{ borderBottom: `2px solid ${brandPrimary}` }}
    >

      {/* ── Main nav bar ── */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">

        {/* Left: SidelineOps logo always + team logo when set */}
        <a href="/dashboard" className="shrink-0 flex items-center gap-3">
          <img
            src="/sidelineops-logo-cropped.png"
            alt="SidelineOps"
            style={{ height: '28px', width: 'auto', opacity: 0.85 }}
          />
          {logoUrl && (
            <>
              <div className="w-px bg-white/20" style={{ height: '32px' }} />
              <img
                src={logoUrl}
                alt={teams[0]?.name ?? 'Team'}
                style={{ height: '40px', maxHeight: '40px', width: 'auto', objectFit: 'contain' }}
              />
            </>
          )}
        </a>

        {/* Center: desktop nav — hidden below md */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                isActive(item.href)
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              style={isActive(item.href) ? { backgroundColor: brandPrimary } : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right: team context + avatar + hamburger */}
        <div className="flex items-center gap-3">

          {/* Team context — desktop only */}
          <div className="hidden lg:block text-right">
            <p className="text-xs font-semibold text-white leading-tight">{programName}</p>
            <p className="text-xs text-slate-500 leading-tight">
              {teams.map(t => t.name).join(' · ')} · {roleLabel(role)}
            </p>
          </div>

          {/* Avatar + user dropdown — always visible */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 transition-colors border border-white/10"
              aria-label="User menu"
            >
              <AvatarIcon />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-11 w-64 rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                  <p className="text-xs text-slate-400 truncate">{email}</p>
                </div>
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Team</p>
                  <p className="text-sm text-slate-300">{programName}</p>
                  <p className="text-xs text-slate-500">{teams.map(t => t.name).join(' · ')} · {roleLabel(role)}</p>
                </div>
                <div className="py-1">
                  <a
                    href="/settings/profile"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                  >
                    <span>👤</span>
                    <span>Profile Settings</span>
                  </a>
                  {canManageEvents && role !== 'volunteer_admin' && role !== 'meal_coordinator' && (
                    <a
                      href="/settings/team"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      <span>⚙️</span>
                      <span>Team Settings</span>
                    </a>
                  )}
                </div>
                <div className="border-t border-white/10 py-1">
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    <span>→</span>
                    <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Hamburger — mobile only, below md breakpoint */}
          <div className="relative md:hidden" ref={mobileMenuRef}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? (
                // X icon when open
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M3 3L19 19M19 3L3 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              ) : (
                // Hamburger icon when closed
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect y="3" width="22" height="2.5" rx="1.25" fill="currentColor"/>
                  <rect y="9.75" width="22" height="2.5" rx="1.25" fill="currentColor"/>
                  <rect y="16.5" width="22" height="2.5" rx="1.25" fill="currentColor"/>
                </svg>
              )}
            </button>

            {/* Mobile dropdown menu */}
            {mobileMenuOpen && (
              <div className="absolute right-0 top-11 w-56 rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden z-50">
                {/* Team context */}
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">{sport}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{programName}</p>
                  <p className="text-xs text-slate-400">{teams.map(t => t.name).join(' · ')} · {roleLabel(role)}</p>
                </div>

                {/* Nav links */}
                <nav className="py-1">
                  {navItems.map(item => (
                    <a
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-colors ${
                        isActive(item.href)
                          ? 'text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                      style={isActive(item.href) ? { backgroundColor: brandPrimary } : undefined}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </a>
                  ))}
                </nav>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}