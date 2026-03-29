export const LEVELS = ['Varsity', 'JV', 'Freshman', '8th Grade', '7th Grade'] as const
export type Level = typeof LEVELS[number]

/**
 * Full label for page headers, email subjects, and primary display.
 * e.g. "James Clemens Varsity Softball"
 */
export function formatTeamLabel(
  schoolName: string,
  level: string,
  sport: string,
): string {
  return [schoolName, level, sport].filter(Boolean).join(' ')
}

/**
 * Short label for menus, dropdowns, badges, filter tabs, and subtext.
 * e.g. "Varsity", "JV", "Freshman"
 */
export function formatTeamShortLabel(level: string): string {
  return level
}
