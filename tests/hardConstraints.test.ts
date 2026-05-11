import { test, expect, describe } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Static guard against the architectural hard constraints in
 * PROJECT_BRIEF.md §3. Every line under src/ is scanned for forbidden
 * runtime patterns. If any match appears we fail loudly — the brief is
 * explicit that these constraints are not negotiable and shouldn't be
 * re-litigated by a future change.
 *
 * Adding a new file under src/ that legitimately needs one of these
 * patterns? Stop and reconsider — the constraints exist because the whole
 * point of slides-ng is to avoid them.
 */

const SRC_ROOT = "src";

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\bfrom\s+["']child_process["']/g,
    reason: "imports child_process (hard constraint #2: no spawned child processes)",
  },
  {
    pattern: /\brequire\(\s*["']child_process["']\s*\)/g,
    reason: "requires child_process (hard constraint #2: no spawned child processes)",
  },
  {
    // Negative lookbehind on `.` excludes method calls like `regex.exec()`,
    // `process.exec`, etc. We're guarding against bare `spawn(...)` /
    // `exec(...)` from a `child_process` import.
    pattern: /(?<![\w.])(spawn|execFile|execSync|spawnSync)\s*\(/g,
    reason: "calls child_process API (hard constraint #2)",
  },
  {
    pattern: /\b(http|https|net)\.createServer\b/g,
    reason: "creates an HTTP/net server (hard constraint #1: no localhost listening ports)",
  },
  {
    pattern: /\.listen\s*\(\s*\d+/g,
    reason: "binds a port (hard constraint #1: no localhost listening ports)",
  },
  {
    pattern: /https?:\/\/(localhost|127\.0\.0\.1)/g,
    reason: "references localhost (hard constraint #1, also #4: no external CDN/network at render time)",
  },
  {
    pattern: /https?:\/\/(cdn|unpkg|jsdelivr)\b/g,
    reason: "references a CDN at runtime (hard constraint #4: bundle everything)",
  },
];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (
      stat.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".generated.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("hard constraints (PROJECT_BRIEF.md §3)", () => {
  const files = listTsFiles(SRC_ROOT);

  test("at least one source file is scanned (sanity)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    test(`no source file ${reason}`, () => {
      const violations: { file: string; matches: string[] }[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf-8");
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          violations.push({ file, matches: Array.from(new Set(matches)) });
        }
      }
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `  ${v.file}: ${v.matches.join(", ")}`)
          .join("\n");
        throw new Error(
          `${reason}\nviolations:\n${detail}\n\n` +
            "If this is intentional, update PROJECT_BRIEF.md §3 first " +
            "and explain why the hard constraint is being relaxed."
        );
      }
      expect(violations.length).toBe(0);
    });
  }
});
