'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { checkForDuplicates, importSchedule, type ImportRow } from './actions'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses any Excel date representation to YYYY-MM-DD.
 * Handles: string "MM/DD/YYYY", string "YYYY-MM-DD",
 *          Excel serial number, and Date objects.
 */
function parseExcelDate(value: unknown): string {
  if (!value && value !== 0) return ''

  if (typeof value === 'string') {
    const mdyMatch = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mdyMatch) {
      return `${mdyMatch[3]}-${mdyMatch[1].padStart(2,'0')}-${mdyMatch[2].padStart(2,'0')}`
    }
    const isoMatch = value.trim().match(/^\d{4}-\d{2}-\d{2}$/)
    if (isoMatch) return value.trim()
    return value.trim()
  }

  if (typeof value === 'number') {
    // Excel serial: days since 1899-12-30 (accounts for the 1900 leap-year bug)
    const excelEpoch = new Date(1899, 11, 30)
    const date       = new Date(excelEpoch.getTime() + Math.floor(value) * 86400000)
    const y  = date.getFullYear()
    const mo = String(date.getMonth() + 1).padStart(2, '0')
    const d  = String(date.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }

  if (value instanceof Date) {
    const y  = value.getFullYear()
    const mo = String(value.getMonth() + 1).padStart(2, '0')
    const d  = String(value.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }

  return String(value).trim()
}

/**
 * Parses any Excel time representation to HH:MM:SS (24-hour).
 * Handles: string "4:30 PM" / "16:30", Excel decimal fraction, Date objects.
 * Excel stores pure times as a fraction of a day (e.g. 4:30 PM = 0.6875).
 * "12/30/1899" arises when a decimal < 1 is treated as an integer date serial.
 */
function parseExcelTime(value: unknown): string {
  if (!value && value !== 0) return ''

  if (typeof value === 'string') {
    const s = value.trim()
    // "4:30 PM" or "16:30" formats
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
    if (m) {
      let h        = parseInt(m[1], 10)
      const min    = m[2]
      const meridiem = m[4]?.toUpperCase()
      if (meridiem === 'PM' && h !== 12) h += 12
      if (meridiem === 'AM' && h === 12) h = 0
      return `${String(h).padStart(2,'0')}:${min}:00`
    }
    return ''
  }

  if (typeof value === 'number') {
    // Take only the fractional part — integer part is the date serial
    const frac        = value % 1
    const totalMinutes = Math.round(frac * 24 * 60)
    const h   = Math.floor(totalMinutes / 60) % 24
    const min = totalMinutes % 60
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`
  }

  if (value instanceof Date) {
    const h   = value.getHours()
    const min = value.getMinutes()
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`
  }

  return ''
}

/** Formats a plain text cell to string; never treats numbers as dates. */
function cellToString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (val instanceof Date) return ''   // shouldn't happen for text columns with raw:true
  return String(val).trim()
}

function isValidDate(val: string) {
  // Accepts YYYY-MM-DD (output of parseExcelDate) or MM/DD/YYYY
  return /^\d{4}-\d{2}-\d{2}$/.test(val.trim()) ||
         /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val.trim())
}

function isValidEventType(val: string) {
  return ['game','practice','tournament','scrimmage'].includes(val.trim().toLowerCase())
}

function formatDateDisplay(date: string) {
  if (!date) return '—'
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const d = new Date(date + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
  }
  // Legacy MM/DD/YYYY
  const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return date
  const d = new Date(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}T00:00:00`)
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
}

/** Formats HH:MM:SS (24-hour) to human-readable "4:30 PM". */
function formatTimeDisplay(time: string): string {
  if (!time) return '—'
  const [hours, minutes] = time.split(':')
  const h        = parseInt(hours, 10)
  const meridiem = h >= 12 ? 'PM' : 'AM'
  const display  = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${display}:${minutes} ${meridiem}`
}

async function parseSpreadsheet(file: File): Promise<ImportRow[]> {
  const XLSX = await import('xlsx')
  const buf  = await file.arrayBuffer()
  // raw: true preserves numeric values so our parsers handle them correctly.
  // cellDates: false prevents the library from auto-converting serials to Dates,
  // which can produce "12/30/1899" for pure time fractions.
  const wb  = XLSX.read(buf, { type: 'array', raw: true, cellDates: false })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  // Find header row — first row where col A is 'Date' (case-insensitive)
  let headerIdx = 0
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i] as unknown[]
    if (cellToString(row[0]).toLowerCase() === 'date') {
      headerIdx = i
      break
    }
  }

  const dataRows = (raw as unknown[][]).slice(headerIdx + 1)

  return dataRows
    .filter(row => {
      const first = cellToString(row[0])
      // Skip hint rows ("MM/DD/YYYY") and fully-blank rows
      if (first === 'MM/DD/YYYY') return false
      if (!row.some(c => c !== '' && c !== null && c !== undefined)) return false
      // Must have something in col A (date) or col B (event type) to be a data row
      return !!(row[0] || row[1])
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

// ── Types ─────────────────────────────────────────────────────────────────────

type RowStatus = 'new' | 'duplicate' | 'invalid'

type PreviewRow = ImportRow & {
  status:  RowStatus
  checked: boolean
  rowIdx:  number
}

type ImportResult = {
  imported: number
  replaced: number
  failed:   number
  errors:   string[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === 'new') return (
    <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/20 px-2.5 py-0.5 text-xs font-semibold text-green-300">
      New
    </span>
  )
  if (status === 'duplicate') return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
      Duplicate
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-300">
      Invalid
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImportClient({
  teams,
  programId,
  programLabel,
}: {
  teams:        { id: string; name: string }[]
  programId:    string
  programLabel: string
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id ?? '')
  const [file,            setFile]           = useState<File | null>(null)
  const [dragging,        setDragging]       = useState(false)
  const [parseError,      setParseError]     = useState<string | null>(null)
  const [previewRows,     setPreviewRows]    = useState<PreviewRow[] | null>(null)
  const [result,          setResult]         = useState<ImportResult | null>(null)
  const [isPreviewing,    startPreview]      = useTransition()
  const [isImporting,     startImport]       = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handling ──────────────────────────────────────────────────────────

  function handleFileSelect(f: File) {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    const extOk = /\.(xlsx|xls|csv)$/i.test(f.name)
    if (!allowed.includes(f.type) && !extOk) {
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

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  // ── Preview ────────────────────────────────────────────────────────────────

  function handlePreview() {
    if (!file) return
    startPreview(async () => {
      setParseError(null)
      try {
        const rows = await parseSpreadsheet(file)
        if (rows.length === 0) {
          setParseError('No data rows found in the file. Make sure your file follows the template format.')
          return
        }

        // Validate each row locally first
        const validated = rows.map((r, i): PreviewRow => {
          const invalid = !isValidDate(r.date) || !isValidEventType(r.eventType)
          return { ...r, status: invalid ? 'invalid' : 'new', checked: !invalid, rowIdx: i }
        })

        // Check valid rows against DB for duplicates
        const validItems = validated
          .filter(r => r.status !== 'invalid')
          .map(r => ({ date: r.date, eventType: r.eventType }))

        const { duplicateKeys } = await checkForDuplicates(validItems, programId)
        const dupSet = new Set(duplicateKeys)

        const withDuplicates = validated.map(r => {
          if (r.status === 'invalid') return r
          // r.date is YYYY-MM-DD (from parseExcelDate), matching the DB format
          const key = `${r.date}|${r.eventType.trim().toLowerCase()}`
          return dupSet.has(key) ? { ...r, status: 'duplicate' as RowStatus } : r
        })

        setPreviewRows(withDuplicates)
      } catch (err: any) {
        setParseError(`Failed to parse file: ${err?.message ?? String(err)}`)
      }
    })
  }

  // ── Toggle row selection ───────────────────────────────────────────────────

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
        selectedTeamId,
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <a
            href="/schedule"
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block"
          >
            ← Schedule
          </a>
          <h1 className="text-2xl font-bold">Import Schedule</h1>
          <p className="text-slate-400 text-sm mt-1">{programLabel}</p>
        </div>

        {/* ── Result card ──────────────────────────────────────────────────── */}
        {result && (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 text-center space-y-4">
            <div className="text-4xl">{result.failed === 0 ? '✅' : '⚠️'}</div>
            <h2 className="text-xl font-bold">Import Complete</h2>
            <div className="flex justify-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">{result.imported}</p>
                <p className="text-slate-400">New events added</p>
              </div>
              {result.replaced > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{result.replaced}</p>
                  <p className="text-slate-400">Events replaced</p>
                </div>
              )}
              {result.failed > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{result.failed}</p>
                  <p className="text-slate-400">Failed</p>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left">
                <p className="text-sm font-semibold text-red-300 mb-2">Errors</p>
                <ul className="text-xs text-red-400 space-y-1 list-disc list-inside">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-center gap-3 pt-2">
              <a
                href="/schedule"
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-6 py-2.5 text-sm font-semibold transition-colors"
              >
                View Schedule
              </a>
              <button
                onClick={() => {
                  setResult(null)
                  setFile(null)
                  setPreviewRows(null)
                }}
                className="rounded-xl border border-white/10 hover:border-white/20 px-6 py-2.5 text-sm font-semibold transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}

        {!result && (
          <>
            {/* ── Step 1: Download Template ───────────────────────────────── */}
            {!previewRows && (
              <>
                <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
                      Step 1 — Download the template
                    </h2>
                  </div>
                  <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <p className="text-sm text-slate-400">
                      Fill in your schedule using our formatted spreadsheet template. The file includes
                      column headers and an example row to guide you.
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

                {/* ── Step 2: Upload ─────────────────────────────────────── */}
                <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
                      Step 2 — Upload your schedule
                    </h2>
                  </div>
                  <div className="px-6 py-5 space-y-5">
                    <p className="text-sm text-slate-400">
                      Upload your completed spreadsheet to import events in bulk.
                    </p>

                    {/* Drop zone */}
                    <div
                      onDrop={onDrop}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      className={[
                        'rounded-xl border-2 border-dashed px-8 py-10 text-center cursor-pointer transition-colors',
                        dragging
                          ? 'border-sky-500 bg-sky-500/10'
                          : file
                            ? 'border-green-500/40 bg-green-500/5'
                            : 'border-white/10 hover:border-white/20',
                      ].join(' ')}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleFileSelect(f)
                        }}
                      />
                      {file ? (
                        <>
                          <div className="text-3xl mb-2">📄</div>
                          <p className="text-sm font-semibold text-green-400">{file.name}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {(file.size / 1024).toFixed(1)} KB · Click to change
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="text-3xl mb-2">📂</div>
                          <p className="text-sm font-semibold text-slate-300">
                            Drop your schedule file here or click to browse
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            .xlsx, .xls, or .csv · Max 5 MB
                          </p>
                        </>
                      )}
                    </div>

                    {parseError && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {parseError}
                      </div>
                    )}

                    {/* Team selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                        Apply to team
                      </label>
                      <select
                        value={selectedTeamId}
                        onChange={e => setSelectedTeamId(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
                        style={{ appearance: 'auto' }}
                      >
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1.5">
                        You can import for multiple teams by selecting each team separately and uploading the file again.
                      </p>
                    </div>

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
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
                      Step 3 — Review and confirm
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">
                      {previewRows.length} event{previewRows.length !== 1 ? 's' : ''} found in your file
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5 text-right">
                    <p><span className="text-green-400 font-semibold">{newCount}</span> new</p>
                    {duplicateCount > 0 && (
                      <p><span className="text-amber-400 font-semibold">{duplicateCount}</span> duplicates (will replace)</p>
                    )}
                    {invalidCount > 0 && (
                      <p><span className="text-red-400 font-semibold">{invalidCount}</span> invalid (will be skipped)</p>
                    )}
                  </div>
                </div>

                {/* Table — horizontally scrollable */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                        <th className="pl-4 pr-2 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={e => toggleAll(e.target.checked)}
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Date</th>
                        <th className="px-3 py-3 text-left whitespace-nowrap">Type</th>
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
                            row.status === 'invalid'
                              ? 'opacity-40'
                              : row.checked
                                ? 'hover:bg-white/[0.02]'
                                : 'opacity-50',
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
                          <td className="px-3 py-3 whitespace-nowrap text-slate-300">
                            {formatDateDisplay(row.date)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap capitalize text-slate-300">
                            {row.eventType || '—'}
                          </td>
                          <td className="px-3 py-3 text-slate-300 max-w-[180px] truncate">
                            {row.opponent || (row.eventType.toLowerCase() === 'practice' ? 'Practice' : '—')}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-400">
                            {row.homeAway || '—'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-400">
                            {row.startTime ? formatTimeDisplay(row.startTime) : '—'}
                          </td>
                          <td className="px-3 py-3 text-slate-400 max-w-[160px] truncate">
                            {row.locationName || '—'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <p className="text-xs text-slate-500">
                    {checkedCount} event{checkedCount !== 1 ? 's' : ''} selected to import
                    {duplicateCount > 0 ? ` · ${previewRows.filter(r => r.checked && r.status === 'duplicate').length} will replace existing events` : ''}
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
