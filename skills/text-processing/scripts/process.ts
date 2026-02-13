import { readFileSync } from "node:fs";

const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for",
  "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his",
  "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my",
  "one", "all", "would", "there", "their", "what", "so", "up", "out", "if",
  "about", "who", "get", "which", "go", "me", "when", "make", "can", "like",
  "time", "no", "just", "him", "know", "take", "people", "into", "year",
  "your", "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also", "back",
  "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
  "new", "want", "because", "any", "these", "give", "day", "most", "us",
  "is", "are", "was", "were", "been", "being", "has", "had", "does", "did",
  "am", "doing", "done", "should", "much", "very", "more", "such", "each",
]);

// --- Tokenization ---
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const matches = w.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// --- Stats ---
function computeStats(text: string) {
  const words = tokenize(text);
  const sents = sentences(text);
  const paras = paragraphs(text);
  return {
    characters: text.length,
    characters_no_spaces: text.replace(/\s/g, "").length,
    words: words.length,
    sentences: sents.length,
    paragraphs: paras.length,
    avg_words_per_sentence: sents.length ? Math.round((words.length / sents.length) * 100) / 100 : 0,
    avg_chars_per_word: words.length ? Math.round((words.join("").length / words.length) * 100) / 100 : 0,
  };
}

// --- Keywords ---
function extractKeywords(text: string, top: number) {
  const words = tokenize(text).filter((w) => !STOP_WORDS.has(w) && w.length > 2);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([word, count]) => ({ word, count, tf: Math.round((count / words.length) * 10000) / 10000 }));
}

// --- Readability ---
function computeReadability(text: string) {
  const words = tokenize(text);
  const sents = sentences(text);
  const totalSyllables = words.reduce((sum, w) => sum + syllables(w), 0);
  const totalChars = words.join("").length;

  const wordsPerSent = sents.length ? words.length / sents.length : 0;
  const syllablesPerWord = words.length ? totalSyllables / words.length : 0;
  const charsPerWord = words.length ? totalChars / words.length : 0;

  // Flesch-Kincaid Grade Level
  const fkgl = 0.39 * wordsPerSent + 11.8 * syllablesPerWord - 15.59;

  // Coleman-Liau Index
  const L = (totalChars / words.length) * 100; // avg letters per 100 words
  const S = (sents.length / words.length) * 100; // avg sentences per 100 words
  const cli = 0.0588 * L - 0.296 * S - 15.8;

  // Automated Readability Index
  const ari = 4.71 * charsPerWord + 0.5 * wordsPerSent - 21.43;

  function interpret(grade: number): string {
    if (grade <= 5) return "Easy (elementary school)";
    if (grade <= 8) return "Moderate (middle school)";
    if (grade <= 12) return "Difficult (high school)";
    return "Very difficult (college+)";
  }

  return {
    flesch_kincaid_grade: Math.round(fkgl * 100) / 100,
    coleman_liau_index: Math.round(cli * 100) / 100,
    automated_readability_index: Math.round(ari * 100) / 100,
    interpretation: interpret(fkgl),
    total_syllables: totalSyllables,
    words: words.length,
    sentences: sents.length,
  };
}

// --- Frequency ---
function wordFrequency(text: string, top: number) {
  const words = tokenize(text);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([word, count]) => ({ word, count }));
}

// --- Summarize ---
function summarize(text: string, numSentences: number) {
  const sents = sentences(text);
  if (sents.length <= numSentences) return { summary: sents.join(" "), sentences: sents };

  // Score each sentence by sum of keyword TF
  const words = tokenize(text).filter((w) => !STOP_WORDS.has(w) && w.length > 2);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  const scored = sents.map((sent, idx) => {
    const sentWords = tokenize(sent).filter((w) => !STOP_WORDS.has(w));
    const score = sentWords.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0);
    return { sent, idx, score };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, numSentences);
  // Return in original order
  top.sort((a, b) => a.idx - b.idx);

  return {
    summary: top.map((t) => t.sent).join(" "),
    sentences: top.map((t) => t.sent),
  };
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const op = args[0];
  const ops = ["stats", "keywords", "readability", "frequency", "summarize"];
  if (!op || !ops.includes(op)) {
    console.error(`Usage: process.ts <${ops.join("|")}> [options]`);
    process.exit(1);
  }

  let text: string;
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    text = readFileSync(args[fileIdx + 1], "utf-8");
  } else if (args.includes("--stdin")) {
    text = readFileSync(0, "utf-8");
  } else {
    console.error("Provide --file <path> or --stdin");
    process.exit(1);
  }

  const topIdx = args.indexOf("--top");
  const top = topIdx !== -1 ? parseInt(args[topIdx + 1], 10) : 10;

  const sentIdx = args.indexOf("--sentences");
  const numSentences = sentIdx !== -1 ? parseInt(args[sentIdx + 1], 10) : 3;

  switch (op) {
    case "stats":
      console.log(JSON.stringify(computeStats(text), null, 2));
      break;
    case "keywords":
      console.log(JSON.stringify(extractKeywords(text, top), null, 2));
      break;
    case "readability":
      console.log(JSON.stringify(computeReadability(text), null, 2));
      break;
    case "frequency":
      console.log(JSON.stringify(wordFrequency(text, top), null, 2));
      break;
    case "summarize":
      console.log(JSON.stringify(summarize(text, numSentences), null, 2));
      break;
  }
}

main();
