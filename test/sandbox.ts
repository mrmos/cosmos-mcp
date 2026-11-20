import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];

/** An isolated config home, so tests never touch the real ~/.config. Pair with `afterEach(cleanSandboxes)`. */
export function sandbox(): NodeJS.ProcessEnv & { XDG_CONFIG_HOME: string } {
  const dir = mkdtempSync(join(tmpdir(), "cosmos-mcp-test-"));
  dirs.push(dir);
  return { XDG_CONFIG_HOME: dir };
}

export function cleanSandboxes(): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}
