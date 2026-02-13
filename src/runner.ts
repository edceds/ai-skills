import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { Skill, ScriptResult } from "./types.js";

/** Run a skill script and return stdout/stderr/exitCode */
export function runScript(
  skill: Skill,
  scriptPath: string,
  args: string[] = [],
  stdin?: string
): ScriptResult {
  const fullPath = join(skill.directory, scriptPath);

  // Determine runner based on extension
  let cmd: string;
  let cmdArgs: string[];
  if (scriptPath.endsWith(".ts")) {
    cmd = "npx";
    cmdArgs = ["tsx", fullPath, ...args];
  } else if (scriptPath.endsWith(".py")) {
    cmd = "python3";
    cmdArgs = [fullPath, ...args];
  } else {
    cmd = "bash";
    cmdArgs = [fullPath, ...args];
  }

  try {
    const stdout = execFileSync(cmd, cmdArgs, {
      cwd: skill.directory,
      encoding: "utf-8",
      timeout: 30_000,
      input: stdin,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
      exitCode: err.status ?? 1,
    };
  }
}
