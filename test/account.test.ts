import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CosmosClient } from "../src/graphql/client";
import { CosmosError } from "../src/errors";
import { PROFILE_COUNTS_QUERY, credentialSummary, registerAccountTools, signedOutPayload } from "../src/tools/account";

/* ------------------------------------------------------------------ *
 * Minimal stand-ins. Nothing here touches the network.
 * ------------------------------------------------------------------ */

interface Registered {
  config: any;
  handler: (args: any) => Promise<CallToolResult>;
}

function captureTools(register: typeof registerAccountTools, client: CosmosClient) {
  const tools = new Map<string, Registered>();
  const server = {
    registerTool(name: string, config: any, handler: any) {
      tools.set(name, { config, handler });
    },
  } as unknown as McpServer;
  register(server, { client });
  return tools;
}

interface FakeClientOptions {
  config?: Record<string, unknown>;
  hasCredentials?: boolean;
  viewer?: { id: number; username: string | null } | null;
  viewerError?: unknown;
  request?: (op: string, query: string, vars: Record<string, unknown>) => Promise<unknown>;
}

function fakeClient(opts: FakeClientOptions) {
  const calls: { op: string; query: string; vars: Record<string, unknown> }[] = [];
  const client = {
    config: opts.config ?? {},
    hasCredentials: opts.hasCredentials ?? false,
    async viewer() {
      if (opts.viewerError) throw opts.viewerError;
      return opts.viewer ?? null;
    },
    async requireViewer(operation: string) {
      const v = await this.viewer();
      if (v) return v;
      throw new CosmosError(`${operation}: not signed in.`, { kind: "unauthenticated", operation });
    },
    async request(op: string, query: string, vars: Record<string, unknown> = {}) {
      calls.push({ op, query, vars });
      if (!opts.request) throw new Error(`unexpected request: ${op}`);
      return opts.request(op, query, vars);
    },
  };
  return { client: client as unknown as CosmosClient, calls };
}

function payloadOf(result: CallToolResult): any {
  return result.structuredContent ?? JSON.parse((result.content[0] as { text: string }).text);
}

async function callWhoami(opts: FakeClientOptions) {
  const { client, calls } = fakeClient(opts);
  const tools = captureTools(registerAccountTools, client);
  const tool = tools.get("cosmos_whoami")!;
  return { tool, result: await tool.handler({}), calls };
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

describe("credentialSummary", () => {
  test("reports which knobs are set without leaking the values", () => {
    expect(credentialSummary({ cookie: "secret=1", userId: 7 })).toEqual({
      cookieConfigured: true,
      authorizationConfigured: false,
      userIdConfigured: true,
    });
    expect(credentialSummary({})).toEqual({
      cookieConfigured: false,
      authorizationConfigured: false,
      userIdConfigured: false,
    });
  });

  test("does not echo the credential itself", () => {
    const json = JSON.stringify(credentialSummary({ cookie: "session=hunter2", authorization: "Bearer abc" }));
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("Bearer");
  });
});

describe("signedOutPayload", () => {
  const cred = credentialSummary({});

  test("missing credential points at COSMOS_COOKIE", () => {
    const p = signedOutPayload(cred, "missing");
    expect(p.authenticated).toBe(false);
    expect(p.reason).toBe("missing");
    expect(p.howToFix).toContain("COSMOS_COOKIE");
    expect(p.toolsAvailableNow).toContain("cosmos_search");
    expect(p.toolsRequiringSignIn).toContain("cosmos_save_elements");
  });

  test("rejected credential says so explicitly", () => {
    const p = signedOutPayload(cred, "rejected");
    expect(p.summary).toContain("rejected");
    expect(p.toolsRequiringSignIn).not.toContain("cosmos_search");
  });
});

/* ------------------------------------------------------------------ *
 * cosmos_whoami
 * ------------------------------------------------------------------ */

describe("cosmos_whoami", () => {
  test("is annotated read-only and describes itself as the first call", async () => {
    const { tool } = await callWhoami({});
    expect(tool.config.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(tool.config.description).toContain("FIRST");
  });

  test("signed out is NOT an error result and explains the fix", async () => {
    const { result } = await callWhoami({ hasCredentials: false, viewer: null });
    expect(result.isError).toBeUndefined();
    const p = payloadOf(result);
    expect(p.authenticated).toBe(false);
    expect(p.reason).toBe("missing");
    expect(p.howToFix).toContain("COSMOS_COOKIE");
    expect(p.toolsAvailableNow.length).toBeGreaterThan(0);
  });

  test("credential present but unusable reports 'rejected'", async () => {
    const { result } = await callWhoami({ hasCredentials: true, viewer: null });
    const p = payloadOf(result);
    expect(p.authenticated).toBe(false);
    expect(p.reason).toBe("rejected");
  });

  test("signed in reports the viewer plus library counts", async () => {
    const { result, calls } = await callWhoami({
      hasCredentials: true,
      config: { cookie: "session=x" },
      viewer: { id: 100000001, username: "example-user" },
      request: async () => ({
        userClusters: { meta: { count: 3 } },
        allElementsV2: { meta: { count: 18 } },
      }),
    });
    const p = payloadOf(result);
    expect(p.authenticated).toBe(true);
    expect(p.viewer).toEqual({
      id: 100000001,
      username: "example-user",
      url: "https://www.cosmos.so/example-user",
    });
    expect(p.library).toEqual({ clusterCount: 3, elementCount: 18 });
    expect(p.credential.cookieConfigured).toBe(true);
    expect(calls[0]!.op).toBe("CosmosMcpProfileCounts");
    expect(calls[0]!.vars).toEqual({ userId: 100000001 });
  });

  test("COSMOS_USER_ID without a valid session is caught by the counts probe", async () => {
    const { result } = await callWhoami({
      hasCredentials: false,
      config: { userId: 42 },
      viewer: { id: 42, username: null },
      request: async () => {
        throw new CosmosError("not signed in", { kind: "unauthenticated" });
      },
    });
    expect(result.isError).toBeUndefined();
    const p = payloadOf(result);
    expect(p.authenticated).toBe(false);
    expect(p.reason).toBe("rejected");
    expect(p.note).toContain("COSMOS_USER_ID");
  });

  test("a transient failure does not get reported as signed out", async () => {
    const { result } = await callWhoami({
      hasCredentials: true,
      viewer: { id: 7, username: "someone" },
      request: async () => {
        throw new CosmosError("rate limited", { kind: "rate_limited" });
      },
    });
    const p = payloadOf(result);
    expect(p.authenticated).toBe(true);
    expect(p.library).toEqual({ clusterCount: null, elementCount: null });
  });

  test("a network error surfaces as an error result rather than a false negative", async () => {
    const { result } = await callWhoami({
      hasCredentials: true,
      viewerError: new CosmosError("socket hang up", { kind: "network" }),
    });
    expect(result.isError).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Live schema check. Unauthenticated, so it can only ever read errors.
 * ------------------------------------------------------------------ */

describe.skipIf(!process.env.COSMOS_LIVE_TESTS)("live schema validation", () => {
  test("CosmosMcpProfileCounts is accepted by api.cosmos.so", async () => {
    const res = await fetch("https://api.cosmos.so/graphql?q=CosmosMcpProfileCounts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-name": "cosmos-web",
        origin: "https://www.cosmos.so",
        referer: "https://www.cosmos.so/",
      },
      body: JSON.stringify({
        operationName: "CosmosMcpProfileCounts",
        query: PROFILE_COUNTS_QUERY,
        variables: { userId: 1 },
      }),
    });
    const body = (await res.json()) as { errors?: { extensions?: { code?: string } }[] };
    const codes = (body.errors ?? []).map((e) => e.extensions?.code);
    // Signed out, so AUTHENTICATION is expected; any *other* code means the
    // document no longer matches the schema.
    expect(codes.every((c) => c === "AUTHENTICATION")).toBe(true);
  }, 30_000);
});
