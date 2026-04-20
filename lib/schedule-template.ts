import * as XLSX from 'xlsx'

export function generateScheduleTemplate(): Buffer {
  const headers = [
    'Date',
    'Event Type',
    'Team',
    'Opponent',
    'Home/Away',
    'Location Name',
    'Location Address',
    'Start Time',
    'Arrival Time',
    'End Time',
    'Uniform Notes',
    'Notes',
    'Meal Required',
    'Meal Time',
    'Meal Notes',
  ]

  // Row 2: valid-values hints
  const validValues = [
    'MM/DD/YYYY',
    'Game, Practice, Tournament, Scrimmage',
    'Varsity, JV, Freshman, 8th Grade, 7th Grade, All, or comma-separated e.g. "Varsity, JV"',
    'Leave blank for practices',
    'Home, Away, Neutral',
    '',
    '',
    'HH:MM AM/PM',
    'HH:MM AM/PM',
    'HH:MM AM/PM',
    '',
    '',
    'Yes, No',
    'HH:MM AM/PM',
    '',
  ]

  // Row 3: tip row
  const tipRow = [
    'Tip: List multiple teams with commas (Varsity, JV) OR use separate rows with the same date+opponent for different times per team',
    '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]

  // Row 4: Use Case 1 example — comma-separated teams, shared times
  const example1 = [
    '04/20/2026',
    'Game',
    'Varsity, JV',
    'Lincoln High',
    'Home',
    'Memorial Field',
    '123 Main St Springfield IL',
    '4:30 PM',
    '3:45 PM',
    '7:00 PM',
    'Home whites',
    'Senior night',
    'No',
    '',
    '',
  ]

  // Row 5: Use Case 2 example — Varsity row (primary times)
  const example2a = [
    '04/21/2026',
    'Game',
    'Varsity',
    'Springfield High',
    'Away',
    'Springfield HS',
    '456 Oak Ave Springfield IL',
    '5:00 PM',
    '4:15 PM',
    '7:30 PM',
    'Away grays',
    '',
    'No',
    '',
    '',
  ]

  // Row 6: Use Case 2 example — JV row (different time, same opponent)
  const example2b = [
    '04/21/2026',
    'Game',
    'JV',
    'Springfield High',
    'Away',
    'Springfield HS',
    '456 Oak Ave Springfield IL',
    '3:00 PM',
    '2:15 PM',
    '5:30 PM',
    'Away grays',
    '',
    'No',
    '',
    '',
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, validValues, tipRow, example1, example2a, example2b])

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, // Date
    { wch: 16 }, // Event Type
    { wch: 14 }, // Team
    { wch: 22 }, // Opponent
    { wch: 12 }, // Home/Away
    { wch: 24 }, // Location Name
    { wch: 32 }, // Location Address
    { wch: 12 }, // Start Time
    { wch: 13 }, // Arrival Time
    { wch: 12 }, // End Time
    { wch: 22 }, // Uniform Notes
    { wch: 22 }, // Notes
    { wch: 14 }, // Meal Required
    { wch: 12 }, // Meal Time
    { wch: 22 }, // Meal Notes
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
