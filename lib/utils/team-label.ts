export const LEVELS = ['Varsity', 'JV', 'Freshman', '8th Grade', '7th Grade'] as const
export type Level = typeof LEVELS[number]

/**
 * Strips common school-type suffixes for cleaner display names.
 *
 * @example
 * formatSchoolName("James Clemens High School") // "James Clemens"
 * formatSchoolName("James Clemens HS")           // "James Clemens"
 * formatSchoolName("Discovery Middle School")    // "Discovery"
 * formatSchoolName("James Clemens")              // "James Clemens"
 */
export function formatSchoolName(schoolName: string): string {
  return schoolName
    .replace(/ High School$/i, '')
    .replace(/ HS$/i, '')
    .replace(/ Middle School$/i, '')
    .trim()
}

/**
 * Program-level label combining school and sport, with no team level.
 * Use for program headings, email subjects, and anywhere the level is
 * shown separately or irrelevant.
 *
 * @example
 * formatProgramLabel("James Clemens High School", "Softball")
 * // "James Clemens Softball"
 */
export function formatProgramLabel(schoolName: string, sport: string): string {
  return [formatSchoolName(schoolName), sport].filter(Boolean).join(' ')
}

/**
 * Full label combining school, sport, and team level.
 * Use for page titles and headers where both program and team context are needed.
 *
 * @example
 * formatProgramLabelWithLevel("James Clemens High School", "Softball", "Varsity")
 * // "James Clemens Softball — Varsity"
 */
export function formatProgramLabelWithLevel(
  schoolName: string,
  sport: string,
  level: string,
): string {
  return `${formatProgramLabel(schoolName, sport)} — ${level}`
}

/**
 * Smart truncation for space-constrained displays like nav headers.
 * Falls back to school name only (no sport) when the full program label
 * exceeds maxLength characters.
 *
 * @example
 * formatDisplayName("James Clemens High School", "Softball")
 * // "James Clemens Softball" (22 chars, fits default 20? → "James Clemens")
 * formatDisplayName("JC", "Softball")
 * // "JC Softball"
 */
export function formatDisplayName(
  schoolName: string,
  sport: string,
  maxLength: number = 20,
): string {
  const full = formatProgramLabel(schoolName, sport)
  return full.length > maxLength ? formatSchoolName(schoolName) : full
}

/**
 * Full label for page headers, email subjects, and primary display.
 * Format: "[School] [Sport] — [Level]"
 *
 * @example
 * formatTeamLabel("James Clemens High School", "Varsity", "Softball")
 * // "James Clemens Softball — Varsity"
 */
export function formatTeamLabel(
  schoolName: string,
  level: string,
  sport: string,
): string {
  return formatProgramLabelWithLevel(schoolName, sport, level)
}

/**
 * Short label for menus, dropdowns, badges, filter tabs, and subtext.
 *
 * @example
 * formatTeamShortLabel("Varsity") // "Varsity"
 * formatTeamShortLabel("JV")      // "JV"
 */
export function formatTeamShortLabel(level: string): string {
  return level
}
