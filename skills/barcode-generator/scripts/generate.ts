import { writeFileSync } from "node:fs";

// ─── Code128 encoder ─────────────────────────────────────────────────────────

// Code128 encoding tables — each symbol is 6 alternating bar/space widths (11 modules total)
const CODE128_PATTERNS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1],[2,1,1,1,3,2],
];

// Stop pattern: 2,3,3,1,1,1,2 (13 modules)
const STOP_PATTERN = [2, 3, 3, 1, 1, 1, 2];

// Code128B start code
const START_B = 104;

function encodeCode128B(data: string): number[] {
  const symbols: number[] = [START_B];

  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    if (code < 32 || code > 126) throw new Error(`Character '${data[i]}' (${code}) not supported in Code128B`);
    symbols.push(code - 32);
  }

  // Check digit
  let checksum = symbols[0];
  for (let i = 1; i < symbols.length; i++) {
    checksum += symbols[i] * i;
  }
  symbols.push(checksum % 103);

  return symbols;
}

function symbolsToModules(symbols: number[]): boolean[] {
  const modules: boolean[] = [];

  for (const sym of symbols) {
    const pattern = CODE128_PATTERNS[sym];
    let bar = true;
    for (const width of pattern) {
      for (let i = 0; i < width; i++) modules.push(bar);
      bar = !bar;
    }
  }

  // Stop pattern
  let bar = true;
  for (const width of STOP_PATTERN) {
    for (let i = 0; i < width; i++) modules.push(bar);
    bar = !bar;
  }

  return modules;
}

function barcodeSvg(data: string, width: number, height: number, showText: boolean): string {
  const symbols = encodeCode128B(data);
  const modules = symbolsToModules(symbols);

  const quietZone = 10; // quiet zone modules on each side
  const totalModules = modules.length + quietZone * 2;
  const moduleWidth = width / totalModules;
  const barHeight = showText ? height - 20 : height;

  const bars: string[] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i]) {
      const x = (i + quietZone) * moduleWidth;
      bars.push(`<rect x="${x.toFixed(2)}" y="0" width="${moduleWidth.toFixed(2)}" height="${barHeight}" fill="#000"/>`);
    }
  }

  const textEl = showText
    ? `<text x="${width / 2}" y="${height - 4}" text-anchor="middle" font-family="monospace" font-size="14" fill="#000">${data.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="white"/>
${bars.join("\n")}
${textEl}
</svg>`;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const data = get("--data");
  if (!data) { console.error("Usage: generate.ts --data <text> [options]"); process.exit(1); }

  const width = parseInt(get("--width") ?? "300");
  const height = parseInt(get("--height") ?? "80");
  const showText = !args.includes("--no-text");

  const svg = barcodeSvg(data, width, height, showText);

  const out = get("--out");
  if (out) {
    writeFileSync(out, svg);
    console.log(JSON.stringify({ ok: true, file: out, size: svg.length }));
  } else {
    process.stdout.write(svg);
  }
}

main();
