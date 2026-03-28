export const LEVELS = ['Varsity', 'JV', 'Freshman', '8th Grade', '7th Grade'] as const
export type Level = typeof LEVELS[number]

/**
 * Returns the standardized team label: "[School Name] [Level] [Sport]"
 * e.g. "James Clemens Varsity Softball"
 * Filters out empty parts to avoid extra spaces.
 */
export function formatTeamLabel(
  schoolName: string,
  level: string,
  sport: string,
): string {
  return [schoolName, level, sport].filter(Boolean).join(' ')
}
