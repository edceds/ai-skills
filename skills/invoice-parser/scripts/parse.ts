import { readFileSync } from "node:fs";

interface LineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
}

interface Invoice {
  invoice_number: string | null;
  date: string | null;
  due_date: string | null;
  vendor: string | null;
  vendor_address: string | null;
  customer: string | null;
  customer_address: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total: number | null;
  currency: string;
  payment_terms: string | null;
  notes: string | null;
}

function extractMoney(s: string): number | null {
  const m = s.match(/[\$\€\£]?\s*([\d,]+\.?\d*)/);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ""));
}

function detectCurrency(text: string): string {
  if (/\$|USD|usd|dollars?/i.test(text)) return "USD";
  if (/\€|EUR|eur|euros?/i.test(text)) return "EUR";
  if (/\£|GBP|gbp|pounds?/i.test(text)) return "GBP";
  if (/\¥|JPY|jpy|yen/i.test(text)) return "JPY";
  if (/CAD|cad|C\$/i.test(text)) return "CAD";
  if (/AUD|aud|A\$/i.test(text)) return "AUD";
  return "USD";
}

function extractDate(text: string, ...patterns: RegExp[]): string | null {
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

function parseInvoice(text: string): Invoice {
  const lines = text.split(/\r?\n/);
  const full = text;

  // Invoice number
  const invNum = full.match(/(?:invoice|inv|receipt|order)\s*(?:#|no\.?|number:?)\s*([A-Za-z0-9\-]+)/i);

  // Dates
  const date = extractDate(full,
    /(?:date|issued?|invoice date)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:date|issued?|invoice date)[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
  );

  const dueDate = extractDate(full,
    /(?:due\s*date|payment\s*due|due)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:due\s*date|payment\s*due|due)[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i,
  );

  // Vendor (first prominent name, often at the top)
  let vendor: string | null = null;
  const vendorMatch = full.match(/(?:from|seller|vendor|billed?\s*by|company)[:\s]+(.+)/i);
  if (vendorMatch) {
    vendor = vendorMatch[1].trim().split(/\n/)[0].trim();
  } else {
    // Fallback: first non-empty line that looks like a company name
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.match(/^(invoice|receipt|date|to|from|bill|ship|order|#)/i) && trimmed.length > 2 && trimmed.length < 80) {
        vendor = trimmed;
        break;
      }
    }
  }

  // Customer
  let customer: string | null = null;
  const custMatch = full.match(/(?:bill\s*to|customer|client|sold\s*to|ship\s*to|to)[:\s]+(.+)/i);
  if (custMatch) {
    customer = custMatch[1].trim().split(/\n/)[0].trim();
  }

  // Addresses (grab lines after vendor/customer that look like addresses)
  let vendorAddress: string | null = null;
  let customerAddress: string | null = null;
  const addrPattern = /\d+\s+\w+.*(?:st|ave|rd|blvd|dr|ln|way|ct|pl|street|avenue|road|drive|suite|ste|floor|fl)/i;
  const addrLines = lines.filter((l) => addrPattern.test(l.trim()));
  if (addrLines.length >= 2) {
    vendorAddress = addrLines[0].trim();
    customerAddress = addrLines[1].trim();
  } else if (addrLines.length === 1) {
    vendorAddress = addrLines[0].trim();
  }

  // Line items — look for patterns: description + quantity + price + amount
  const lineItems: LineItem[] = [];
  const itemPatterns = [
    // "Widget x 3  $10.00  $30.00" or "Widget  3  10.00  30.00"
    /^(.+?)\s+(\d+)\s+[\$\€\£]?([\d,]+\.?\d*)\s+[\$\€\£]?([\d,]+\.?\d*)\s*$/,
    // "Widget  $30.00" (no qty/unit price)
    /^(.{3,}?)\s{2,}[\$\€\£]([\d,]+\.?\d*)\s*$/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers
    if (/^(item|description|qty|quantity|price|amount|total|subtotal|tax)/i.test(trimmed)) continue;
    if (!trimmed || trimmed.length < 3) continue;

    const m1 = trimmed.match(itemPatterns[0]);
    if (m1) {
      lineItems.push({
        description: m1[1].trim(),
        quantity: parseInt(m1[2]),
        unit_price: parseFloat(m1[3].replace(/,/g, "")),
        amount: parseFloat(m1[4].replace(/,/g, "")),
      });
      continue;
    }
    const m2 = trimmed.match(itemPatterns[1]);
    if (m2 && !/(subtotal|total|tax|due|balance|payment|discount)/i.test(m2[1])) {
      lineItems.push({
        description: m2[1].trim(),
        quantity: null,
        unit_price: null,
        amount: parseFloat(m2[2].replace(/,/g, "")),
      });
    }
  }

  // Totals
  const subtotalMatch = full.match(/subtotal[:\s]*[\$\€\£]?\s*([\d,]+\.?\d*)/i);
  const taxAmountMatch = full.match(/(?:tax|vat|gst)[:\s]*[\$\€\£]?\s*([\d,]+\.?\d*)/i);
  const taxRateMatch = full.match(/(?:tax|vat|gst)\s*(?:\(?)\s*([\d.]+)\s*%/i);
  const totalMatch = full.match(/(?:grand\s*total|amount\s*due|balance\s*due|(?:^|\n)\s*total)[:\s]*[\$\€\£]?\s*([\d,]+\.?\d*)/im);

  const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1].replace(/,/g, "")) : null;
  const taxAmount = taxAmountMatch ? parseFloat(taxAmountMatch[1].replace(/,/g, "")) : null;
  const taxRate = taxRateMatch ? parseFloat(taxRateMatch[1]) : null;
  const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, "")) : null;

  // Payment terms
  const termsMatch = full.match(/(?:payment\s*terms?|terms?)[:\s]+(.+)/i);
  let paymentTerms = termsMatch ? termsMatch[1].trim().split(/\n/)[0].trim() : null;
  if (!paymentTerms) {
    const netMatch = full.match(/(net\s*\d+|due\s*(?:on|upon)\s*receipt|cod|payable\s*(?:within|in)\s*\d+\s*days?)/i);
    if (netMatch) paymentTerms = netMatch[1].trim();
  }

  // Notes
  const notesMatch = full.match(/(?:notes?|memo|comments?)[:\s]+(.+)/i);
  const notes = notesMatch ? notesMatch[1].trim().split(/\n/)[0].trim() : null;

  return {
    invoice_number: invNum?.[1] ?? null,
    date,
    due_date: dueDate,
    vendor,
    vendor_address: vendorAddress,
    customer,
    customer_address: customerAddress,
    line_items: lineItems,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    currency: detectCurrency(full),
    payment_terms: paymentTerms,
    notes,
  };
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);

  let text: string;
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    text = readFileSync(args[fileIdx + 1], "utf-8");
  } else if (args.includes("--stdin")) {
    text = readFileSync(0, "utf-8");
  } else {
    console.error("Usage: parse.ts --file <path> | --stdin");
    process.exit(1);
  }

  console.log(JSON.stringify(parseInvoice(text), null, 2));
}

main();
