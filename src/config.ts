/**
 * Runtime configuration for the Cosmos MCP server.
 *
 * Cosmos has no public API and no API keys. The web app authenticates with a
 * bearer token in the `Authorization` header, so that is what we reuse: either
 * `cosmos-mcp login` stores it, or `COSMOS_AUTHORIZATION` carries it.
 * Everything readable without signing in keeps working with no configuration.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readAuth } from "./auth-store";

export interface CosmosConfig {
  /** GraphQL endpoint. Override only for testing against a mock. */
  endpoint: string;
  /** Raw `Cookie` header copied from an authenticated browser session. */
  cookie?: string;
  /** `Authorization` header value, always with its `Bearer ` prefix. */
  authorization?: string;
  /** The one source that supplied cookie, authorization and user id together. */
  credentialSource: CredentialSource;
  /**
   * Skips the `me` lookup when set. Useful when the session cookie works but
   * you would rather not spend a round trip resolving the viewer.
   */
  userId?: number;
  /** Known only when `login` stored it alongside the credential. */
  username?: string;
  /** Sent as `x-client-name`; the API rejects unknown clients. */
  clientName: string;
  userAgent: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

export type CredentialSource = "environment" | "dotenv" | "stored" | "none";

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

/** Warns and falls back on a bad number: a startup failure would hide the reason in a client log. */
function parsePositiveInt(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    process.stderr.write(`cosmos-mcp: ignoring ${label}=${JSON.stringify(raw)}: it must be a positive integer.\n`);
    return undefined;
  }
  return n;
}

/** A JWT is three base64url segments joined by dots. */
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * The `Authorization` header for a pasted value that is recognisably a token:
 * a bare JWT, or anything already carrying a `Bearer ` prefix. Undefined
 * otherwise. Shared by `loadConfig` and the `login` command.
 */
export function asAuthorizationHeader(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const bare = value.replace(/^Bearer\s+/i, "");
  if (JWT_RE.test(bare)) return `Bearer ${bare}`;
  return /^Bearer\s+\S/i.test(value) ? value : undefined;
}

/** A `${...}` placeholder the MCP host left unfilled, such as an empty optional Claude Desktop field. */
const UNFILLED_TEMPLATE_RE = /^\$\{[^}]*\}$/;

const nonEmpty = (v: string | undefined) => {
  const value = v?.trim();
  return value && !UNFILLED_TEMPLATE_RE.test(value) ? value : undefined;
};

/** The credential half of the config, taken from one source as a unit. */
type Credential = Pick<CosmosConfig, "credentialSource" | "authorization" | "cookie" | "userId" | "username">;

/**
 * Resolves configuration from three places, in order of precedence:
 *
 *   1. real environment variables — what an MCP client's `env` block sets
 *   2. `.env` next to the package — convenient when you cloned the repo
 *   3. `~/.config/cosmos-mcp/config.json` — written by `cosmos-mcp login`
 *
 * The third exists because `npx` users have no package directory to edit.
 * The first place that holds a credential supplies all of it, user id
 * included: `COSMOS_USER_ID` counts only when it sits beside the credential,
 * so an old id in `.env` cannot be paired with another account's login.
 */
export function loadConfig(processEnv: NodeJS.ProcessEnv = process.env): CosmosConfig {
  const fileEnv = loadDotEnv();
  const read = (key: string): string | undefined => processEnv[key] ?? fileEnv[key];
  const fromVars = (vars: Record<string, string | undefined>, source: CredentialSource): Credential | undefined => {
    const authorization = nonEmpty(vars.COSMOS_AUTHORIZATION);
    const cookie = nonEmpty(vars.COSMOS_COOKIE);
    if (!authorization && !cookie) return undefined;
    const userId = parsePositiveInt(nonEmpty(vars.COSMOS_USER_ID), "COSMOS_USER_ID");
    return { credentialSource: source, authorization, cookie, userId };
  };
  const fromStored = (): Credential | undefined => {
    const stored = readAuth(processEnv);
    const authorization = nonEmpty(stored.authorization);
    const cookie = nonEmpty(stored.cookie);
    if (!authorization && !cookie) return undefined;
    return {
      credentialSource: "stored",
      authorization,
      cookie,
      userId: typeof stored.userId === "number" ? stored.userId : undefined,
      username: typeof stored.username === "string" ? stored.username : undefined,
    };
  };

  const { authorization, ...credential } = fromVars(processEnv, "environment") ??
    fromVars(fileEnv, "dotenv") ??
    fromStored() ?? { credentialSource: "none" };

  return {
    endpoint: read("COSMOS_ENDPOINT")?.trim() || DEFAULT_ENDPOINT,
    ...credential,
    // People paste the bare token as often as the whole header, and the API
    // needs the `Bearer ` prefix. Values that are not recognisably a token pass through.
    authorization: authorization && (asAuthorizationHeader(authorization) ?? authorization),
    clientName: read("COSMOS_CLIENT_NAME")?.trim() || DEFAULT_CLIENT_NAME,
    userAgent: read("COSMOS_USER_AGENT")?.trim() || DEFAULT_USER_AGENT,
    timeoutMs: parsePositiveInt(read("COSMOS_TIMEOUT_MS"), "COSMOS_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS,
  };
}
