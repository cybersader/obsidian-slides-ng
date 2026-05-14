/**
 * File-based debug logger. Writes to `slides-ng-debug.log` in the
 * vault root so logs survive plugin reloads and the user can paste
 * them into bug reports. Toggleable via the `debugLogging` setting
 * (default ON in v0.10.2 while we diagnose the ribbon-render issue;
 * can be turned off in settings once stable).
 *
 * Bypasses console.log on purpose — the Obsidian devtools console
 * isn't visible to anyone debugging from outside the user's machine,
 * and the user shouldn't have to open it.
 */

import type { App, TFile } from "obsidian";

const LOG_PATH = "slides-ng-debug.log";
/** Trim the log when it exceeds this size, keeping the last half. */
const MAX_BYTES = 256 * 1024;

export class DebugLog {
  private app: App;
  private enabled: () => boolean;
  /**
   * In-flight write promise. Prevents two concurrent log() calls
   * racing on read-modify-write — Obsidian's vault adapter is
   * single-threaded but our awaits aren't.
   */
  private writeChain: Promise<void> = Promise.resolve();
  /** Cache the start time so log entries have monotonic relative timestamps. */
  private startMs: number = Date.now();

  constructor(app: App, enabled: () => boolean) {
    this.app = app;
    this.enabled = enabled;
  }

  log(tag: string, data?: Record<string, unknown>): void {
    if (!this.enabled()) return;
    // Capture the call stack synchronously so any object we serialize
    // reflects state at log-time, not when the chained write runs.
    const wallTime = new Date().toISOString();
    const relMs = Date.now() - this.startMs;
    let payload = "";
    if (data) {
      try {
        payload = " " + JSON.stringify(data, jsonReplacer);
      } catch (err) {
        payload = " <<serialize error: " + String(err) + ">>";
      }
    }
    const line = `[${wallTime}] (+${relMs}ms) ${tag}${payload}\n`;
    this.writeChain = this.writeChain.then(() => this.append(line)).catch(() => undefined);
  }

  /** Clear the log file (writes a single "cleared" line). */
  clear(): Promise<void> {
    const stamp = new Date().toISOString();
    this.writeChain = this.writeChain.then(async () => {
      const adapter = this.app.vault.adapter as unknown as {
        write: (path: string, content: string) => Promise<void>;
      };
      await adapter.write(LOG_PATH, `# slides-ng debug log — cleared ${stamp}\n`);
      this.startMs = Date.now();
    });
    return this.writeChain;
  }

  private async append(line: string): Promise<void> {
    const adapter = this.app.vault.adapter as unknown as {
      exists: (path: string) => Promise<boolean>;
      read: (path: string) => Promise<string>;
      write: (path: string, content: string) => Promise<void>;
    };
    let existing = "";
    if (await adapter.exists(LOG_PATH)) {
      existing = await adapter.read(LOG_PATH);
      if (existing.length > MAX_BYTES) {
        // Drop the oldest half so the file doesn't grow unbounded.
        existing =
          "# slides-ng debug log — trimmed " +
          new Date().toISOString() +
          "\n" +
          existing.slice(Math.floor(existing.length / 2));
      }
    }
    await adapter.write(LOG_PATH, existing + line);
  }
}

/**
 * Make TFile / circular structures safe to JSON.stringify.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "object" && "path" in value && "extension" in value) {
    // Looks like a TFile / TAbstractFile — just emit the path.
    return `<TFile path=${(value as TFile).path}>`;
  }
  return value;
}
