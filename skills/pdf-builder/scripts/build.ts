import { readFileSync, writeFileSync } from "node:fs";

// ─── Minimal PDF writer (PDF 1.4) ───────────────────────────────────────────

interface PDFObj {
  id: number;
  data: string;
}

class PDFWriter {
  private objects: PDFObj[] = [];
  private pages: number[] = [];
  private catalogId = 0;
  private pagesId = 0;
  private fontId = 0;
  private fontBoldId = 0;
  private nextId = 1;
  private pageWidth: number;
  private pageHeight: number;

  constructor(pageSize: "letter" | "a4" = "letter") {
    this.pageWidth = pageSize === "a4" ? 595 : 612;
    this.pageHeight = pageSize === "a4" ? 842 : 792;

    this.fontId = this.addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    this.fontBoldId = this.addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
    this.pagesId = this.nextId++;
    this.catalogId = this.addObj(`<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`);
  }

  private addObj(data: string): number {
    const id = this.nextId++;
    this.objects.push({ id, data });
    return id;
  }

  addPage(streamContent: string): void {
    const streamBytes = Buffer.byteLength(streamContent, "latin1");
    const streamId = this.addObj(`<< /Length ${streamBytes} >>\nstream\n${streamContent}\nendstream`);
    const pageId = this.addObj(
      `<< /Type /Page /Parent ${this.pagesId} 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] ` +
      `/Contents ${streamId} 0 R /Resources << /Font << /F1 ${this.fontId} 0 R /F2 ${this.fontBoldId} 0 R >> >> >>`
    );
    this.pages.push(pageId);
  }

  build(): Buffer {
    // Insert Pages object
    const pagesData = `<< /Type /Pages /Kids [${this.pages.map((p) => `${p} 0 R`).join(" ")}] /Count ${this.pages.length} >>`;
    this.objects.push({ id: this.pagesId, data: pagesData });

    // Sort by ID
    this.objects.sort((a, b) => a.id - b.id);

    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];

    for (const obj of this.objects) {
      offsets[obj.id] = Buffer.byteLength(pdf, "latin1");
      pdf += `${obj.id} 0 obj\n${obj.data}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${this.objects.length + 1}\n`;
    pdf += `0000000000 65535 f \n`;
    for (let i = 1; i <= this.objects.length; i++) {
      const off = offsets[i] ?? 0;
      pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${this.objects.length + 1} /Root ${this.catalogId} 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, "latin1");
  }

  get pageCount() { return this.pages.length; }
  get width() { return this.pageWidth; }
  get height() { return this.pageHeight; }
}

// ─── Content renderer ────────────────────────────────────────────────────────

function escPdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

interface DocInput {
  title?: string;
  author?: string;
  date?: string;
  body: (string | { heading: string } | { table: { headers: string[]; rows: string[][] } } | { list: string[] })[];
  footer?: string;
}

function renderDoc(doc: DocInput, pageSize: "letter" | "a4"): PDFWriter {
  const pdf = new PDFWriter(pageSize);
  const margin = 60;
  const lineHeight = 16;
  const maxWidth = pdf.width - margin * 2;
  let y = pdf.height - margin;
  let lines: string[] = [];
  let pageNum = 0;

  const flush = () => {
    pageNum++;
    if (doc.footer) {
      const footerText = doc.footer.replace("{page}", String(pageNum));
      lines.push(`BT /F1 9 Tf ${margin} 30 Td (${escPdf(footerText)}) Tj ET`);
    }
    pdf.addPage(lines.join("\n"));
    lines = [];
    y = pdf.height - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin + 40) flush();
  };

  const addText = (text: string, font: string, size: number, indent = 0) => {
    // Rough word-wrap: ~chars per line based on font size
    const charsPerLine = Math.floor(((maxWidth - indent) / size) * 1.8);
    const words = text.split(/\s+/);
    let line = "";

    for (const word of words) {
      if ((line + " " + word).length > charsPerLine && line) {
        ensureSpace(lineHeight);
        lines.push(`BT ${font} ${size} Tf ${margin + indent} ${y.toFixed(0)} Td (${escPdf(line.trim())}) Tj ET`);
        y -= lineHeight;
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line.trim()) {
      ensureSpace(lineHeight);
      lines.push(`BT ${font} ${size} Tf ${margin + indent} ${y.toFixed(0)} Td (${escPdf(line.trim())}) Tj ET`);
      y -= lineHeight;
    }
  };

  // Title
  if (doc.title) {
    addText(doc.title, "/F2", 20);
    y -= 8;
  }

  // Author + date
  if (doc.author || doc.date) {
    const meta = [doc.author, doc.date].filter(Boolean).join(" — ");
    addText(meta, "/F1", 10);
    y -= 12;
  }

  // Body
  for (const block of doc.body) {
    if (typeof block === "string") {
      addText(block, "/F1", 11);
      y -= 6;
    } else if ("heading" in block) {
      y -= 8;
      ensureSpace(lineHeight + 10);
      addText(block.heading, "/F2", 14);
      y -= 4;
    } else if ("list" in block) {
      for (const item of block.list) {
        addText(`•  ${item}`, "/F1", 11, 12);
      }
      y -= 4;
    } else if ("table" in block) {
      const { headers, rows } = block.table;
      const colCount = headers.length;
      const colWidth = (maxWidth) / colCount;

      ensureSpace((rows.length + 1) * lineHeight + 10);

      // Header row
      for (let c = 0; c < colCount; c++) {
        const x = margin + c * colWidth;
        lines.push(`BT /F2 10 Tf ${x.toFixed(0)} ${y.toFixed(0)} Td (${escPdf(headers[c])}) Tj ET`);
      }
      y -= lineHeight;

      // Separator line
      lines.push(`${margin} ${(y + 10).toFixed(0)} m ${(pdf.width - margin)} ${(y + 10).toFixed(0)} l S`);

      // Data rows
      for (const row of rows) {
        ensureSpace(lineHeight);
        for (let c = 0; c < colCount; c++) {
          const x = margin + c * colWidth;
          lines.push(`BT /F1 10 Tf ${x.toFixed(0)} ${y.toFixed(0)} Td (${escPdf(row[c] ?? "")}) Tj ET`);
        }
        y -= lineHeight;
      }
      y -= 8;
    }
  }

  // Flush last page
  if (lines.length > 0) flush();

  return pdf;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--stdin")) {
    console.error("Usage: build.ts --stdin [--out file.pdf] [--page-size letter|a4]");
    process.exit(1);
  }

  const doc: DocInput = JSON.parse(readFileSync(0, "utf-8"));
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const pageSize = (get("--page-size") ?? "letter") as "letter" | "a4";
  const pdf = renderDoc(doc, pageSize);
  const buffer = pdf.build();

  const out = get("--out");
  if (out) {
    writeFileSync(out, buffer);
    console.log(JSON.stringify({ ok: true, file: out, size: buffer.length, pages: pdf.pageCount }));
  } else {
    console.log(JSON.stringify({ base64: buffer.toString("base64"), size: buffer.length, pages: pdf.pageCount }));
  }
}

main();
