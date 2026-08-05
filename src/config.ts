/**
 * Runtime configuration for the Cosmos MCP server.
 *
 * Cosmos has no public API and no API keys. The web app authenticates with a
 * session cookie, so that is what we reuse: paste the browser's `Cookie` header
 * into `COSMOS_COOKIE`. Everything readable without signing in keeps working
 * with no configuration at all.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readAuth } from "./auth-store";

export interface CosmosConfig {
  /** GraphQL endpoint. Override only for testing against a mock. */
  endpoint: string;
  /** Raw `Cookie` header copied from an authenticated browser session. */
  cookie?: string;
  /** Raw `Authorization` header value, if the account uses bearer tokens. */
  authorization?: string;
  /**
   * Skips the `me` lookup when set. Useful when the session cookie works but
   * you would rather not spend a round trip resolving the viewer.
   */
  userId?: number;
  /** Sent as `x-client-name`; the API rejects unknown clients. */
  clientName: string;
  userAgent: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

const DEFAULT_ENDPOINT = "https://api.cosmos.so/graphql";
const DEFAULT_CLIENT_NAME = "cosmos-web";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Reads `.env` from the package root.
 *
 * Bun loads `.env` automatically, but relative to the working directory — and
 * MCP clients spawn servers with a cwd we do not control, so the file is often
 * missed. Resolving from `import.meta.dir` makes it work wherever we are
 * launched from. Real environment variables always win.
 */
function loadDotEnv(): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(fileURLToPath(new URL("../.env", import.meta.url)), "utf8");
  } catch {
    return {};
  }

  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();
    // Cookie headers are full of `;` and `=`, so quoting them is common.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parsePositiveInt(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Resolves configuration from three places, in order of precedence:
 *
 *   1. real environment variables — what an MCP client's `env` block sets
 *   2. `.env` next to the package — convenient when you cloned the repo
 *   3. `~/.config/cosmos-mcp/config.json` — written by `cosmos-mcp login`
 *
 * The third exists because `npx` users have no package directory to edit.
 */
export function loadConfig(processEnv: NodeJS.ProcessEnv = process.env): CosmosConfig {
  const fileEnv = loadDotEnv();
  const stored = readAuth(processEnv);
  const read = (key: string): string | undefined => processEnv[key] ?? fileEnv[key];

  return {
    endpoint: read("COSMOS_ENDPOINT")?.trim() || DEFAULT_ENDPOINT,
    cookie: read("COSMOS_COOKIE")?.trim() || stored.cookie || undefined,
    authorization: read("COSMOS_AUTHORIZATION")?.trim() || stored.authorization || undefined,
    userId: parsePositiveInt(read("COSMOS_USER_ID"), "COSMOS_USER_ID") ?? stored.userId,
    clientName: read("COSMOS_CLIENT_NAME")?.trim() || DEFAULT_CLIENT_NAME,
    userAgent: read("COSMOS_USER_AGENT")?.trim() || DEFAULT_USER_AGENT,
    timeoutMs: parsePositiveInt(read("COSMOS_TIMEOUT_MS"), "COSMOS_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS,
  };
}
