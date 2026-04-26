'use client'

import { useState, useEffect, useRef } from 'react'

export interface SchoolDirectoryEntry {
  id: string
  name: string
  type: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  district: string | null
  county: string | null
  full_address: string | null
  normalized_name: string | null
  latitude: number | null
  longitude: number | null
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSelect: (school: SchoolDirectoryEntry) => void
  onClear: () => void
  disabled?: boolean
  placeholder?: string
  className?: string
  initialSelectedSchool?: SchoolDirectoryEntry | null
}

export default function SchoolDirectoryAutocomplete({
  value,
  onChange,
  onSelect,
  onClear,
  disabled,
  placeholder = 'e.g. Riverside High School',
  className,
  initialSelectedSchool = null,
}: Props) {
  const [results, setResults]           = useState<SchoolDirectoryEntry[]>([])
  const [isLoading, setIsLoading]       = useState(false)
  const [isOpen, setIsOpen]             = useState(false)
  const [highlighted, setHighlighted]   = useState(-1)
  const [selectedSchool, setSelectedSchool] = useState<SchoolDirectoryEntry | null>(initialSelectedSchool)
  const [showNoResults, setShowNoResults]   = useState(false)

  const containerRef  = useRef<HTMLDivElement>(null)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQueryRef  = useRef('')

  // Close on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch suggestions with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 2) {
      setResults([])
      setIsOpen(false)
      setShowNoResults(false)
      return
    }

    // Don't re-fetch if value didn't change (e.g. after selection)
    if (value === lastQueryRef.current) return

    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = value
      setIsLoading(true)
      try {
        const res = await fetch(`/api/school-directory?q=${encodeURIComponent(value)}`)
        if (!res.ok) return
        const data: SchoolDirectoryEntry[] = await res.json()
        setResults(data)
        setHighlighted(-1)

        if (data.length > 0) {
          setIsOpen(true)
          setShowNoResults(false)
        } else {
          setIsOpen(true)
          setShowNoResults(true)
          setTimeout(() => {
            setShowNoResults(false)
            setIsOpen(false)
          }, 1500)
        }
      } catch {
        // Network error — silent fail, coach can still type manually
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }, [value])

  function handleSelect(school: SchoolDirectoryEntry) {
    lastQueryRef.current = school.name
    setSelectedSchool(school)
    setResults([])
    setIsOpen(false)
    setShowNoResults(false)
    onSelect(school)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVal = e.target.value
    if (selectedSchool) {
      setSelectedSchool(null)
      onClear()
    }
    onChange(newVal)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, -1))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      handleSelect(results[highlighted])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className={className}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-sky-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-white/10 bg-slate-800 shadow-2xl overflow-hidden">
          {showNoResults ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              No schools found — type opponent name
            </div>
          ) : (
            <ul>
              {results.map((school, i) => (
                <li
                  key={school.id}
                  onMouseDown={() => handleSelect(school)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`px-4 py-2.5 cursor-pointer transition-colors ${
                    highlighted === i ? 'bg-sky-500/20' : 'hover:bg-white/5'
                  }`}
                >
                  <p className="text-sm font-medium text-white leading-tight">{school.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[school.city, school.state].filter(Boolean).join(', ')}
                    {school.type ? ` · ${school.type}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Selected school indicator */}
      {selectedSchool && (
        <p className="mt-1.5 text-xs text-slate-400">
          📍 {[selectedSchool.city, selectedSchool.state].filter(Boolean).join(', ')} — Edit to override
        </p>
      )}
    </div>
  )
}
