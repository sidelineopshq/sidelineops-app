'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import {
  checkForDuplicates,
  importSchedule,
  type ImportRow,
  type DuplicateRecord,
  type ImportResult,
} from './actions'

// ── Excel parsing helpers ─────────────────────────────────────────────────────

function parseExcelDate(value: unknown): string {
  if (!value && value !== 0) return ''

  if (typeof value === 'string') {
    const mdy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim()
    return value.trim()
  }
  if (typeof value === 'number') {
    const epoch = new Date(1899, 11, 30)
    const d     = new Date(epoch.getTime() + Math.floor(value) * 86400000)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
  }
  return String(value).trim()
}

function parseExcelTime(value: unknown): string {
  if (!value && value !== 0) return ''
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
    if (m) {
      let h = parseInt(m[1], 10)
      const min = m[2]
      const mer = m[4]?.toUpperCase()
      if (mer === 'PM' && h !== 12) h += 12
      if (mer === 'AM' && h === 12) h = 0
      return `${String(h).padStart(2,'0')}:${min}:00`
    }
    return ''
  }
  if (typeof value === 'number') {
    const frac = value % 1
    const totalMin = Math.round(frac * 24 * 60)
    const h   = Math.floor(totalMin / 60) % 24
    const min = totalMin % 60
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`
  }
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}:00`
  }
  return ''
}

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (val instanceof Date) return ''
  return String(val).trim()
}

// ── Display formatters ────────────────────────────────────────────────────────

function formatDateDisplay(date: string): string {
  if (!date) return '—'
  const base = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (() => {
    const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : null
  })()
  if (!base) return date
  return new Date(base + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTimeDisplay(time: string): string {
  if (!time) return '—'
  const [hours, minutes] = time.split(':')
  const h   = parseInt(hours, 10)
  const mer = h >= 12 ? 'PM' : 'AM'
  const dis = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${dis}:${minutes} ${mer}`
}

// ── Spreadsheet parser ────────────────────────────────────────────────────────

async function parseSpreadsheet(file: File): Promise<ImportRow[]> {
  const XLSX = await import('xlsx')
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf, { type: 'array', raw: true, cellDates: false })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  let headerIdx = 0
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    if (cellToString((raw[i] as unknown[])[0]).toLowerCase() === 'date') { headerIdx = i; break }
  }

  return (raw as unknown[][])
    .slice(headerIdx + 1)
    .filter(row => {
      const first = cellToString(row[0])
      if (first === 'MM/DD/YYYY') return false
      return row.some(c => c !== '' && c !== null && c !== undefined)
    })
    .map(row => ({
      date:            parseExcelDate(row[0]),
      eventType:       cellToString(row[1]),
      team:            cellToString(row[2]),
      opponent:        cellToString(row[3]),
      homeAway:        cellToString(row[4]),
      locationName:    cellToString(row[5]),
      locationAddress: cellToString(row[6]),
      startTime:       parseExcelTime(row[7]),
      arrivalTime:     parseExcelTime(row[8]),
      endTime:         parseExcelTime(row[9]),
      uniformNotes:    cellToString(row[10]),
      notes:           cellToString(row[11]),
      mealRequired:    cellToString(row[12]),
      mealTime:        parseExcelTime(row[13]),
      mealNotes:       cellToString(row[14]),
    }))
}

// ── Validators ────────────────────────────────────────────────────────────────

function isValidDate(val: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(val.trim()) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val.trim())
}

function isValidEventType(val: string) {
  return ['game','practice','tournament','scrimmage'].includes(val.trim().toLowerCase())
}

/** Returns resolved team IDs or null if any level is unknown. */
function parseTeamIds(
  val:         string,
  teamByLevel: Map<string, string>,
  allTeamIds:  string[],
): string[] | null {
  const v = val.trim()
  if (!v) return null
  if (v.toLowerCase() === 'all') return allTeamIds
  const parts = v.split(',').map(p => p.trim()).filter(Boolean)
  const ids: string[] = []
  for (const part of parts) {
    const id = teamByLevel.get(part.toLowerCase())
    if (!id) return null
    ids.push(id)
  }
  return ids.length > 0 ? [...new Set(ids)] : null
}

function teamDisplayNames(
  teamIds: string[],
  teams:   { id: string; name: string }[],
): string {
  if (teamIds.length === teams.length && teams.length > 1) return 'All Teams'
  return teamIds.map(id => teams.find(t => t.id === id)?.name ?? '?').join(' · ')
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RowStatus = 'new' | 'duplicate' | 'invalid'
type VolunteerPreservation = 'preserved' | 'lost' | 'no-volunteers'

type PreviewRow = ImportRow & {
  status:               RowStatus
  checked:              boolean
  rowIdx:               number
  invalidReason?:       string
  resolvedTeamIds:      string[]
  // Duplicate volunteer info
  dupSlotCount?:        number
  dupAssignmentCount?:  number
  dupIsHome?:           boolean | null
  volunteerPreservation?: VolunteerPreservation
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ row }: { row: PreviewRow }) {
  if (row.status === 'new') return (
    <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/20 px-2.5 py-0.5 text-xs font-semibold text-green-300">
      New
    </span>
  )

  if (row.status === 'invalid') return (
    <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-300">
      Invalid
    </span>
  )

  // Duplicate
  const vp = row.volunteerPreservation
  if (vp === 'preserved') return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
        Duplicate
      </span>
      <p className="text-xs text-green-400">🛡 {row.dupSlotCount} slot{row.dupSlotCount !== 1 ? 's' : ''} preserved</p>
    </div>
  )
  if (vp === 'lost') return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-300">
        Duplicate ⚠
      </span>
      <p className="text-xs text-red-400">{row.dupAssignmentCount} assignment{row.dupAssignmentCount !== 1 ? 's' : ''} will be lost</p>
    </div>
  )
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
      Duplicate
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImportClient({
  teams,
  programId,
  programLabel,
}: {
  teams:        { id: string; name: string; level: string | null }[]
  programId:    string
  programLabel: string
}) {
  const [file,         setFile]         = useState<File | null>(null)
  const [dragging,     setDragging]     = useState(false)
  const [parseError,   setParseError]   = useState<string | null>(null)
  const [previewRows,  setPreviewRows]  = useState<PreviewRow[] | null>(null)
  const [result,       setResult]       = useState<ImportResult | null>(null)
  const [isPreviewing, startPreview]    = useTransition()
  const [isImporting,  startImport]     = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Build level → teamId lookup (case-insensitive)
  const teamByLevel = new Map(
    teams.filter(t => t.level).map(t => [t.level!.toLowerCase(), t.id])
  )
  const allTeamIds = teams.map(t => t.id)

  // ── File handling ──────────────────────────────────────────────────────────

  function handleFileSelect(f: File) {
    const extOk = /\.(xlsx|xls|csv)$/i.test(f.name)
    const typeOk = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ].includes(f.type)
    if (!typeOk && !extOk) {
      setParseError('Please upload a .xlsx, .xls, or .csv file.')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setParseError('File must be under 5 MB.')
      return
    }
    setFile(f)
    setParseError(null)
    setPreviewRows(null)
    setResult(null)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }, [])

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])

  // ── Preview ────────────────────────────────────────────────────────────────

  function handlePreview() {
    if (!file) return
    startPreview(async () => {
      setParseError(null)
      try {
        const rows = await parseSpreadsheet(file)
        if (!rows.length) {
          setParseError('No data rows found. Make sure your file follows the template format.')
          return
        }

        // Validate each row
        const validated = rows.map((r, i): PreviewRow => {
          const teamIds = parseTeamIds(r.team, teamByLevel, allTeamIds)
          let invalidReason: string | undefined
          if (!isValidDate(r.date))      invalidReason = 'Invalid date'
          else if (!isValidEventType(r.eventType)) invalidReason = 'Invalid event type'
          else if (!teamIds)             invalidReason = `Team "${r.team}" not found in this program`
          return {
            ...r,
            status:          invalidReason ? 'invalid' : 'new',
            checked:         !invalidReason,
            rowIdx:          i,
            invalidReason,
            resolvedTeamIds: teamIds ?? [],
          }
        })

        // Server check for duplicates (valid rows only)
        const validItems = validated
          .filter(r => r.status !== 'invalid')
          .map(r => ({ date: r.date, eventType: r.eventType }))

        const { duplicates } = await checkForDuplicates(validItems, programId)
        const dupMap = new Map(duplicates.map((d: DuplicateRecord) => [d.key, d]))

        const withDuplicates = validated.map(r => {
          if (r.status === 'invalid') return r
          const key = `${r.date}|${r.eventType.trim().toLowerCase()}`
          const dup = dupMap.get(key)
          if (!dup) return r

          // Determine volunteer preservation
          const newIsHome = r.homeAway.trim().toLowerCase() === 'home'
          let volunteerPreservation: VolunteerPreservation = 'no-volunteers'
          if (dup.slotCount > 0) {
            const shouldPreserve = newIsHome && dup.isHome === true
            volunteerPreservation = shouldPreserve
              ? 'preserved'
              : dup.assignmentCount > 0 ? 'lost' : 'no-volunteers'
          }

          return {
            ...r,
            status:               'duplicate' as RowStatus,
            dupSlotCount:         dup.slotCount,
            dupAssignmentCount:   dup.assignmentCount,
            dupIsHome:            dup.isHome,
            volunteerPreservation,
          }
        })

        setPreviewRows(withDuplicates)
      } catch (err: any) {
        setParseError(`Failed to parse file: ${err?.message ?? String(err)}`)
      }
    })
  }

  // ── Toggle selection ───────────────────────────────────────────────────────

  function toggleRow(rowIdx: number) {
    setPreviewRows(prev => prev?.map(r => r.rowIdx === rowIdx ? { ...r, checked: !r.checked } : r) ?? null)
  }

  function toggleAll(checked: boolean) {
    setPreviewRows(prev => prev?.map(r => r.status === 'invalid' ? r : { ...r, checked }) ?? null)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  function handleImport() {
    if (!previewRows) return
    const selected = previewRows.filter(r => r.checked && r.status !== 'invalid')
    if (!selected.length) return

    startImport(async () => {
      const res = await importSchedule(
        selected.map(r => ({
          date:            r.date,
          eventType:       r.eventType,
          team:            r.team,
          opponent:        r.opponent,
          homeAway:        r.homeAway,
          locationName:    r.locationName,
          locationAddress: r.locationAddress,
          startTime:       r.startTime,
          arrivalTime:     r.arrivalTime,
          endTime:         r.endTime,
          uniformNotes:    r.uniformNotes,
          notes:           r.notes,
          mealRequired:    r.mealRequired,
          mealTime:        r.mealTime,
          mealNotes:       r.mealNotes,
        })),
        programId,
      )
      setResult(res)
      setPreviewRows(null)
    })
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const newCount       = previewRows?.filter(r => r.status === 'new').length       ?? 0
  const duplicateCount = previewRows?.filter(r => r.status === 'duplicate').length ?? 0
  const invalidCount   = previewRows?.filter(r => r.status === 'invalid').length   ?? 0
  const checkedCount   = previewRows?.filter(r => r.checked && r.status !== 'invalid').length ?? 0
  const allChecked     = previewRows?.filter(r => r.status !== 'invalid').every(r => r.checked) ?? false
  const willLoseVols   = previewRows?.filter(r => r.checked && r.volunteerPreservation === 'lost').length ?? 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <a href="/schedule" className="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block">
            ← Schedule
          </a>
          <h1 className="text-2xl font-bold">Import Schedule</h1>
          <p className="text-slate-400 text-sm mt-1">{programLabel}</p>
        </div>

        {/* ── Result screen ─────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 text-center space-y-4">
              <div className="text-4xl">{result.failed === 0 && result.warnings.length === 0 ? '✅' : '⚠️'}</div>
              <h2 className="text-xl font-bold">Import Complete</h2>
              <div className="flex flex-wrap justify-center gap-6 text-sm">
                {result.imported > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{result.imported}</p>
                    <p className="text-slate-400">New events added</p>
                  </div>
                )}
                {result.updated > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-sky-400">{result.updated}</p>
                    <p className="text-slate-400">Updated in place</p>
                  </div>
                )}
                {result.replaced > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-400">{result.replaced}</p>
                    <p className="text-slate-400">Replaced</p>
                  </div>
                )}
                {result.volunteersPreserved > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-300">{result.volunteersPreserved}</p>
                    <p className="text-slate-400">Volunteer slots preserved</p>
                  </div>
                )}
                {result.volunteersLost > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{result.volunteersLost}</p>
                    <p className="text-slate-400">Assignments removed</p>
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{result.failed}</p>
                    <p className="text-slate-400">Failed</p>
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <a href="/schedule" className="rounded-xl bg-sky-600 hover:bg-sky-500 px-6 py-2.5 text-sm font-semibold transition-colors">
                  View Schedule
                </a>
                <button
                  onClick={() => { setResult(null); setFile(null) }}
                  className="rounded-xl border border-white/10 hover:border-white/20 px-6 py-2.5 text-sm font-semibold transition-colors"
                >
                  Import Another File
                </button>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-5">
                <p className="text-sm font-semibold text-amber-300 mb-1">⚠ Volunteer Assignments Removed</p>
                <p className="text-xs text-amber-400/80 mb-3">
                  The following events had volunteer assignments that could not be preserved due to home/away status changes:
                </p>
                <ul className="text-xs text-amber-400 space-y-1 list-disc list-inside mb-3">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
                <p className="text-xs text-amber-400/70">
                  Affected volunteers were not notified. Please update your volunteer slots manually.
                </p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-5">
                <p className="text-sm font-semibold text-red-300 mb-2">Errors</p>
                <ul className="text-xs text-red-400 space-y-1 list-disc list-inside">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {!result && (
          <>
            {/* ── Steps 1 & 2: Download + Upload ──────────────────────────── */}
            {!previewRows && (
              <>
                <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Step 1 — Download the template</h2>
                  </div>
                  <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <p className="text-sm text-slate-400">
                      Fill in your schedule using our formatted spreadsheet template.
                      Use the <strong className="text-slate-300">Team</strong> column to assign events to specific teams
                      (e.g. "Varsity", "JV", or "All").
                    </p>
                    <a
                      href="/api/schedule/template"
                      download
                      className="shrink-0 rounded-xl border border-white/10 hover:border-white/20 px-5 py-2.5 text-sm font-semibold transition-colors text-center"
                    >
                      ⬇ Download Template
                    </a>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Step 2 — Upload your schedule</h2>
                  </div>
                  <div className="px-6 py-5 space-y-5">
                    <p className="text-sm text-slate-400">
                      Upload your completed spreadsheet to import events in bulk.
                      Team assignments are read directly from the Team column in your file.
                    </p>

                    {/* Drop zone */}
                    <div
                      onDrop={onDrop}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      className={[
                        'rounded-xl border-2 border-dashed px-8 py-10 text-center cursor-pointer transition-colors',
                        dragging   ? 'border-sky-500 bg-sky-500/10' :
                        file       ? 'border-green-500/40 bg-green-500/5' :
                                     'border-white/10 hover:border-white/20',
                      ].join(' ')}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                      />
                      {file ? (
                        <>
                          <div className="text-3xl mb-2">📄</div>
                          <p className="text-sm font-semibold text-green-400">{file.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                        </>
                      ) : (
                        <>
                          <div className="text-3xl mb-2">📂</div>
                          <p className="text-sm font-semibold text-slate-300">Drop your schedule file here or click to browse</p>
                          <p className="text-xs text-slate-500 mt-1">.xlsx, .xls, or .csv · Max 5 MB</p>
                        </>
                      )}
                    </div>

                    {parseError && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {parseError}
                      </div>
                    )}

                    <button
                      onClick={handlePreview}
                      disabled={!file || isPreviewing}
                      className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold transition-colors"
                    >
                      {isPreviewing ? 'Parsing file…' : 'Preview Import'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Step 3: Preview table ──────────────────────────────────── */}
            {previewRows && (
              <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Step 3 — Review and confirm</h2>
                    <p className="text-slate-400 text-xs mt-1">
                      {previewRows.length} event{previewRows.length !== 1 ? 's' : ''} found in your file
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5 text-right">
                    <p><span className="text-green-400 font-semibold">{newCount}</span> new</p>
                    {duplicateCount > 0 && (
                      <p><span className="text-amber-400 font-semibold">{duplicateCount}</span> duplicates (will update/replace)</p>
                    )}
                    {invalidCount > 0 && (
                      <p><span className="text-red-400 font-semibold">{invalidCount}</span> invalid (will be skipped)</p>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                        <th className="pl-4 pr-2 py-3 text-left">
                          <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)} className="rounded" />
                        </th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Date</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Type</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Teams</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Opponent / Title</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Home/Away</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Time</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Location</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {previewRows.map(row => (
                        <tr
                          key={row.rowIdx}
                          className={[
                            'transition-colors',
                            row.status === 'invalid' ? 'opacity-40' :
                            row.checked              ? 'hover:bg-white/[0.02]' : 'opacity-50',
                          ].join(' ')}
                        >
                          <td className="pl-4 pr-2 py-3">
                            <input
                              type="checkbox"
                              checked={row.checked}
                              disabled={row.status === 'invalid'}
                              onChange={() => toggleRow(row.rowIdx)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-300">{formatDateDisplay(row.date)}</td>
                          <td className="px-3 py-3 whitespace-nowrap capitalize text-slate-300">{row.eventType || '—'}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-300">
                            {row.resolvedTeamIds.length > 0
                              ? teamDisplayNames(row.resolvedTeamIds, teams)
                              : <span className="text-red-400">{row.team || '—'}</span>
                            }
                          </td>
                          <td className="px-3 py-3 text-slate-300 max-w-[180px] truncate">
                            {row.opponent || (row.eventType.toLowerCase() === 'practice' ? 'Practice' : '—')}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-400">{row.homeAway || '—'}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-400">
                            {row.startTime ? formatTimeDisplay(row.startTime) : '—'}
                          </td>
                          <td className="px-3 py-3 text-slate-400 max-w-[160px] truncate">{row.locationName || '—'}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <StatusBadge row={row} />
                            {row.invalidReason && (
                              <p className="text-xs text-red-400 mt-0.5">{row.invalidReason}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {willLoseVols > 0 && (
                  <div className="mx-4 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <p className="text-xs text-amber-300 font-semibold">⚠ Volunteer assignments will be lost</p>
                    <p className="text-xs text-amber-400/80 mt-0.5">
                      {willLoseVols} selected event{willLoseVols !== 1 ? 's' : ''} will replace existing events whose home/away status changed.
                      Existing volunteer assignments for those events will be removed.
                    </p>
                  </div>
                )}

                <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <p className="text-xs text-slate-500">
                    {checkedCount} event{checkedCount !== 1 ? 's' : ''} selected
                    {duplicateCount > 0
                      ? ` · ${previewRows.filter(r => r.checked && r.status === 'duplicate').length} will update existing events`
                      : ''}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setPreviewRows(null); setFile(null) }}
                      className="rounded-xl border border-white/10 hover:border-white/20 px-5 py-2.5 text-sm font-semibold transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={checkedCount === 0 || isImporting}
                      className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold transition-colors"
                    >
                      {isImporting ? 'Importing…' : `Import ${checkedCount} Event${checkedCount !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </main>
  )
}
