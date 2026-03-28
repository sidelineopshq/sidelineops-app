'use client'

import { useRef, useState, useTransition } from 'react'
import { saveColors, uploadLogo, removeLogo } from './actions'

type TeamAppearance = {
  id:              string
  name:            string
  logo_url:        string | null
  primary_color:   string | null
  secondary_color: string | null
}

const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024

function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME.includes(file.type)) return 'File must be PNG, JPG, or SVG'
  if (file.size > MAX_BYTES) return 'File must be under 2 MB'
  return null
}

// ── Per-team appearance section ───────────────────────────────────────────────

function TeamAppearanceSection({
  team,
  canManage,
  showTeamName,
}: {
  team:         TeamAppearance
  canManage:    boolean
  showTeamName: boolean
}) {
  const [logoUrl,   setLogoUrl]   = useState(team.logo_url)
  const [primary,   setPrimary]   = useState(team.primary_color   ?? '#0ea5e9')
  const [secondary, setSecondary] = useState(team.secondary_color ?? '#1e293b')

  const [isDragging,   setIsDragging]   = useState(false)
  const [isUploading,  setIsUploading]  = useState(false)
  const [isRemoving,   setIsRemoving]   = useState(false)
  const [uploadError,  setUploadError]  = useState<string | null>(null)

  const [colorsSaved,  setColorsSaved]  = useState(false)
  const [colorError,   setColorError]   = useState<string | null>(null)
  const [isSaving,     startSave]       = useTransition()

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const err = validateFile(file)
    if (err) { setUploadError(err); return }

    setUploadError(null)
    setIsUploading(true)

    const fd = new FormData()
    fd.append('logo', file)
    const result = await uploadLogo(team.id, fd)

    setIsUploading(false)
    if (result?.error) {
      setUploadError(result.error)
    } else if (result?.logoUrl) {
      setLogoUrl(result.logoUrl)
    }
  }

  async function handleRemove() {
    setIsRemoving(true)
    const result = await removeLogo(team.id)
    setIsRemoving(false)
    if (!result?.error) setLogoUrl(null)
  }

  function handleSaveColors() {
    startSave(async () => {
      setColorError(null)
      const result = await saveColors(team.id, primary, secondary)
      if (result?.error) {
        setColorError(result.error)
      } else {
        setColorsSaved(true)
        setTimeout(() => setColorsSaved(false), 2000)
      }
    })
  }

  return (
    <div className="px-6 py-6 space-y-8">
      {showTeamName && (
        <p className="text-sm font-semibold text-white -mb-2">{team.name}</p>
      )}

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-white">Team Logo</p>
          <p className="text-xs text-slate-400 mt-0.5">PNG, JPG, or SVG · max 2 MB</p>
        </div>

        {/* Current logo preview */}
        {logoUrl && (
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl border border-white/10 bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
              <img src={logoUrl} alt="Team logo" className="h-full w-full object-contain" />
            </div>
            {canManage && (
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleRemove}
                className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
              >
                {isRemoving ? 'Removing…' : 'Remove logo'}
              </button>
            )}
          </div>
        )}

        {/* Upload zone */}
        {canManage && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                const file = e.dataTransfer.files[0]
                if (file) handleFile(file)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed',
                'px-6 py-8 cursor-pointer transition-colors select-none',
                isDragging
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-slate-800/50',
                isUploading ? 'pointer-events-none opacity-50' : '',
              ].join(' ')}
            >
              <span className="text-2xl" aria-hidden>🖼</span>
              <p className="text-sm text-slate-400">
                {isUploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Drop file here or click to upload'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </>
        )}

        {uploadError && (
          <p className="text-xs text-red-400">{uploadError}</p>
        )}
      </div>

      {/* ── Colors ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-white">Team Colors</p>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                disabled={!canManage}
                value={primary}
                onChange={e => setPrimary(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="font-mono text-sm text-slate-300">{primary}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                disabled={!canManage}
                value={secondary}
                onChange={e => setSecondary(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="font-mono text-sm text-slate-300">{secondary}</span>
            </div>
          </div>
        </div>

        {/* Live preview swatch */}
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">Preview</p>
          <div className="h-8 w-32 rounded-lg overflow-hidden flex border border-white/10">
            <div className="flex-1" style={{ backgroundColor: primary }} />
            <div className="flex-1" style={{ backgroundColor: secondary }} />
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveColors}
              className="rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save Colors'}
            </button>
            {colorsSaved && <span className="text-xs text-green-400 font-medium">Saved</span>}
            {colorError  && <span className="text-xs text-red-400">{colorError}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Exported component ────────────────────────────────────────────────────────

export function AppearanceTab({
  teams,
  canManage,
}: {
  teams:     TeamAppearance[]
  canManage: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Appearance</h2>
        <p className="text-slate-400 text-xs mt-1">Customize your team&apos;s logo and colors.</p>
      </div>

      <div className="divide-y divide-white/5">
        {teams.map(team => (
          <TeamAppearanceSection
            key={team.id}
            team={team}
            canManage={canManage}
            showTeamName={teams.length > 1}
          />
        ))}
      </div>
    </div>
  )
}
