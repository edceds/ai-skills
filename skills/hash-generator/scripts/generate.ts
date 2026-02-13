import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";

interface HashInput {
  data: string;
  algorithm?: "sha256" | "sha512" | "md5" | "sha1";
  encoding?: "hex" | "base64";
  hmac_key?: string;
}

function computeHash(input: HashInput): { hash: string; algorithm: string; encoding: string; hmac: boolean } {
  const algo = input.algorithm ?? "sha256";
  const enc = input.encoding ?? "hex";

  let hash: string;
  if (input.hmac_key) {
    hash = createHmac(algo, input.hmac_key).update(input.data).digest(enc);
  } else {
    hash = createHash(algo).update(input.data).digest(enc);
  }

  return { hash, algorithm: algo, encoding: enc, hmac: !!input.hmac_key };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  let input: HashInput;

  if (args.includes("--stdin")) {
    input = JSON.parse(readFileSync(0, "utf-8"));
  } else {
    const data = get("--data");
    if (!data) { console.error("Usage: generate.ts --data <text> [options] OR --stdin"); process.exit(1); }
    input = {
      data,
      algorithm: (get("--algorithm") ?? "sha256") as HashInput["algorithm"],
      encoding: (get("--encoding") ?? "hex") as HashInput["encoding"],
      hmac_key: get("--hmac-key"),
    };
  }

  const result = computeHash(input);
  console.log(JSON.stringify(result));
}

main();
