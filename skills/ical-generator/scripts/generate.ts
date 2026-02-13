import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

interface Attendee {
  name: string;
  email: string;
  rsvp?: boolean;
}

interface EventInput {
  summary: string;
  description?: string;
  start: string;
  end: string;
  timezone?: string;
  location?: string;
  organizer?: { name: string; email: string };
  attendees?: Attendee[];
  alarm?: { minutes_before: number };
  rrule?: string;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  url?: string;
}

interface CalendarInput {
  events: EventInput[];
  calendar_name?: string;
  method?: string;
}

// ─── iCal formatting helpers ─────────────────────────────────────────────────

function formatDateTime(iso: string, tz?: string): string {
  // Convert ISO 8601 to iCal format: 20250315T140000
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");

  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  if (tz) return dateStr; // TZID will be added as parameter
  return dateStr + "Z"; // UTC
}

function foldLine(line: string): string {
  // RFC 5545: lines should not exceed 75 octets; fold with CRLF + space
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    result.push(remaining.slice(0, 75));
    remaining = " " + remaining.slice(75);
  }
  result.push(remaining);
  return result.join("\r\n");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// ─── Generate .ics content ───────────────────────────────────────────────────

function generateIcal(input: CalendarInput): string {
  const lines: string[] = [];

  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//ai-skills//ical-generator//EN");
  lines.push("CALSCALE:GREGORIAN");

  if (input.method) {
    lines.push(`METHOD:${input.method}`);
  }

  if (input.calendar_name) {
    lines.push(`X-WR-CALNAME:${escapeText(input.calendar_name)}`);
  }

  for (const event of input.events) {
    lines.push("BEGIN:VEVENT");

    // UID
    const uid = randomUUID() + "@ai-skills";
    lines.push(`UID:${uid}`);

    // Timestamps
    const now = formatDateTime(new Date().toISOString());
    lines.push(`DTSTAMP:${now}`);

    // Start/End with optional timezone
    if (event.timezone) {
      lines.push(`DTSTART;TZID=${event.timezone}:${formatDateTime(event.start, event.timezone)}`);
      lines.push(`DTEND;TZID=${event.timezone}:${formatDateTime(event.end, event.timezone)}`);
    } else {
      lines.push(`DTSTART:${formatDateTime(event.start)}`);
      lines.push(`DTEND:${formatDateTime(event.end)}`);
    }

    // Summary (required)
    lines.push(`SUMMARY:${escapeText(event.summary)}`);

    // Optional fields
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }
    if (event.status) {
      lines.push(`STATUS:${event.status}`);
    }

    // Recurrence
    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }

    // Organizer
    if (event.organizer) {
      lines.push(`ORGANIZER;CN=${escapeText(event.organizer.name)}:mailto:${event.organizer.email}`);
    }

    // Attendees
    if (event.attendees) {
      for (const att of event.attendees) {
        let attLine = `ATTENDEE;CN=${escapeText(att.name)}`;
        if (att.rsvp) attLine += ";RSVP=TRUE";
        attLine += `:mailto:${att.email}`;
        lines.push(attLine);
      }
    }

    // Alarm
    if (event.alarm) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeText(event.summary)} reminder`);
      lines.push(`TRIGGER:-PT${event.alarm.minutes_before}M`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // Fold long lines and join with CRLF
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--stdin")) {
    console.error("Usage: generate.ts --stdin [--out file.ics]");
    process.exit(1);
  }

  const input: CalendarInput = JSON.parse(readFileSync(0, "utf-8"));
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const ics = generateIcal(input);

  const out = get("--out");
  if (out) {
    writeFileSync(out, ics, "utf-8");
    console.log(JSON.stringify({ ok: true, file: out, size: ics.length, events: input.events.length }));
  } else {
    process.stdout.write(ics);
  }
}

main();
