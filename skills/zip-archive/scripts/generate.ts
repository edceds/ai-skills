import { readFileSync, writeFileSync } from "node:fs";

interface ZipInput {
  files: { name: string; content: string }[];
}

// ─── CRC32 ───────────────────────────────────────────────────────────────────

const CRC32_TABLE = new Uint32Array(256);
{
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC32_TABLE[n] = c;
  }
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── ZIP writer ──────────────────────────────────────────────────────────────

interface FileEntry {
  name: Buffer;
  content: Buffer;
  crc: number;
  localHeaderOffset: number;
}

function buildZip(files: { name: string; content: string }[]): Buffer {
  const entries: FileEntry[] = [];
  const parts: Buffer[] = [];
  let offset = 0;

  // Local file headers + data
  for (const file of files) {
    const nameBytes = Buffer.from(file.name, "utf-8");
    const contentBytes = Buffer.from(file.content, "utf-8");
    const crc = crc32(contentBytes);

    const localHeader = Buffer.alloc(30 + nameBytes.length);
    let pos = 0;

    // Local file header signature
    localHeader.writeUInt32LE(0x04034B50, pos); pos += 4;
    // Version needed
    localHeader.writeUInt16LE(20, pos); pos += 2;
    // General purpose bit flag (bit 11 = UTF-8)
    localHeader.writeUInt16LE(0x0800, pos); pos += 2;
    // Compression method (0 = stored)
    localHeader.writeUInt16LE(0, pos); pos += 2;
    // Last mod time/date (zero)
    localHeader.writeUInt16LE(0, pos); pos += 2;
    localHeader.writeUInt16LE(0, pos); pos += 2;
    // CRC-32
    localHeader.writeUInt32LE(crc, pos); pos += 4;
    // Compressed size
    localHeader.writeUInt32LE(contentBytes.length, pos); pos += 4;
    // Uncompressed size
    localHeader.writeUInt32LE(contentBytes.length, pos); pos += 4;
    // File name length
    localHeader.writeUInt16LE(nameBytes.length, pos); pos += 2;
    // Extra field length
    localHeader.writeUInt16LE(0, pos); pos += 2;
    // File name
    nameBytes.copy(localHeader, pos);

    entries.push({ name: nameBytes, content: contentBytes, crc, localHeaderOffset: offset });
    parts.push(localHeader, contentBytes);
    offset += localHeader.length + contentBytes.length;
  }

  const centralDirOffset = offset;

  // Central directory headers
  for (const entry of entries) {
    const cdHeader = Buffer.alloc(46 + entry.name.length);
    let pos = 0;

    // Central directory file header signature
    cdHeader.writeUInt32LE(0x02014B50, pos); pos += 4;
    // Version made by
    cdHeader.writeUInt16LE(20, pos); pos += 2;
    // Version needed
    cdHeader.writeUInt16LE(20, pos); pos += 2;
    // General purpose bit flag
    cdHeader.writeUInt16LE(0x0800, pos); pos += 2;
    // Compression method
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    // Last mod time/date
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    // CRC-32
    cdHeader.writeUInt32LE(entry.crc, pos); pos += 4;
    // Compressed size
    cdHeader.writeUInt32LE(entry.content.length, pos); pos += 4;
    // Uncompressed size
    cdHeader.writeUInt32LE(entry.content.length, pos); pos += 4;
    // File name length
    cdHeader.writeUInt16LE(entry.name.length, pos); pos += 2;
    // Extra field length
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    // File comment length
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    // Disk number start
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    // Internal file attributes
    cdHeader.writeUInt16LE(0, pos); pos += 2;
    // External file attributes
    cdHeader.writeUInt32LE(0, pos); pos += 4;
    // Relative offset of local header
    cdHeader.writeUInt32LE(entry.localHeaderOffset, pos); pos += 4;
    // File name
    entry.name.copy(cdHeader, pos);

    parts.push(cdHeader);
    offset += cdHeader.length;
  }

  const centralDirSize = offset - centralDirOffset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  let pos = 0;
  eocd.writeUInt32LE(0x06054B50, pos); pos += 4;  // EOCD signature
  eocd.writeUInt16LE(0, pos); pos += 2;            // Disk number
  eocd.writeUInt16LE(0, pos); pos += 2;            // Disk with central dir
  eocd.writeUInt16LE(entries.length, pos); pos += 2; // Entries on this disk
  eocd.writeUInt16LE(entries.length, pos); pos += 2; // Total entries
  eocd.writeUInt32LE(centralDirSize, pos); pos += 4; // Central dir size
  eocd.writeUInt32LE(centralDirOffset, pos); pos += 4; // Central dir offset
  eocd.writeUInt16LE(0, pos); pos += 2;            // Comment length

  parts.push(eocd);
  return Buffer.concat(parts);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--stdin")) {
    console.error("Usage: generate.ts --stdin [--out file.zip]");
    process.exit(1);
  }

  const input: ZipInput = JSON.parse(readFileSync(0, "utf-8"));
  const zip = buildZip(input.files);

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const out = get("--out");
  if (out) {
    writeFileSync(out, zip);
    console.log(JSON.stringify({ ok: true, file: out, size: zip.length, entries: input.files.length }));
  } else {
    console.log(JSON.stringify({
      base64: zip.toString("base64"),
      size: zip.length,
      entries: input.files.length,
    }));
  }
}

main();
