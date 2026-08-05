/**
 * `cosmos-mcp login | logout | status`.
 *
 * With no subcommand the binary runs the MCP server on stdio, which is what an
 * MCP client invokes. These subcommands exist for humans.
 *
 * Everything here writes to stderr. stdout belongs to the JSON-RPC transport,
 * and a stray byte there corrupts the protocol.
 */

import { loadConfig } from "./config";
import { CosmosClient } from "./graphql/client";
import { clearAuth, configPath, readAuth, redact, writeAuth } from "./auth-store";

const out = (s = "") => process.stderr.write(s + "\n");

const LOGIN_HELP = `How to get your cosmos.so credential:

  1. Open https://www.cosmos.so in a browser and sign in.
  2. Open DevTools (Cmd+Option+I on macOS, F12 elsewhere).
  3. Go to the Network tab and reload the page.
  4. Click any request to api.cosmos.so.
  5. Under Request Headers, find "Authorization".
  6. Copy the whole value. It starts with "Bearer ".

Cosmos authenticates with that bearer token. The Cookie header on the same
request is only AWS load-balancer routing and will not sign you in, so use
Authorization. (If you must, a full Cookie header that carries a session is
still accepted.)

It is a credential: treat it like a password. It is stored with owner-only
permissions and is never printed back. The token expires on its own; sign out
of that browser session to revoke it sooner.`;

/** Reads one line from a TTY without echoing it. Falls back to piped stdin. */
async function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;

  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const done = (fn: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(buf.trim()));
        if (ch === "") return done(() => reject(new Error("cancelled")));
        // Backspace, for anyone typing rather than pasting.
        if (ch === "" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** A JWT is three base64url segments joined by dots. */
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type Credential =
  | { kind: "authorization"; authorization: string }
  | { kind: "cookie"; cookie: string }
  | { kind: "unknown" };

/**
 * Classifies a pasted secret. Cosmos authenticates with a bearer token in the
 * Authorization header; the Cookie header on the same request is only AWS
 * load-balancer stickiness (AWSALB/AWSALBCORS) and carries no identity, so a
 * cookie is accepted only when it plausibly holds a session of its own.
 */
export function classifyCredential(raw: string): Credential {
  const value = raw.trim();
  if (value === "") return { kind: "unknown" };

  // "Bearer eyJ…" or a bare JWT.
  const bare = value.replace(/^Bearer\s+/i, "");
  if (JWT_RE.test(bare)) return { kind: "authorization", authorization: `Bearer ${bare}` };
  if (/^Bearer\s+\S/i.test(value)) return { kind: "authorization", authorization: value };

  if (value.includes("=") && !value.startsWith("{")) {
    // AWS load-balancer cookies alone never authenticate; refuse them early so
    // the failure is a clear message rather than a rejected round trip.
    const names = value.split(";").map((c) => c.split("=")[0]?.trim().toLowerCase());
    const onlyLoadBalancer = names.every((n) => n === "awsalb" || n === "awsalbcors");
    if (onlyLoadBalancer) return { kind: "unknown" };
    return { kind: "cookie", cookie: value };
  }

  return { kind: "unknown" };
}

async function login(): Promise<number> {
  out(LOGIN_HELP);
  out();

  let pasted: string;
  try {
    pasted = await readSecret("Paste your Authorization header (input hidden), then press Enter: ");
  } catch {
    out("Cancelled.");
    return 1;
  }

  if (!pasted) {
    out("Nothing pasted. Run `cosmos-mcp login` again.");
    return 1;
  }
  out(`Received ${pasted.trim().length} characters.`);

  const cred = classifyCredential(pasted);
  if (cred.kind === "unknown") {
    out();
    out("That does not look like a Cosmos credential.");
    out('Copy the whole "Authorization" request header — it begins with "Bearer ".');
    out("The AWSALB cookies alone will not sign you in; they are only load-balancer routing.");
    return 1;
  }

  out(`Checking your ${cred.kind === "authorization" ? "token" : "cookie"} against cosmos.so…`);
  const client = new CosmosClient({
    ...loadConfig({}),
    cookie: cred.kind === "cookie" ? cred.cookie : undefined,
    authorization: cred.kind === "authorization" ? cred.authorization : undefined,
    userId: undefined,
  });

  let viewer: { id: number; username: string | null } | null;
  try {
    viewer = await client.viewer();
  } catch (err) {
    out();
    out(`Could not reach cosmos.so: ${err instanceof Error ? err.message : String(err)}`);
    out("Nothing was saved.");
    return 1;
  }

  if (!viewer) {
    out();
    out("cosmos.so rejected that credential. Nothing was saved.");
    out("Most likely it has expired — grab a fresh Authorization header and try again.");
    return 1;
  }

  const path = writeAuth({
    ...(cred.kind === "authorization" ? { authorization: cred.authorization } : { cookie: cred.cookie }),
    userId: viewer.id,
    username: viewer.username ?? undefined,
  });
  out();
  out(`Signed in as @${viewer.username ?? viewer.id}.`);
  out(`Saved to ${path} (owner-only permissions).`);
  out("All 36 tools are now available. Restart your MCP client to pick this up.");
  return 0;
}

async function status(): Promise<number> {
  const config = loadConfig();
  const stored = readAuth();

  const source =
    process.env.COSMOS_AUTHORIZATION || process.env.COSMOS_COOKIE
      ? "environment variable"
      : stored.authorization || stored.cookie
        ? `${configPath()} (saved ${stored.savedAt ?? "at an unknown time"})`
        : config.authorization || config.cookie
          ? ".env next to the package"
          : "nowhere — no credential configured";

  const kind = config.authorization ? "Bearer token" : config.cookie ? "Cookie" : "(none)";
  out(`Credential source: ${source}`);
  out(`Credential:        ${kind} · ${redact(config.authorization ?? config.cookie)}`);
  out(`Endpoint:          ${config.endpoint}`);

  if (!config.cookie && !config.authorization) {
    out();
    out("18 of the 36 tools work without signing in: search, browsing and public profiles.");
    out("Run `cosmos-mcp login` to unlock saving and collections.");
    return 0;
  }

  out();
  out("Checking it against cosmos.so…");
  const viewer = await new CosmosClient(config).viewer().catch(() => null);
  if (viewer) {
    out(`Valid. Signed in as @${viewer.username ?? viewer.id}.`);
    return 0;
  }
  out("Rejected. The session has probably expired — run `cosmos-mcp login` again.");
  return 1;
}

function logout(): number {
  const removed = clearAuth();
  out(removed ? `Removed ${configPath()}.` : "No stored credential to remove.");
  const envVar = process.env.COSMOS_AUTHORIZATION ? "COSMOS_AUTHORIZATION" : process.env.COSMOS_COOKIE ? "COSMOS_COOKIE" : null;
  if (envVar) {
    out();
    out(`Note: ${envVar} is still set in your environment, so the server stays signed in.`);
    out("Unset it, or remove it from your MCP client config, to fully sign out.");
  }
  out("Signing out of that browser session on cosmos.so revokes the token itself.");
  return 0;
}

function help(): number {
  out("cosmos-mcp — unofficial MCP server for cosmos.so");
  out();
  out("  cosmos-mcp           Run the MCP server on stdio. This is what MCP clients invoke.");
  out("  cosmos-mcp login     Save a cosmos.so credential, after checking it works.");
  out("  cosmos-mcp status    Show which credential is in use and whether it is still valid.");
  out("  cosmos-mcp logout    Remove the saved credential.");
  out();
  out("Docs: https://github.com/mrmos/cosmos-mcp");
  return 0;
}

/** Returns an exit code, or null when the caller should start the server. */
export async function runCli(argv: string[]): Promise<number | null> {
  switch (argv[0]) {
    case undefined:
      return null;
    case "login":
      return login();
    case "logout":
      return logout();
    case "status":
      return status();
    case "help":
    case "--help":
    case "-h":
      return help();
    case "--version":
    case "-v":
      out((await import("./server")).SERVER_VERSION);
      return 0;
    default:
      out(`Unknown command: ${argv[0]}`);
      help();
      return 1;
  }
}
