import { readFileSync, writeFileSync } from "node:fs";

// --- Markdown → HTML converter ---

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function convertInline(text: string): string {
  let out = text;
  // images before links
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
  // links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // bold+italic
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // bold
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // strikethrough
  out = out.replace(/~~(.+?)~~/g, "<del>$1</del>");
  // inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function convertMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    const codeMatch = line.match(/^```(\w*)/);
    if (codeMatch) {
      const lang = codeMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      const langAttr = lang ? ` data-lang="${lang}"` : "";
      const langLabel = lang ? `<div class="code-lang">${lang}</div>` : "";
      html.push(`<div class="code-block">${langLabel}<pre${langAttr}><code>${codeLines.join("\n")}</code></pre></div>`);
      continue;
    }

    // Table
    if (line.includes("|") && lines[i + 1]?.match(/^\|?\s*[-:]+[-|:\s]*$/)) {
      const tableRows: string[] = [];
      const headerCells = line.split("|").map((c) => c.trim()).filter(Boolean);
      tableRows.push("<thead><tr>" + headerCells.map((c) => `<th>${convertInline(c)}</th>`).join("") + "</tr></thead>");
      i += 2; // skip header + separator
      const bodyRows: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        bodyRows.push("<tr>" + cells.map((c) => `<td>${convertInline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      if (bodyRows.length) tableRows.push("<tbody>" + bodyRows.join("") + "</tbody>");
      html.push("<table>" + tableRows.join("") + "</table>");
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${convertInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr>");
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      html.push(`<blockquote>${convertInline(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(convertInline(lines[i].replace(/^[-*+]\s/, "")));
        i++;
      }
      html.push("<ul>" + items.map((it) => `<li>${it}</li>`).join("") + "</ul>");
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(convertInline(lines[i].replace(/^\d+\.\s/, "")));
        i++;
      }
      html.push("<ol>" + items.map((it) => `<li>${it}</li>`).join("") + "</ol>");
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|---|\*{3}|_{3})/)) {
      paraLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${convertInline(paraLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function wrapHtml(body: string, title: string, theme: "light" | "dark"): string {
  const bg = theme === "dark" ? "#1a1a2e" : "#ffffff";
  const fg = theme === "dark" ? "#e0e0e0" : "#333333";
  const codeBg = theme === "dark" ? "#16213e" : "#f5f5f5";
  const accent = theme === "dark" ? "#64b5f6" : "#2563eb";
  const borderColor = theme === "dark" ? "#333" : "#e0e0e0";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: ${fg}; background: ${bg}; max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em; font-weight: 600; line-height: 1.3; }
  h1 { font-size: 2em; border-bottom: 2px solid ${accent}; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; }
  p { margin: 0.8em 0; }
  a { color: ${accent}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: ${codeBg}; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; font-family: 'SF Mono', Consolas, monospace; }
  .code-block { position: relative; margin: 1em 0; }
  .code-lang { position: absolute; top: 0; right: 0; background: ${accent}; color: #fff; font-size: 0.75em; padding: 0.2em 0.6em; border-radius: 0 4px 0 4px; }
  pre { background: ${codeBg}; padding: 1em; border-radius: 8px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 4px solid ${accent}; padding: 0.5em 1em; margin: 1em 0; color: ${theme === "dark" ? "#aaa" : "#666"}; background: ${codeBg}; border-radius: 0 4px 4px 0; }
  ul, ol { margin: 0.8em 0; padding-left: 2em; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid ${borderColor}; margin: 2em 0; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid ${borderColor}; padding: 0.6em 0.8em; text-align: left; }
  th { background: ${codeBg}; font-weight: 600; }
  img { border-radius: 8px; }
  del { opacity: 0.6; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);

  let mdText: string;
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    mdText = readFileSync(args[fileIdx + 1], "utf-8");
  } else if (args.includes("--stdin")) {
    mdText = readFileSync(0, "utf-8");
  } else {
    console.error("Provide --file <path> or --stdin");
    process.exit(1);
  }

  const titleIdx = args.indexOf("--title");
  let title = titleIdx !== -1 ? args[titleIdx + 1] : undefined;
  if (!title) {
    const h1 = mdText.match(/^#\s+(.+)/m);
    title = h1 ? h1[1] : "Document";
  }

  const themeIdx = args.indexOf("--theme");
  const theme = (themeIdx !== -1 ? args[themeIdx + 1] : "light") as "light" | "dark";

  const body = convertMarkdown(mdText);
  const html = wrapHtml(body, title, theme);

  const outIdx = args.indexOf("--out");
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], html, "utf-8");
    console.log(JSON.stringify({ ok: true, file: args[outIdx + 1], size: html.length }));
  } else {
    process.stdout.write(html);
  }
}

main();
