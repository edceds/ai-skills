import { writeFileSync } from "node:fs";

// ─── QR Code encoder (byte mode, versions 1-10) ─────────────────────────────

type ECL = "L" | "M" | "Q" | "H";

// Total codewords per version (versions 1-10)
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

// EC codewords per block for each ECL (versions 1-10)
const EC_PER_BLOCK: Record<ECL, number[]> = {
  L: [7, 10, 15, 20, 18, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};

// Number of EC blocks for each ECL (versions 1-10)
const EC_BLOCKS: Record<ECL, number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

// Data capacity in bytes per version per ECL
const DATA_CAPACITY: Record<ECL, number[]> = {
  L: [19, 34, 55, 80, 108, 136, 156, 194, 232, 274],
  M: [16, 28, 44, 64, 86, 108, 124, 154, 182, 216],
  Q: [13, 22, 34, 48, 62, 76, 88, 110, 132, 154],
  H: [9, 16, 26, 36, 46, 60, 66, 86, 100, 122],
};

const ALIGNMENT_POSITIONS: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const GF256_EXP = new Uint8Array(256);
const GF256_LOG = new Uint8Array(256);
{
  let v = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = v;
    GF256_LOG[v] = i;
    v = (v << 1) ^ (v >= 128 ? 0x11d : 0);
  }
  GF256_EXP[255] = GF256_EXP[0];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] + GF256_LOG[b]) % 255];
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen: number[] = new Array(ecCount + 1).fill(0);
  gen[0] = 1;
  for (let i = 0; i < ecCount; i++) {
    for (let j = i + 1; j >= 1; j--) {
      gen[j] = gen[j] ^ gfMul(gen[j - 1], GF256_EXP[i]);
    }
  }

  const result = new Array(ecCount).fill(0);
  for (const b of data) {
    const lead = b ^ result[0];
    for (let i = 0; i < ecCount - 1; i++) {
      result[i] = result[i + 1] ^ gfMul(gen[i + 1], lead);
    }
    result[ecCount - 1] = gfMul(gen[ecCount], lead);
  }
  return result;
}

function chooseVersion(dataLen: number, ecl: ECL): number {
  const caps = DATA_CAPACITY[ecl];
  for (let v = 0; v < caps.length; v++) {
    // byte mode: 4 mode + 8/16 char count + data bytes * 8
    const charCountBits = v < 9 ? 8 : 16;
    const totalBits = 4 + charCountBits + dataLen * 8;
    const totalBytes = Math.ceil(totalBits / 8);
    if (totalBytes <= caps[v]) return v + 1;
  }
  throw new Error(`Data too long for QR versions 1-10 (${dataLen} bytes, ECL ${ecl})`);
}

function encodeData(text: string, version: number, ecl: ECL): number[] {
  const bytes = Buffer.from(text, "utf-8");
  const bits: number[] = [];

  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  // Mode: byte (0100)
  push(0b0100, 4);
  // Character count
  const ccBits = version <= 9 ? 8 : 16;
  push(bytes.length, ccBits);
  // Data
  for (const b of bytes) push(b, 8);
  // Terminator
  const totalModules = DATA_CAPACITY[ecl][version - 1];
  const totalBits = totalModules * 8;
  const termLen = Math.min(4, totalBits - bits.length);
  push(0, termLen);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);
  // Pad bytes
  let padToggle = false;
  while (bits.length < totalBits) {
    push(padToggle ? 0x11 : 0xec, 8);
    padToggle = !padToggle;
  }

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ?? 0);
    dataBytes.push(b);
  }

  // Add EC codewords (single-block simplified — works for small versions)
  const ecCount = EC_PER_BLOCK[ecl][version - 1];
  const ec = rsEncode(dataBytes, ecCount);
  return [...dataBytes, ...ec];
}

function createMatrix(version: number): { size: number; matrix: number[][]; reserved: boolean[][] } {
  const size = 17 + version * 4;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  // Finder patterns
  const placeFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inBorder = r === -1 || r === 7 || c === -1 || c === 7;
        matrix[rr][cc] = (inOuter || inInner) && !inBorder ? 1 : 0;
        reserved[rr][cc] = true;
      }
    }
  };

  placeFinderPattern(0, 0);
  placeFinderPattern(0, size - 7);
  placeFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    reserved[6][i] = true;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
    reserved[i][6] = true;
  }

  // Alignment patterns (version >= 2)
  if (version >= 2) {
    const positions = ALIGNMENT_POSITIONS[version];
    for (const r of positions) {
      for (const c of positions) {
        if (reserved[r]?.[c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
            const edge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const center = dr === 0 && dc === 0;
            matrix[rr][cc] = edge || center ? 1 : 0;
            reserved[rr][cc] = true;
          }
        }
      }
    }
  }

  // Dark module
  matrix[size - 8][8] = 1;
  reserved[size - 8][8] = true;

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i < size) reserved[8][i] = true;
    if (i < size) reserved[i][8] = true;
    if (size - 1 - i >= 0) reserved[8][size - 1 - i] = true;
    if (size - 1 - i >= 0) reserved[size - 1 - i][8] = true;
  }

  return { size, matrix, reserved };
}

function placeData(matrix: number[][], reserved: boolean[][], codewords: number[], size: number): void {
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  const getBit = (): number => {
    if (bitIdx >= totalBits) return 0;
    const byte = codewords[Math.floor(bitIdx / 8)];
    const bit = (byte >> (7 - (bitIdx % 8))) & 1;
    bitIdx++;
    return bit;
  };

  let col = size - 1;
  let upward = true;

  while (col >= 0) {
    if (col === 6) col--; // skip timing column
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= size) continue;
        if (reserved[row][c]) continue;
        matrix[row][c] = getBit();
      }
    }

    col -= 2;
    upward = !upward;
  }
}

function applyMask(matrix: number[][], reserved: boolean[][], size: number): void {
  // Mask pattern 0: (row + col) % 2 === 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if ((r + c) % 2 === 0) matrix[r][c] ^= 1;
    }
  }
}

function placeFormatInfo(matrix: number[][], size: number, ecl: ECL): void {
  const eclBits: Record<ECL, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };
  const maskPattern = 0; // mask 0
  let formatInfo = (eclBits[ecl] << 3) | maskPattern;

  // BCH encoding for format info
  let data = formatInfo << 10;
  let gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((data >> i) & 1) data ^= gen << (i - 10);
  }
  formatInfo = ((eclBits[ecl] << 3 | maskPattern) << 10) | data;
  formatInfo ^= 0b101010000010010;

  // Place around top-left finder
  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) bits.push((formatInfo >> i) & 1);

  // Horizontal (row 8)
  const hPositions = [0, 1, 2, 3, 4, 5, 7, 8, size - 8, size - 7, size - 6, size - 5, size - 4, size - 3, size - 2];
  for (let i = 0; i < 15; i++) matrix[8][hPositions[i]] = bits[i];

  // Vertical (col 8)
  const vPositions = [size - 1, size - 2, size - 3, size - 4, size - 5, size - 6, size - 7, 8, 7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 15; i++) matrix[vPositions[i]][8] = bits[i];
}

function matrixToSvg(matrix: number[][], size: number, px: number, fg: string, bg: string, quiet: number): string {
  const totalModules = size + quiet * 2;
  const moduleSize = px / totalModules;
  const rects: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = (c + quiet) * moduleSize;
        const y = (r + quiet) * moduleSize;
        rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" fill="${fg}"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}">
<rect width="${px}" height="${px}" fill="${bg}"/>
${rects.join("\n")}
</svg>`;
}

function generateQR(text: string, ecl: ECL, px: number, fg: string, bg: string, quiet: number): string {
  const version = chooseVersion(Buffer.byteLength(text, "utf-8"), ecl);
  const codewords = encodeData(text, version, ecl);
  const { size, matrix, reserved } = createMatrix(version);
  placeData(matrix, reserved, codewords, size);
  applyMask(matrix, reserved, size);
  placeFormatInfo(matrix, size, ecl);
  return matrixToSvg(matrix, size, px, fg, bg, quiet);
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

  const size = parseInt(get("--size") ?? "256");
  const ecl = (get("--ecl") ?? "M") as ECL;
  const fg = get("--fg") ?? "#000000";
  const bg = get("--bg") ?? "#ffffff";
  const quiet = parseInt(get("--quiet") ?? "4");

  const svg = generateQR(data, ecl, size, fg, bg, quiet);

  const out = get("--out");
  if (out) {
    writeFileSync(out, svg);
    console.log(JSON.stringify({ ok: true, file: out, size: svg.length }));
  } else {
    process.stdout.write(svg);
  }
}

main();
