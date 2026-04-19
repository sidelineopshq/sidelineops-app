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

  // Row 2: valid-values hints (gray italic in supporting tools)
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

  // Row 3: example data row
  const exampleRow = [
    '04/15/2026',
    'Game',
    'Varsity',
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

  const ws = XLSX.utils.aoa_to_sheet([headers, validValues, exampleRow])

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
