import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CosmosClient } from "../src/graphql/client";
import { CosmosError } from "../src/errors";
import { clearAuth, configPath, writeAuth } from "../src/auth-store";
import { loadConfig, type CosmosConfig } from "../src/config";

/**
 * The real client against a local stand-in for api.cosmos.so. Each test sets
 * `respond` to script what the "server" does, and reads `hits` to see what it
 * was sent.
 */
type Responder = (body: { operationName: string; query: string }, hit: number) => Response | Promise<Response>;

let respond: Responder;
let hits: { operationName: string; authorization: string | null }[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = (await req.json()) as { operationName: string; query: string };
      hits.push({ operationName: body.operationName, authorization: req.headers.get("authorization") });
      return respond(body, hits.length);
    },
  });
});
afterAll(() => server.stop(true));
afterEach(() => {
  hits = [];
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

function config(overrides: Partial<CosmosConfig> = {}): CosmosConfig {
  return {
    endpoint: `http://localhost:${server.port}/graphql`,
    authorization: "Bearer test",
    credentialSource: "environment",
    clientName: "cosmos-web",
    userAgent: "test",
    timeoutMs: 2_000,
    ...overrides,
  };
}

const QUERY = "query CosmosMcpThing { thing { id } }";
const MUTATION = "mutation CosmosMcpMake { cluster { create { id } } }";

describe("retries", () => {
  test("a query is retried after a 502", async () => {
    respond = (_b, hit) => (hit === 1 ? new Response("bad gateway", { status: 502 }) : json({ data: { thing: { id: 1 } } }));
    const data = await new CosmosClient(config()).request("CosmosMcpThing", QUERY);
    expect(data).toEqual({ thing: { id: 1 } });
    expect(hits).toHaveLength(2);
  });

  test("a mutation is never replayed after a 502: it may already have landed", async () => {
    respond = () => new Response("bad gateway", { status: 502 });
    const err: any = await new CosmosClient(config()).request("CosmosMcpMake", MUTATION).catch((e: any) => e);
    expect(err).toBeInstanceOf(CosmosError);
    expect(err.message).toContain("may or may not have been applied");
    expect(hits).toHaveLength(1);
  });

  test("a mutation is retried after a 429, which the server refused outright", async () => {
    respond = (_b, hit) =>
      hit === 1 ? new Response("slow down", { status: 429 }) : json({ data: { cluster: { create: { id: 5 } } } });
    await new CosmosClient(config()).request("CosmosMcpMake", MUTATION);
    expect(hits).toHaveLength(2);
  });
});

describe("partial data", () => {
  test("a mutation with errors throws even when data is non-null", async () => {
    respond = () =>
      json({ data: { cluster: { create: null } }, errors: [{ message: "Name taken", extensions: { code: "BAD_USER_INPUT" } }] });
    const err: any = await new CosmosClient(config()).request("CosmosMcpMake", MUTATION).catch((e: any) => e);
    expect(err).toBeInstanceOf(CosmosError);
    expect(err.message).toContain("Name taken");
  });

  test("a query whose every top-level field is null throws with the server's reason", async () => {
    respond = () => json({ data: { thing: null }, errors: [{ message: "Collection not found", extensions: { code: "NOT_FOUND" } }] });
    const err: any = await new CosmosClient(config()).request("CosmosMcpThing", QUERY).catch((e: any) => e);
    expect(err.kind).toBe("not_found");
    expect(err.message).toContain("Collection not found");
  });

  test("a query with some usable data still returns it", async () => {
    respond = () => json({ data: { thing: { id: 1 }, other: null }, errors: [{ message: "private" }] });
    expect(await new CosmosClient(config()).request<unknown>("CosmosMcpThing", QUERY)).toEqual({ thing: { id: 1 }, other: null });
  });
});

describe("viewer", () => {
  test("a 401 is remembered, so it costs one lookup", async () => {
    respond = () => json({ errors: [{ message: "nope", extensions: { code: "AUTHENTICATION" } }] }, 401);
    const client = new CosmosClient(config());
    expect(await client.viewer()).toBeNull();
    expect(await client.viewer()).toBeNull();
    expect(hits).toHaveLength(1);
  });

  test("a 403 is not remembered: it may be a WAF hiccup, not the credential", async () => {
    respond = (_b, hit) =>
      hit === 1 ? new Response("<html>denied</html>", { status: 403 }) : json({ data: { me: { id: 9, username: "u" } } });
    const client = new CosmosClient(config());
    expect(await client.viewer()).toBeNull();
    expect(await client.viewer()).toEqual({ id: 9, username: "u" });
  });

  test("verify() ignores a configured user id and really checks", async () => {
    respond = () => json({ errors: [{ message: "expired", extensions: { code: "AUTHENTICATION" } }] }, 401);
    const client = new CosmosClient(config({ userId: 42, username: "someone" }));
    expect(await client.viewer()).toEqual({ id: 42, username: "someone" });
    expect(await client.verify()).toBeNull();
  });

  test("verify() throws on a network-ish failure instead of calling it rejected", async () => {
    respond = () => new Response("down", { status: 503 });
    const err: any = await new CosmosClient(config()).verify().catch((e: any) => e);
    expect(err.kind).toBe("server");
  });
});

describe("picking up `cosmos-mcp login` without a restart", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  test("a stored credential written after start-up is used on the next call", async () => {
    const env = { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "cosmos-mcp-client-")) };
    dirs.push(env.XDG_CONFIG_HOME);
    const endpoint = config().endpoint;
    const load = () => ({ ...loadConfig(env), endpoint });

    respond = (b) =>
      b.operationName === "CosmosMcpViewer"
        ? json({ data: { me: { id: 9, username: "fresh" } } })
        : json({ data: { thing: { id: 1 } } });

    const initial = load();
    // Only meaningful when the developer has no `.env` credential that outranks the file.
    if (initial.credentialSource === "dotenv") return;

    const client = new CosmosClient(initial, { path: configPath(env), reload: load });
    expect(await client.viewer()).toBeNull();

    writeAuth({ authorization: "Bearer fresh" }, env);
    expect(await client.viewer()).toEqual({ id: 9, username: "fresh" });
    expect(hits.at(-1)!.authorization).toBe("Bearer fresh");

    clearAuth(env);
    expect(await client.viewer()).toBeNull();
  });
});
