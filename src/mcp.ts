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
