import { writeFileSync } from "node:fs";

// --- Seeded PRNG (mulberry32) ---
function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = ReturnType<typeof createRng>;

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng: Rng, min: number, max: number, decimals = 2): number {
  const v = rng() * (max - min) + min;
  return Math.round(v * 10 ** decimals) / 10 ** decimals;
}

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function uuid(rng: Rng): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += hex[(randInt(rng, 0, 3) + 8)];
    else s += hex[randInt(rng, 0, 15)];
  }
  return s;
}

// --- Data pools ---
const FIRST_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Ethan", "Fiona", "George", "Hannah", "Ivan", "Julia", "Kevin", "Laura", "Mike", "Nina", "Oscar", "Penny", "Quinn", "Rachel", "Steve", "Tina", "Uma", "Victor", "Wendy", "Xavier", "Yara", "Zach"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Clark", "Lewis", "Walker"];
const CITIES = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "San Diego", "Dallas", "Austin", "Seattle", "Denver", "Boston", "Miami", "Portland", "Atlanta", "Nashville"];
const PRODUCT_ADJECTIVES = ["Premium", "Ultra", "Classic", "Pro", "Elite", "Mega", "Smart", "Eco", "Turbo", "Slim"];
const PRODUCT_NOUNS = ["Widget", "Gadget", "Device", "Module", "Sensor", "Controller", "Adapter", "Hub", "Terminal", "Unit"];
const CATEGORIES = ["Electronics", "Home & Garden", "Sports", "Clothing", "Books", "Food", "Toys", "Health", "Automotive", "Office"];
const LOREM = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat".split(" ");

// --- Generators ---
function genName(rng: Rng): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

function genEmail(rng: Rng, name: string): string {
  const parts = name.toLowerCase().split(" ");
  const domain = pick(rng, ["gmail.com", "outlook.com", "company.io", "email.org", "work.dev"]);
  return `${parts[0]}.${parts[1]}${randInt(rng, 1, 99)}@${domain}`;
}

function genDate(rng: Rng, from: string, to: string): string {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const ts = start + rng() * (end - start);
  return new Date(ts).toISOString().split("T")[0];
}

function genLoremWords(rng: Rng, count: number): string {
  const words: string[] = [];
  for (let i = 0; i < count; i++) words.push(pick(rng, LOREM));
  return words.join(" ");
}

function generateUsers(rng: Rng, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const name = genName(rng);
    return {
      id: i + 1,
      name,
      email: genEmail(rng, name),
      age: randInt(rng, 18, 75),
      city: pick(rng, CITIES),
      signup_date: genDate(rng, "2020-01-01", "2025-12-31"),
      active: rng() > 0.3,
    };
  });
}

function generateProducts(rng: Rng, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `${pick(rng, PRODUCT_ADJECTIVES)} ${pick(rng, PRODUCT_NOUNS)}`,
    category: pick(rng, CATEGORIES),
    price: randFloat(rng, 5, 500),
    stock: randInt(rng, 0, 1000),
    rating: randFloat(rng, 1, 5, 1),
    sku: `SKU-${String(randInt(rng, 10000, 99999))}`,
  }));
}

function generateTimeseries(rng: Rng, count: number, start: string, interval: string, trend: number) {
  const startDate = new Date(start);
  const intervals: Record<string, number> = {
    hour: 3600_000,
    day: 86400_000,
    week: 604800_000,
    month: 2592000_000,
  };
  const ms = intervals[interval] ?? intervals.day;
  const baseValue = randFloat(rng, 10, 100);

  return Array.from({ length: count }, (_, i) => {
    const ts = new Date(startDate.getTime() + i * ms);
    const noise = (rng() - 0.5) * baseValue * 0.2;
    return {
      timestamp: ts.toISOString(),
      value: Math.round((baseValue + trend * i + noise) * 100) / 100,
    };
  });
}

function generateCustom(rng: Rng, count: number, schema: Record<string, string>) {
  return Array.from({ length: count }, () => {
    const row: Record<string, any> = {};
    for (const [key, spec] of Object.entries(schema)) {
      if (spec === "name") row[key] = genName(rng);
      else if (spec === "email") row[key] = genEmail(rng, genName(rng));
      else if (spec === "bool") row[key] = rng() > 0.5;
      else if (spec === "uuid") row[key] = uuid(rng);
      else if (spec.startsWith("int:")) {
        const [, min, max] = spec.split(":");
        row[key] = randInt(rng, Number(min), Number(max));
      } else if (spec.startsWith("float:")) {
        const [, min, max] = spec.split(":");
        row[key] = randFloat(rng, Number(min), Number(max));
      } else if (spec.startsWith("date:")) {
        const [, from, to] = spec.split(":");
        row[key] = genDate(rng, from, to);
      } else if (spec.startsWith("pick:")) {
        const options = spec.slice(5).split(",");
        row[key] = pick(rng, options);
      } else if (spec.startsWith("text:")) {
        const n = Number(spec.split(":")[1]);
        row[key] = genLoremWords(rng, n);
      } else {
        row[key] = spec; // literal
      }
    }
    return row;
  });
}

function toCsv(data: Record<string, any>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const lines = [headers.join(",")];
  for (const row of data) {
    lines.push(headers.map((h) => {
      const v = String(row[h] ?? "");
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","));
  }
  return lines.join("\n");
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const op = args[0];
  const ops = ["users", "products", "timeseries", "custom", "csv-users"];
  if (!op || !ops.includes(op)) {
    console.error(`Usage: generate.ts <${ops.join("|")}> [options]`);
    process.exit(1);
  }

  const countIdx = args.indexOf("--count");
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 10;

  const seedIdx = args.indexOf("--seed");
  const seed = seedIdx !== -1 ? parseInt(args[seedIdx + 1], 10) : Date.now();
  const rng = createRng(seed);

  let output: string;

  switch (op) {
    case "users": {
      output = JSON.stringify(generateUsers(rng, count), null, 2);
      break;
    }
    case "products": {
      output = JSON.stringify(generateProducts(rng, count), null, 2);
      break;
    }
    case "timeseries": {
      const startIdx = args.indexOf("--start");
      const start = startIdx !== -1 ? args[startIdx + 1] : new Date().toISOString().split("T")[0];
      const intervalIdx = args.indexOf("--interval");
      const interval = intervalIdx !== -1 ? args[intervalIdx + 1] : "day";
      const trendIdx = args.indexOf("--trend");
      const trend = trendIdx !== -1 ? parseFloat(args[trendIdx + 1]) : 0;
      output = JSON.stringify(generateTimeseries(rng, count, start, interval, trend), null, 2);
      break;
    }
    case "custom": {
      const schemaIdx = args.indexOf("--schema");
      if (schemaIdx === -1 || !args[schemaIdx + 1]) {
        console.error("custom requires --schema '<json>'");
        process.exit(1);
      }
      const schema = JSON.parse(args[schemaIdx + 1]);
      output = JSON.stringify(generateCustom(rng, count, schema), null, 2);
      break;
    }
    case "csv-users": {
      output = toCsv(generateUsers(rng, count));
      break;
    }
    default:
      process.exit(1);
  }

  const outIdx = args.indexOf("--out");
  if (outIdx !== -1 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], output, "utf-8");
    console.log(JSON.stringify({ ok: true, file: args[outIdx + 1], records: count }));
  } else {
    process.stdout.write(output + "\n");
  }
}

main();
