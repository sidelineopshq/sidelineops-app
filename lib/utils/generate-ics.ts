export type IcsSlot = {
  eventDate:       string        // YYYY-MM-DD
  eventTitle:      string
  roleName:        string
  startTime:       string | null // HH:MM or HH:MM:SS
  endTime:         string | null
  locationName:    string | null
  locationAddress: string | null
}

function icsDatetime(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const [h, min]  = timeStr.split(':')
  return `${y}${m}${d}T${h}${min}00`
}

function addHours(timeStr: string, hours: number): string {
  const [h, min] = timeStr.split(':').map(Number)
  const newH = (h + hours) % 24
  return `${newH.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}@sidelineops`
}

export function generateVolunteerIcs(slots: IcsSlot[], _volunteerName: string): string {
  const vevents = slots.map(slot => {
    const lines: string[] = ['BEGIN:VEVENT', `UID:${uid()}`]

    lines.push(`SUMMARY:Volunteer: ${slot.roleName} — ${slot.eventTitle}`)

    if (slot.startTime) {
      const dtstart = icsDatetime(slot.eventDate, slot.startTime)
      const endT    = slot.endTime ?? addHours(slot.startTime, 2)
      const dtend   = icsDatetime(slot.eventDate, endT)
      lines.push(`DTSTART;TZID=America/Chicago:${dtstart}`)
      lines.push(`DTEND;TZID=America/Chicago:${dtend}`)
    } else {
      const dateOnly = slot.eventDate.replace(/-/g, '')
      lines.push(`DTSTART;VALUE=DATE:${dateOnly}`)
      lines.push(`DTEND;VALUE=DATE:${dateOnly}`)
    }

    const location = [slot.locationName, slot.locationAddress].filter(Boolean).join(', ')
    if (location) lines.push(`LOCATION:${location}`)

    lines.push(
      `DESCRIPTION:You're signed up to volunteer as ${slot.roleName} for ${slot.eventTitle}.`,
    )
    lines.push('END:VEVENT')

    return lines.join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SidelineOps//Volunteer Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n')
}
