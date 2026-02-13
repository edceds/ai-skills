import { readFileSync, writeFileSync } from "node:fs";

interface NameInput {
  given: string;
  family: string;
  prefix?: string;
  suffix?: string;
}

interface AddressInput {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface VCardInput {
  name: NameInput;
  org?: string;
  title?: string;
  email?: string | string[];
  phone?: string | string[];
  address?: AddressInput;
  url?: string;
  note?: string;
  photo_base64?: string;
}

// ─── vCard 4.0 (RFC 6350) ────────────────────────────────────────────────────

function escapeValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 6350: lines SHOULD be no longer than 75 octets. Fold with CRLF + space.
  const result: string[] = [];
  let remaining = line;
  while (Buffer.byteLength(remaining, "utf-8") > 75) {
    // Find a safe cut point at 75 bytes
    let cut = 75;
    while (cut > 0 && Buffer.byteLength(remaining.slice(0, cut), "utf-8") > 75) cut--;
    if (cut === 0) cut = 1; // at least one char
    result.push(remaining.slice(0, cut));
    remaining = " " + remaining.slice(cut);
  }
  result.push(remaining);
  return result.join("\r\n");
}

function generateVCard(input: VCardInput): string {
  const lines: string[] = [];

  lines.push("BEGIN:VCARD");
  lines.push("VERSION:4.0");
  lines.push("PRODID:-//ai-skills//vcard-generator//EN");

  // FN (formatted name) — required
  const fn = [input.name.prefix, input.name.given, input.name.family, input.name.suffix]
    .filter(Boolean).join(" ");
  lines.push(`FN:${escapeValue(fn)}`);

  // N (structured name)
  const n = [
    escapeValue(input.name.family),
    escapeValue(input.name.given),
    "", // additional names
    escapeValue(input.name.prefix ?? ""),
    escapeValue(input.name.suffix ?? ""),
  ].join(";");
  lines.push(`N:${n}`);

  // ORG
  if (input.org) lines.push(`ORG:${escapeValue(input.org)}`);

  // TITLE
  if (input.title) lines.push(`TITLE:${escapeValue(input.title)}`);

  // EMAIL (can be string or array)
  const emails = Array.isArray(input.email) ? input.email : input.email ? [input.email] : [];
  for (const email of emails) {
    lines.push(`EMAIL:${email}`);
  }

  // TEL (can be string or array)
  const phones = Array.isArray(input.phone) ? input.phone : input.phone ? [input.phone] : [];
  for (const phone of phones) {
    lines.push(`TEL;TYPE=voice;VALUE=uri:tel:${phone.replace(/\s/g, "")}`);
  }

  // ADR
  if (input.address) {
    const a = input.address;
    const adr = [
      "", // PO box
      "", // extended address
      escapeValue(a.street ?? ""),
      escapeValue(a.city ?? ""),
      escapeValue(a.state ?? ""),
      escapeValue(a.zip ?? ""),
      escapeValue(a.country ?? ""),
    ].join(";");
    lines.push(`ADR;TYPE=work:${adr}`);
  }

  // URL
  if (input.url) lines.push(`URL:${input.url}`);

  // NOTE
  if (input.note) lines.push(`NOTE:${escapeValue(input.note)}`);

  // PHOTO (base64 embedded)
  if (input.photo_base64) {
    lines.push(`PHOTO;ENCODING=b;MEDIATYPE=image/jpeg:${input.photo_base64}`);
  }

  // REV (timestamp)
  lines.push(`REV:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`);

  lines.push("END:VCARD");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--stdin")) {
    console.error("Usage: generate.ts --stdin [--out file.vcf]");
    process.exit(1);
  }

  const input: VCardInput = JSON.parse(readFileSync(0, "utf-8"));
  const vcf = generateVCard(input);

  const outIdx = args.indexOf("--out");
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], vcf, "utf-8");
    console.log(JSON.stringify({ ok: true, file: args[outIdx + 1], size: vcf.length }));
  } else {
    process.stdout.write(vcf);
  }
}

main();
