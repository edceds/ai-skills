#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { skills } from "./index.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ai-skills",
    version: "0.1.0",
  });

  // ─── generate_qr_code ──────────────────────────────────────────────────

  server.tool(
    "generate_qr_code",
    "Generate a QR code as SVG from text or a URL. Returns scannable QR code SVG markup.",
    {
      data: z.string().describe("Text or URL to encode in the QR code"),
      size: z.number().optional().describe("Image size in pixels (default: 256)"),
      ecl: z.enum(["L", "M", "Q", "H"]).optional().describe("Error correction level (default: M)"),
      fg: z.string().optional().describe("Foreground color hex (default: #000000)"),
      bg: z.string().optional().describe("Background color hex (default: #ffffff)"),
    },
    async ({ data, size, ecl, fg, bg }) => {
      try {
        const svg = skills.generateQrCode({ data, size, ecl, fg, bg });
        return { content: [{ type: "text", text: svg }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── build_pdf ─────────────────────────────────────────────────────────

  server.tool(
    "build_pdf",
    "Generate a PDF document from structured content (title, paragraphs, headings, tables, lists). Returns base64-encoded PDF.",
    {
      title: z.string().optional().describe("Document title"),
      author: z.string().optional().describe("Author name"),
      date: z.string().optional().describe("Document date"),
      body: z.array(z.union([
        z.string(),
        z.object({ heading: z.string() }),
        z.object({ table: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }) }),
        z.object({ list: z.array(z.string()) }),
      ])).describe("Document body: strings for paragraphs, or objects for headings/tables/lists"),
      footer: z.string().optional().describe("Footer text ({page} for page number)"),
      pageSize: z.enum(["letter", "a4"]).optional().describe("Page size (default: letter)"),
    },
    async ({ title, author, date, body, footer, pageSize }) => {
      try {
        const result = skills.buildPdf({ title, author, date, body: body as any, footer, pageSize });
        return {
          content: [
            { type: "text", text: `PDF generated: ${result.pages} page(s), ${result.size} bytes` },
            { type: "text", text: `Base64: ${result.base64}` },
          ],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── build_spreadsheet ─────────────────────────────────────────────────

  server.tool(
    "build_spreadsheet",
    "Generate a CSV or TSV spreadsheet with proper RFC 4180 escaping, formula support, and summary rows.",
    {
      headers: z.array(z.string()).describe("Column headers"),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).describe("Data rows"),
      summary: z.record(z.string(), z.enum(["sum", "avg", "min", "max", "count"])).optional().describe("Summary row: column name → aggregation function"),
      format: z.enum(["csv", "tsv"]).optional().describe("Output format (default: csv)"),
      formulas: z.boolean().optional().describe("Process =SUM, {row} placeholders (default: false)"),
    },
    async ({ headers, rows, summary, format, formulas }) => {
      try {
        const csv = skills.buildSpreadsheet({ headers, rows, summary: summary as any, format, formulas });
        return { content: [{ type: "text", text: csv }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── generate_ical ─────────────────────────────────────────────────────

  server.tool(
    "generate_ical",
    "Generate an iCalendar (.ics) file with events, recurrence rules, attendees, and alarms. RFC 5545 compliant.",
    {
      events: z.array(z.object({
        summary: z.string().describe("Event title"),
        start: z.string().describe("Start time (ISO 8601)"),
        end: z.string().describe("End time (ISO 8601)"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        timezone: z.string().optional().describe("IANA timezone (e.g. America/New_York)"),
        organizer: z.object({ name: z.string(), email: z.string() }).optional(),
        attendees: z.array(z.object({
          name: z.string(), email: z.string(), rsvp: z.boolean().optional(),
        })).optional(),
        alarm: z.object({ minutes_before: z.number() }).optional().describe("Reminder alarm"),
        rrule: z.string().optional().describe("RFC 5545 recurrence rule (e.g. FREQ=WEEKLY;COUNT=10)"),
        status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).optional(),
        url: z.string().optional().describe("Event URL"),
      })).describe("Calendar events"),
      calendar_name: z.string().optional().describe("Calendar name"),
      method: z.string().optional().describe("iCal method (e.g. REQUEST, PUBLISH)"),
    },
    async ({ events, calendar_name, method }) => {
      try {
        const ics = skills.generateIcal({ events: events as any, calendar_name, method });
        return { content: [{ type: "text", text: ics }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── generate_chart ────────────────────────────────────────────────────

  server.tool(
    "generate_chart",
    "Generate an SVG chart from data. Supports bar, line, pie, and scatter chart types.",
    {
      type: z.enum(["bar", "line", "pie", "scatter"]).describe("Chart type"),
      data: z.union([
        z.record(z.string(), z.number()).describe("Key-value data for bar/pie charts"),
        z.array(z.array(z.number()).length(2)).describe("XY pairs for line/scatter charts"),
      ]).describe("Chart data"),
      title: z.string().optional().describe("Chart title"),
      width: z.number().optional().describe("Chart width in pixels (default: 600)"),
      height: z.number().optional().describe("Chart height in pixels (default: 400)"),
    },
    async ({ type, data, title, width, height }) => {
      try {
        const svg = skills.generateChart({ type, data: data as any, title, width, height });
        return { content: [{ type: "text", text: svg }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── generate_vcard ────────────────────────────────────────────────────

  server.tool(
    "generate_vcard",
    "Generate a vCard 4.0 (.vcf) contact file. RFC 6350 compliant.",
    {
      name: z.object({
        given: z.string().describe("First name"),
        family: z.string().describe("Last name"),
        prefix: z.string().optional().describe("Prefix (e.g. Dr.)"),
        suffix: z.string().optional().describe("Suffix (e.g. PhD)"),
      }).describe("Contact name"),
      org: z.string().optional().describe("Organization name"),
      title: z.string().optional().describe("Job title"),
      email: z.union([z.string(), z.array(z.string())]).optional().describe("Email address(es)"),
      phone: z.union([z.string(), z.array(z.string())]).optional().describe("Phone number(s)"),
      address: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        country: z.string().optional(),
      }).optional().describe("Postal address"),
      url: z.string().optional().describe("Website URL"),
      note: z.string().optional().describe("Freeform note"),
    },
    async (input) => {
      try {
        const vcf = skills.generateVCard(input as any);
        return { content: [{ type: "text", text: vcf }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── generate_barcode ──────────────────────────────────────────────────

  server.tool(
    "generate_barcode",
    "Generate a Code128 1D barcode as SVG. Returns scannable barcode SVG markup.",
    {
      data: z.string().describe("Text to encode in the barcode"),
      width: z.number().optional().describe("Image width in pixels (default: 300)"),
      height: z.number().optional().describe("Bar height in pixels (default: 80)"),
      show_text: z.boolean().optional().describe("Show text label below barcode (default: true)"),
    },
    async ({ data, width, height, show_text }) => {
      try {
        const svg = skills.generateBarcode({ data, width, height, show_text });
        return { content: [{ type: "text", text: svg }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── generate_wav ──────────────────────────────────────────────────────

  server.tool(
    "generate_wav",
    "Generate a WAV audio file (tone/beep). Returns base64-encoded PCM audio.",
    {
      frequency: z.number().describe("Tone frequency in Hz (20–20000)"),
      duration: z.number().describe("Duration in seconds (0–30)"),
      sample_rate: z.number().optional().describe("Sample rate (default: 44100)"),
      volume: z.number().optional().describe("Volume 0.0–1.0 (default: 0.8)"),
      waveform: z.enum(["sine", "square", "sawtooth"]).optional().describe("Waveform type (default: sine)"),
    },
    async ({ frequency, duration, sample_rate, volume, waveform }) => {
      try {
        const result = skills.generateWav({ frequency, duration, sample_rate, volume, waveform });
        return {
          content: [
            { type: "text", text: `WAV generated: ${result.duration}s at ${result.frequency}Hz, ${result.size} bytes` },
            { type: "text", text: `Base64: ${result.base64}` },
          ],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── generate_hash ─────────────────────────────────────────────────────

  server.tool(
    "generate_hash",
    "Compute a cryptographic hash (SHA-256, SHA-512, MD5, SHA-1) or HMAC signature.",
    {
      data: z.string().describe("Data to hash"),
      algorithm: z.enum(["sha256", "sha512", "md5", "sha1"]).optional().describe("Hash algorithm (default: sha256)"),
      encoding: z.enum(["hex", "base64"]).optional().describe("Output encoding (default: hex)"),
      hmac_key: z.string().optional().describe("HMAC secret key (if provided, computes HMAC)"),
    },
    async ({ data, algorithm, encoding, hmac_key }) => {
      try {
        const result = skills.generateHash({ data, algorithm, encoding, hmac_key });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // ─── create_zip ────────────────────────────────────────────────────────

  server.tool(
    "create_zip",
    "Create a ZIP archive from file entries. Returns base64-encoded ZIP.",
    {
      files: z.array(z.object({
        name: z.string().describe("File path within archive"),
        content: z.string().describe("File content (text)"),
      })).describe("Files to include in the archive"),
    },
    async ({ files }) => {
      try {
        const result = skills.createZip({ files });
        return {
          content: [
            { type: "text", text: `ZIP created: ${result.entries} files, ${result.size} bytes` },
            { type: "text", text: `Base64: ${result.base64}` },
          ],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  return server;
}

// Run standalone
if (process.argv[1]?.includes("mcp")) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("MCP server error:", err);
    process.exit(1);
  });
}
