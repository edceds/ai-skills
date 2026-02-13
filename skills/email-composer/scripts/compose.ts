import { readFileSync } from "node:fs";

type EmailType = "follow-up" | "cold-outreach" | "meeting-recap" | "escalation" | "thank-you" | "introduction" | "reminder" | "apology";
type Tone = "formal" | "casual" | "friendly" | "urgent";

interface EmailInput {
  type: EmailType;
  to: string;
  from: string;
  subject?: string;
  company?: string;
  points: string[];
  tone: Tone;
}

interface EmailOutput {
  subject: string;
  body: string;
  html: string;
}

const GREETINGS: Record<Tone, (name: string) => string> = {
  formal: (n) => `Dear ${n},`,
  casual: (n) => `Hi ${n},`,
  friendly: (n) => `Hey ${n}!`,
  urgent: (n) => `${n},`,
};

const CLOSINGS: Record<Tone, string[]> = {
  formal: ["Best regards,", "Sincerely,", "Kind regards,"],
  casual: ["Best,", "Cheers,", "Thanks,"],
  friendly: ["Talk soon!", "Looking forward to hearing from you!", "Thanks so much!"],
  urgent: ["Please advise at your earliest convenience.", "This requires immediate attention.", "Looking forward to your prompt response."],
};

function pickClosing(tone: Tone, seed: number): string {
  const options = CLOSINGS[tone];
  return options[seed % options.length];
}

function generateSubject(input: EmailInput): string {
  const { type, points, company } = input;
  const topic = points[0] ?? "our conversation";

  switch (type) {
    case "follow-up": return `Following up: ${topic}`;
    case "cold-outreach": return company ? `Quick question for ${company}` : `Quick question about ${topic}`;
    case "meeting-recap": return `Meeting recap: ${topic}`;
    case "escalation": return `Action needed: ${topic}`;
    case "thank-you": return `Thank you — ${topic}`;
    case "introduction": return `Introduction: ${topic}`;
    case "reminder": return `Friendly reminder: ${topic}`;
    case "apology": return `Regarding ${topic} — our apologies`;
  }
}

function composeBody(input: EmailInput): string {
  const { type, to, from, points, tone, company } = input;
  const greeting = GREETINGS[tone](to);
  const closing = pickClosing(tone, to.length + from.length);
  const paras: string[] = [];

  switch (type) {
    case "follow-up": {
      paras.push(`Thank you for your time recently. I wanted to follow up on our discussion.`);
      if (points.length > 0) {
        paras.push(`Key points from our conversation:`);
        paras.push(points.map((p) => `  - ${p.trim()}`).join("\n"));
      }
      paras.push(`Please let me know if you have any questions or if there's anything else I can help with.`);
      break;
    }
    case "cold-outreach": {
      const opener = company
        ? `I came across ${company} and was impressed by what you're building.`
        : `I hope this message finds you well.`;
      paras.push(opener);
      if (points.length > 0) {
        paras.push(`I wanted to reach out because:`);
        paras.push(points.map((p) => `  - ${p.trim()}`).join("\n"));
      }
      paras.push(`Would you be open to a brief chat this week? I'd love to explore how we might work together.`);
      break;
    }
    case "meeting-recap": {
      paras.push(`Thank you all for the productive meeting. Here's a summary of what we covered:`);
      if (points.length > 0) {
        paras.push(points.map((p, i) => `  ${i + 1}. ${p.trim()}`).join("\n"));
      }
      paras.push(`Please review and let me know if I've missed anything. I'll follow up on the action items by end of week.`);
      break;
    }
    case "escalation": {
      paras.push(`I'm writing to bring an important matter to your attention that requires prompt action.`);
      if (points.length > 0) {
        paras.push(`Here are the details:`);
        paras.push(points.map((p) => `  - ${p.trim()}`).join("\n"));
      }
      paras.push(`I believe this needs to be addressed as soon as possible. Please let me know how you'd like to proceed.`);
      break;
    }
    case "thank-you": {
      const reason = points[0] ? `for ${points[0].trim()}` : "for your help";
      paras.push(`I wanted to take a moment to sincerely thank you ${reason}.`);
      if (points.length > 1) {
        paras.push(`In particular, I appreciated:`);
        paras.push(points.slice(1).map((p) => `  - ${p.trim()}`).join("\n"));
      }
      paras.push(`Your support made a real difference, and I truly appreciate it.`);
      break;
    }
    case "introduction": {
      paras.push(`I'd like to introduce myself${company ? ` — I'm ${from} from ${company}` : ""}.`);
      if (points.length > 0) {
        paras.push(points.map((p) => `${p.trim()}.`).join(" "));
      }
      paras.push(`I'd welcome the opportunity to connect. Would you have time for a brief call?`);
      break;
    }
    case "reminder": {
      paras.push(`I hope you're doing well. I wanted to send a friendly reminder about the following:`);
      if (points.length > 0) {
        paras.push(points.map((p) => `  - ${p.trim()}`).join("\n"));
      }
      paras.push(`Please let me know if you need any additional information or if the timeline has changed.`);
      break;
    }
    case "apology": {
      const issue = points[0] ?? "the recent issue";
      paras.push(`I want to sincerely apologize for ${issue.trim()}.`);
      if (points.length > 1) {
        paras.push(`Here's what happened and what we're doing about it:`);
        paras.push(points.slice(1).map((p) => `  - ${p.trim()}`).join("\n"));
      }
      paras.push(`We take this seriously and are committed to making it right. Please don't hesitate to reach out if you have any concerns.`);
      break;
    }
  }

  return [greeting, "", ...paras, "", closing, from].join("\n");
}

function bodyToHtml(body: string): string {
  const lines = body.split("\n");
  const html: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      html.push("<br>");
    } else if (line.match(/^\s+[-\d]/)) {
      html.push(`<p style="margin:0 0 2px 20px">${line.trim()}</p>`);
    } else {
      html.push(`<p style="margin:4px 0">${line}</p>`);
    }
  }
  return `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#333">${html.join("\n")}</div>`;
}

function compose(input: EmailInput): EmailOutput {
  const subject = input.subject || generateSubject(input);
  const body = composeBody(input);
  const html = bodyToHtml(body);
  return { subject, body, html };
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);

  let input: EmailInput;

  if (args.includes("--stdin")) {
    const raw = JSON.parse(readFileSync(0, "utf-8"));
    input = {
      type: raw.type ?? "follow-up",
      to: raw.to ?? "Recipient",
      from: raw.from ?? "Sender",
      subject: raw.subject,
      company: raw.company,
      points: Array.isArray(raw.points) ? raw.points : (raw.points ?? "").split(","),
      tone: raw.tone ?? "formal",
    };
  } else {
    const get = (flag: string): string | undefined => {
      const i = args.indexOf(flag);
      return i !== -1 ? args[i + 1] : undefined;
    };

    input = {
      type: (get("--type") ?? "follow-up") as EmailType,
      to: get("--to") ?? "Recipient",
      from: get("--from") ?? "Sender",
      subject: get("--subject"),
      company: get("--company"),
      points: (get("--points") ?? "").split(",").filter(Boolean),
      tone: (get("--tone") ?? "formal") as Tone,
    };
  }

  console.log(JSON.stringify(compose(input), null, 2));
}

main();
