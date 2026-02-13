import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"];

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Bar Chart ---
function barChart(data: Record<string, number>, title: string, w: number, h: number, colors: string[]): string {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const maxVal = Math.max(...values, 1);
  const padding = { top: title ? 50 : 20, bottom: 60, left: 60, right: 20 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const barW = Math.min(chartW / labels.length * 0.7, 80);
  const gap = chartW / labels.length;

  const bars = labels.map((label, i) => {
    const barH = (values[i] / maxVal) * chartH;
    const x = padding.left + i * gap + (gap - barW) / 2;
    const y = padding.top + chartH - barH;
    const color = colors[i % colors.length];
    return [
      `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="3"/>`,
      `<text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" font-size="12" fill="#666">${values[i]}</text>`,
      `<text x="${x + barW / 2}" y="${h - padding.bottom + 20}" text-anchor="middle" font-size="11" fill="#666">${escSvg(label)}</text>`,
    ].join("\n");
  }).join("\n");

  // Y-axis ticks
  const ticks = 5;
  const yAxis = Array.from({ length: ticks + 1 }, (_, i) => {
    const val = Math.round((maxVal / ticks) * i);
    const y = padding.top + chartH - (i / ticks) * chartH;
    return [
      `<line x1="${padding.left}" y1="${y}" x2="${w - padding.right}" y2="${y}" stroke="#eee" stroke-width="1"/>`,
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#999">${val}</text>`,
    ].join("\n");
  }).join("\n");

  const titleEl = title ? `<text x="${w / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#333">${escSvg(title)}</text>` : "";

  return svg(w, h, [yAxis, bars, titleEl].join("\n"));
}

// --- Line Chart ---
function lineChart(data: number[][], title: string, w: number, h: number, colors: string[]): string {
  const padding = { top: title ? 50 : 20, bottom: 40, left: 60, right: 20 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const xs = data.map((d) => d[0]);
  const ys = data.map((d) => d[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys, 1);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const toSvgX = (x: number) => padding.left + ((x - minX) / rangeX) * chartW;
  const toSvgY = (y: number) => padding.top + chartH - ((y - minY) / rangeY) * chartH;

  const points = data.map((d) => `${toSvgX(d[0])},${toSvgY(d[1])}`);
  const line = `<polyline points="${points.join(" ")}" fill="none" stroke="${colors[0]}" stroke-width="2.5" stroke-linejoin="round"/>`;
  const dots = data.map((d) =>
    `<circle cx="${toSvgX(d[0])}" cy="${toSvgY(d[1])}" r="4" fill="${colors[0]}" stroke="white" stroke-width="2"/>`
  ).join("\n");

  // Grid
  const ticks = 5;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const val = Math.round(minY + (rangeY / ticks) * i);
    const y = padding.top + chartH - (i / ticks) * chartH;
    return [
      `<line x1="${padding.left}" y1="${y}" x2="${w - padding.right}" y2="${y}" stroke="#eee"/>`,
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#999">${val}</text>`,
    ].join("\n");
  }).join("\n");

  // X-axis labels (first, middle, last)
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1].map((i) =>
    `<text x="${toSvgX(data[i][0])}" y="${h - 10}" text-anchor="middle" font-size="11" fill="#999">${data[i][0]}</text>`
  ).join("\n");

  const titleEl = title ? `<text x="${w / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#333">${escSvg(title)}</text>` : "";

  return svg(w, h, [grid, line, dots, xLabels, titleEl].join("\n"));
}

// --- Pie Chart ---
function pieChart(data: Record<string, number>, title: string, w: number, h: number, colors: string[]): string {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const total = values.reduce((a, b) => a + b, 0) || 1;

  const cx = w / 2 - 60;
  const cy = h / 2 + (title ? 10 : 0);
  const r = Math.min(cx - 20, cy - 40);

  let currentAngle = -Math.PI / 2;
  const slices = labels.map((label, i) => {
    const pct = values[i] / total;
    const angle = pct * Math.PI * 2;
    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(currentAngle + angle);
    const y2 = cy + r * Math.sin(currentAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    currentAngle += angle;
    return `<path d="${path}" fill="${colors[i % colors.length]}" stroke="white" stroke-width="2"/>`;
  }).join("\n");

  // Legend
  const legend = labels.map((label, i) => {
    const y = 60 + i * 24;
    const x = w - 130;
    const pct = Math.round((values[i] / total) * 100);
    return [
      `<rect x="${x}" y="${y}" width="14" height="14" rx="3" fill="${colors[i % colors.length]}"/>`,
      `<text x="${x + 20}" y="${y + 12}" font-size="12" fill="#333">${escSvg(label)} (${pct}%)</text>`,
    ].join("\n");
  }).join("\n");

  const titleEl = title ? `<text x="${w / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#333">${escSvg(title)}</text>` : "";

  return svg(w, h, [slices, legend, titleEl].join("\n"));
}

// --- Scatter Plot ---
function scatterPlot(data: number[][], title: string, w: number, h: number, colors: string[]): string {
  const padding = { top: title ? 50 : 20, bottom: 40, left: 60, right: 20 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const xs = data.map((d) => d[0]);
  const ys = data.map((d) => d[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const toSvgX = (x: number) => padding.left + ((x - minX) / rangeX) * chartW;
  const toSvgY = (y: number) => padding.top + chartH - ((y - minY) / rangeY) * chartH;

  const dots = data.map((d) =>
    `<circle cx="${toSvgX(d[0])}" cy="${toSvgY(d[1])}" r="5" fill="${colors[0]}" opacity="0.7"/>`
  ).join("\n");

  const grid = Array.from({ length: 6 }, (_, i) => {
    const y = padding.top + chartH - (i / 5) * chartH;
    const val = Math.round(minY + (rangeY / 5) * i);
    return [
      `<line x1="${padding.left}" y1="${y}" x2="${w - padding.right}" y2="${y}" stroke="#eee"/>`,
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#999">${val}</text>`,
    ].join("\n");
  }).join("\n");

  const titleEl = title ? `<text x="${w / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#333">${escSvg(title)}</text>` : "";

  return svg(w, h, [grid, dots, titleEl].join("\n"));
}

function svg(w: number, h: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <rect width="${w}" height="${h}" fill="white" rx="8"/>
  ${content}
</svg>`;
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const type = args[0];
  if (!type || !["bar", "line", "pie", "scatter"].includes(type)) {
    console.error("Usage: chart.ts <bar|line|pie|scatter> [options]");
    process.exit(1);
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  let data: any;
  if (args.includes("--stdin")) {
    data = JSON.parse(readFileSync(0, "utf-8"));
  } else {
    const raw = get("--data");
    if (!raw) { console.error("Provide --data '<json>' or --stdin"); process.exit(1); }
    data = JSON.parse(raw);
  }

  const title = get("--title") ?? "";
  const w = parseInt(get("--width") ?? "600");
  const h = parseInt(get("--height") ?? "400");
  const colors = get("--colors")?.split(",") ?? DEFAULT_COLORS;

  let svgOutput: string;
  switch (type) {
    case "bar": svgOutput = barChart(data, title, w, h, colors); break;
    case "line": svgOutput = lineChart(data, title, w, h, colors); break;
    case "pie": svgOutput = pieChart(data, title, w, h, colors); break;
    case "scatter": svgOutput = scatterPlot(data, title, w, h, colors); break;
    default: process.exit(1);
  }

  const out = get("--out");
  if (out) {
    writeFileSync(out, svgOutput);
    console.log(JSON.stringify({ ok: true, file: out, size: svgOutput.length, type }));
  } else {
    process.stdout.write(svgOutput);
  }
}

main();
