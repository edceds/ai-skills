---
name: ical-generator
description: Generate valid iCalendar (.ics) files for events, meetings, and schedules with support for recurrence rules, attendees, alarms, and timezones. Use when the user needs to create calendar events, meeting invites, or recurring schedules.
---

# iCalendar Generator

Generate RFC 5545-compliant .ics files. Zero external dependencies.

## Quick start

```bash
echo '{"events":[{"summary":"Team Standup","start":"2025-03-01T09:00:00","end":"2025-03-01T09:30:00","rrule":"FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"}]}' | npx tsx scripts/generate.ts --stdin
npx tsx scripts/generate.ts --stdin --out meeting.ics < event.json
```

## Input format (JSON)

```json
{
  "events": [
    {
      "summary": "Project Kickoff",
      "description": "Initial planning meeting",
      "start": "2025-03-15T14:00:00",
      "end": "2025-03-15T15:30:00",
      "timezone": "America/New_York",
      "location": "Conference Room A",
      "organizer": { "name": "Alice", "email": "alice@company.com" },
      "attendees": [
        { "name": "Bob", "email": "bob@company.com", "rsvp": true },
        { "name": "Charlie", "email": "charlie@company.com" }
      ],
      "alarm": { "minutes_before": 15 },
      "rrule": "FREQ=WEEKLY;COUNT=10",
      "status": "CONFIRMED",
      "url": "https://meet.example.com/kickoff"
    }
  ],
  "calendar_name": "Work",
  "method": "REQUEST"
}
```

## Fields

- **summary** — event title (required)
- **start** — ISO 8601 datetime (required)
- **end** — ISO 8601 datetime (required)
- **description** — event details
- **location** — physical or virtual location
- **timezone** — IANA timezone name
- **organizer** — `{ name, email }`
- **attendees** — array of `{ name, email, rsvp? }`
- **alarm** — `{ minutes_before }` — reminder
- **rrule** — RFC 5545 recurrence rule string
- **status** — CONFIRMED, TENTATIVE, or CANCELLED
- **url** — event URL

## Options

- `--stdin` — read JSON from stdin (required)
- `--out <file>` — write .ics to file (default: stdout)

## Output

Valid .ics text to stdout, or file with `--out`.
