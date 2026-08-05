/**
 * Stores the Cosmos credential in the user's config directory.
 *
 * `.env` only works when you cloned the repo. Most people install with
 * `npx cosmos-mcp`, where the package lives in a temporary cache and there is
 * no sensible file to edit. Without this, their only option is pasting the
 * cookie into an MCP client config, which is committed to a repo more often
 * than anyone admits.
 *
 * The file holds a session credential, so it is written with 0600 and never
 * printed back.
 */

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StoredAuth {
  cookie?: string;
  authorization?: string;
  userId?: number;
  username?: string;
  /** ISO timestamp, so `status` can say how old the credential is. */
  savedAt?: string;
}

/** Honours XDG_CONFIG_HOME, falling back to ~/.config. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "cosmos-mcp");
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "config.json");
}

export function readAuth(env: NodeJS.ProcessEnv = process.env): StoredAuth {
  try {
    const parsed = JSON.parse(readFileSync(configPath(env), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredAuth;
  } catch {
    // Missing, unreadable or corrupt all mean the same thing: no credential.
    return {};
  }
}

export function writeAuth(auth: StoredAuth, env: NodeJS.ProcessEnv = process.env): string {
  const dir = configDir(env);
  const path = configPath(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify({ ...auth, savedAt: new Date().toISOString() }, null, 2) + "\n", {
    mode: 0o600,
  });
  // writeFileSync's mode is ignored when the file already exists.
  chmodSync(path, 0o600);
  return path;
}

export function clearAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    rmSync(configPath(env));
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows enough of a credential to confirm which one is stored, without
 * printing anything reusable.
 */
export function redact(value: string | undefined): string {
  if (!value) return "(none)";
  return `${value.length} chars, ending "…${value.slice(-6)}"`;
}
