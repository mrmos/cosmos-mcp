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

const LOGIN_HELP = `How to get your cosmos.so cookie:

  1. Open https://www.cosmos.so in a browser and sign in.
  2. Open DevTools (Cmd+Option+I on macOS, F12 elsewhere).
  3. Go to the Network tab and reload the page.
  4. Click any request to api.cosmos.so.
  5. Under Request Headers, find "Cookie".
  6. Copy the whole value, not one cookie out of it.

It is a credential: treat it like a password. It is stored with owner-only
permissions and is never printed back. Sign out of that browser session to
revoke it.`;

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

function looksLikeCookieHeader(value: string): boolean {
  return value.includes("=") && !value.startsWith("{") && !/\s/.test(value.split("=")[0] ?? " ");
}

async function login(): Promise<number> {
  out(LOGIN_HELP);
  out();

  let cookie: string;
  try {
    cookie = await readSecret("Paste your Cookie header (input hidden), then press Enter: ");
  } catch {
    out("Cancelled.");
    return 1;
  }

  if (!cookie) {
    out("Nothing pasted. Run `cosmos-mcp login` again.");
    return 1;
  }
  out(`Received ${cookie.length} characters.`);

  if (!looksLikeCookieHeader(cookie)) {
    out();
    out('That does not look like a Cookie header. It should read "name=value; name=value; …".');
    out("Copy the whole value of the Cookie request header, not a single cookie.");
    return 1;
  }

  out("Checking it against cosmos.so…");
  const client = new CosmosClient({ ...loadConfig({}), cookie, authorization: undefined, userId: undefined });

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
    out("cosmos.so rejected that cookie. Nothing was saved.");
    out("The most common causes: you copied only one cookie, or the session has expired.");
    return 1;
  }

  const path = writeAuth({ cookie, userId: viewer.id, username: viewer.username ?? undefined });
  out();
  out(`Signed in as @${viewer.username ?? viewer.id}.`);
  out(`Saved to ${path} (owner-only permissions).`);
  out("All 36 tools are now available. Restart your MCP client to pick this up.");
  return 0;
}

async function status(): Promise<number> {
  const config = loadConfig();
  const stored = readAuth();

  const source = process.env.COSMOS_COOKIE
    ? "COSMOS_COOKIE environment variable"
    : stored.cookie
      ? `${configPath()} (saved ${stored.savedAt ?? "at an unknown time"})`
      : config.cookie
        ? ".env next to the package"
        : "nowhere — no credential configured";

  out(`Credential source: ${source}`);
  out(`Cookie:            ${redact(config.cookie)}`);
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
  if (process.env.COSMOS_COOKIE) {
    out();
    out("Note: COSMOS_COOKIE is still set in your environment, so the server stays signed in.");
    out("Unset it, or remove it from your MCP client config, to fully sign out.");
  }
  out("Signing out of that browser session on cosmos.so revokes the cookie itself.");
  return 0;
}

function help(): number {
  out("cosmos-mcp — unofficial MCP server for cosmos.so");
  out();
  out("  cosmos-mcp           Run the MCP server on stdio. This is what MCP clients invoke.");
  out("  cosmos-mcp login     Save a cosmos.so session cookie, after checking it works.");
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
