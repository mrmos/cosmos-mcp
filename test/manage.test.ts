import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CosmosClient } from "../src/graphql/client";
import { CosmosError } from "../src/errors";
import {
  ATTACH_CLUSTER_MUTATION,
  CLUSTER_FOR_UPDATE_QUERY,
  DELETE_CLUSTER_MUTATION,
  DETACH_CLUSTER_MUTATION,
  FOLLOW_CLUSTER_MUTATION,
  FOLLOW_USER_MUTATION,
  PIN_CLUSTER_MUTATION,
  SAVE_URL_MUTATION,
  UNFOLLOW_CLUSTER_MUTATION,
  UNFOLLOW_USER_MUTATION,
  UNPIN_CLUSTER_MUTATION,
  UPDATE_CLUSTER_MUTATION,
  describeClusterChanges,
  hasClusterUpdates,
  mergeClusterUpdate,
  normalizeCreatedElement,
  readClusterState,
  registerManageTools,
  type ClusterUpdateState,
} from "../src/tools/manage";

/* ------------------------------------------------------------------ *
 * Harness. No network, and no mutation ever leaves this process — the
 * fake client only records what it was asked to send.
 * ------------------------------------------------------------------ */

interface Registered {
  config: any;
  handler: (args: any) => Promise<CallToolResult>;
}

interface RequestCall {
  op: string;
  query: string;
  vars: Record<string, unknown>;
}

function harness(opts: {
  viewer?: { id: number; username: string | null } | null;
  respond?: (call: RequestCall) => unknown;
  usernameToId?: (username: string) => number;
}) {
  const calls: RequestCall[] = [];
  const client = {
    config: {},
    hasCredentials: opts.viewer != null,
    async viewer() {
      return opts.viewer ?? null;
    },
    async requireViewer(operation: string) {
      if (opts.viewer) return opts.viewer;
      throw new CosmosError(
        `${operation}: not signed in. Set COSMOS_COOKIE to the \`Cookie\` header from a signed-in cosmos.so browser session.`,
        { kind: "unauthenticated", operation },
      );
    },
    async userIdForUsername(username: string) {
      if (opts.usernameToId) return opts.usernameToId(username);
      throw new CosmosError(`No cosmos.so user named ${JSON.stringify(username)}`, { kind: "not_found" });
    },
    async request(op: string, query: string, vars: Record<string, unknown> = {}) {
      const call = { op, query, vars };
      calls.push(call);
      return opts.respond ? opts.respond(call) : {};
    },
  } as unknown as CosmosClient;

  const tools = new Map<string, Registered>();
  const server = {
    registerTool(name: string, config: any, handler: any) {
      tools.set(name, { config, handler });
    },
  } as unknown as McpServer;
  registerManageTools(server, { client });
  return { tools, calls };
}

const VIEWER = { id: 100000001, username: "example-user" };

function payloadOf(result: CallToolResult): any {
  return result.structuredContent ?? JSON.parse((result.content[0] as { text: string }).text);
}

/** Shape returned by CosmosMcpClusterForUpdate — ClusterCore plus coverImageElementId. */
const HAR_CLUSTER = {
  id: 344801244,
  name: "kitchen renovation",
  slug: "kitchen-renovation",
  description: "tiles and taps",
  isPrivate: true,
  isFeatured: false,
  isPublicElementsCluster: false,
  ownerId: VIEWER.id,
  owner: { username: "example-user" },
  parentClusterId: null,
  numberOfElements: 12,
  coverImageUrl: null,
  coverImageElementId: 5150,
  cover: { url: "https://cdn.cosmos.so/abc.webp", width: 100, height: 200, blurHash: "002Yne" },
};

const CURRENT: ClusterUpdateState = {
  id: 344801244,
  name: "kitchen renovation",
  description: "tiles and taps",
  isPrivate: true,
  coverImageElementId: 5150,
};

/* ------------------------------------------------------------------ *
 * mergeClusterUpdate — the dangerous bit. `UpdateClusterInput` requires
 * name AND isPrivate on every call, so anything the caller omitted has
 * to come back as the cluster's own current value.
 * ------------------------------------------------------------------ */

describe("mergeClusterUpdate", () => {
  test("a rename keeps privacy, description and cover exactly as they were", () => {
    expect(mergeClusterUpdate(CURRENT, { name: "kitchen v2" })).toEqual({
      id: 344801244,
      name: "kitchen v2",
      isPrivate: true,
      description: "tiles and taps",
      coverImageElementId: 5150,
    });
  });

  test("renaming a PRIVATE board never publishes it", () => {
    expect(mergeClusterUpdate(CURRENT, { name: "x" }).isPrivate).toBe(true);
  });

  test("renaming a PUBLIC board never un-publishes it either", () => {
    const publicBoard = { ...CURRENT, isPrivate: false };
    expect(mergeClusterUpdate(publicBoard, { name: "x" }).isPrivate).toBe(false);
  });

  test("isPrivate is only changed when the caller actually passes it", () => {
    expect(mergeClusterUpdate(CURRENT, { isPrivate: false }).isPrivate).toBe(false);
    expect(mergeClusterUpdate(CURRENT, { description: "d" }).isPrivate).toBe(true);
  });

  test("isPrivate: false is honoured and is not swallowed by a `||` default", () => {
    const merged = mergeClusterUpdate({ ...CURRENT, isPrivate: true }, { isPrivate: false });
    expect(merged.isPrivate).toBe(false);
  });

  test("an omitted description is preserved, not silently cleared", () => {
    expect(mergeClusterUpdate(CURRENT, { name: "x" }).description).toBe("tiles and taps");
  });

  test('description: "" clears it — the only way to remove one', () => {
    expect(mergeClusterUpdate(CURRENT, { description: "" }).description).toBeNull();
    expect(mergeClusterUpdate(CURRENT, { description: "   " }).description).toBeNull();
  });

  test("an omitted cover is echoed back so a rename cannot drop it", () => {
    expect(mergeClusterUpdate(CURRENT, { name: "x" }).coverImageElementId).toBe(5150);
  });

  test("a null current cover stays null rather than becoming undefined", () => {
    const merged = mergeClusterUpdate({ ...CURRENT, coverImageElementId: null }, { name: "x" });
    expect(merged.coverImageElementId).toBeNull();
  });

  test("the id always comes from the cluster that was read, never from the caller", () => {
    expect(mergeClusterUpdate(CURRENT, { name: "x" }).id).toBe(CURRENT.id);
  });

  test("every field at once", () => {
    expect(
      mergeClusterUpdate(CURRENT, {
        name: "new",
        description: "new desc",
        isPrivate: false,
        coverImageElementId: 99,
      }),
    ).toEqual({ id: 344801244, name: "new", isPrivate: false, description: "new desc", coverImageElementId: 99 });
  });
});

describe("hasClusterUpdates", () => {
  test("an empty arg set is a no-op", () => {
    expect(hasClusterUpdates({})).toBe(false);
  });

  test("falsy-but-present values still count as a change", () => {
    expect(hasClusterUpdates({ isPrivate: false })).toBe(true);
    expect(hasClusterUpdates({ description: "" })).toBe(true);
  });
});

describe("describeClusterChanges", () => {
  test("reports only what actually differs", () => {
    const next = mergeClusterUpdate(CURRENT, { name: "kitchen v2" });
    expect(describeClusterChanges(CURRENT, next)).toEqual(['renamed to "kitchen v2"']);
  });

  test("publishing is called out in capitals", () => {
    const next = mergeClusterUpdate(CURRENT, { isPrivate: false });
    expect(describeClusterChanges(CURRENT, next)).toEqual(["made PUBLIC"]);
  });

  test("a re-send of identical values reports nothing", () => {
    const next = mergeClusterUpdate(CURRENT, { name: CURRENT.name, isPrivate: true });
    expect(describeClusterChanges(CURRENT, next)).toEqual([]);
  });

  test("clearing a description is distinguished from changing it", () => {
    expect(describeClusterChanges(CURRENT, mergeClusterUpdate(CURRENT, { description: "" }))).toEqual([
      "description cleared",
    ]);
    expect(describeClusterChanges(CURRENT, mergeClusterUpdate(CURRENT, { description: "other" }))).toEqual([
      "description updated",
    ]);
  });
});

describe("readClusterState", () => {
  test("reads the four fields the update needs", () => {
    expect(readClusterState(HAR_CLUSTER)).toEqual(CURRENT);
  });

  test("a missing cluster is null, not a half-built state", () => {
    expect(readClusterState(null)).toBeNull();
    expect(readClusterState({ name: "x" })).toBeNull();
  });

  test("absent optional fields normalize to null / false", () => {
    expect(readClusterState({ id: 1, name: "n" })).toEqual({
      id: 1,
      name: "n",
      description: null,
      isPrivate: false,
      coverImageElementId: null,
    });
  });
});

describe("normalizeCreatedElement", () => {
  test("keeps the share url when the API returns one", () => {
    expect(
      normalizeCreatedElement({
        id: 38410868,
        __typename: "MediaElement",
        shareUrl: "https://www.cosmos.so/e/38410868",
        createdAt: "2026-08-05T00:00:00Z",
      }),
    ).toEqual({
      id: 38410868,
      type: "MediaElement",
      url: "https://www.cosmos.so/e/38410868",
      createdAt: "2026-08-05T00:00:00Z",
    });
  });

  test("synthesises a permalink when shareUrl is missing", () => {
    expect(normalizeCreatedElement({ id: 7 })!.url).toBe("https://www.cosmos.so/e/7");
  });

  test("rejects a node with no id", () => {
    expect(normalizeCreatedElement({ shareUrl: "x" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Registration and annotations
 * ------------------------------------------------------------------ */

describe("tool registration", () => {
  const { tools } = harness({ viewer: VIEWER });

  test("registers all seven management tools", () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        "cosmos_delete_cluster",
        "cosmos_follow_cluster",
        "cosmos_follow_user",
        "cosmos_nest_cluster",
        "cosmos_pin_cluster",
        "cosmos_save_url",
        "cosmos_update_cluster",
      ].sort(),
    );
  });

  test("only the deleting tool is flagged destructive, and none are read-only", () => {
    for (const [name, t] of tools) {
      expect(t.config.annotations.openWorldHint, name).toBe(true);
      expect(t.config.annotations.readOnlyHint, name).toBe(false);
      expect(t.config.annotations.destructiveHint, name).toBe(name === "cosmos_delete_cluster");
    }
  });

  test("delete_cluster's description says plainly that it cannot be undone", () => {
    const d = tools.get("cosmos_delete_cluster")!.config.description as string;
    expect(d).toContain("CANNOT BE UNDONE");
    expect(d).toContain("confirm: true");
  });

  test("update_cluster explains why it reads before it writes", () => {
    const d = tools.get("cosmos_update_cluster")!.config.description as string;
    expect(d).toContain("reads the board first");
    expect(d).toContain("cannot flip it public by accident");
  });

  test("update_cluster makes every argument but clusterId optional", () => {
    const schema = tools.get("cosmos_update_cluster")!.config.inputSchema;
    for (const key of ["name", "description", "isPrivate", "coverImageElementId"]) {
      expect(schema[key].safeParse(undefined).success, key).toBe(true);
    }
    expect(schema.clusterId.safeParse(undefined).success).toBe(false);
  });

  test("save_url points at the import routes it deliberately does not expose", () => {
    const d = tools.get("cosmos_save_url")!.config.description as string;
    expect(d).toContain("import.request");
    expect(d).toContain("import.requestFromUrls");
  });
});

/* ------------------------------------------------------------------ *
 * cosmos_save_url
 * ------------------------------------------------------------------ */

describe("cosmos_save_url", () => {
  const created = { id: 900, __typename: "MediaElement", shareUrl: "https://www.cosmos.so/e/900", createdAt: null };

  test("sends exactly one content field and nulls the rest", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: () => ({ element: { create: created } }) });
    const p = payloadOf(await tools.get("cosmos_save_url")!.handler({ url: "https://example.com/a.jpg" }));
    expect(calls[0]!.op).toBe("CosmosMcpSaveUrl");
    expect(calls[0]!.query).toBe(SAVE_URL_MUTATION);
    expect(calls[0]!.vars).toEqual({
      userId: VIEWER.id,
      url: "https://example.com/a.jpg",
      sourceUrl: null,
      clusterId: null,
    });
    expect(calls[0]!.query).not.toContain("text:");
    expect(calls[0]!.query).not.toContain("image:");
    expect(calls[0]!.query).not.toContain("videoS3ObjectKey");
    expect(p.success).toBe(true);
    expect(p.element.id).toBe(900);
    expect(p.summary).toContain("unfiled");
  });

  test("clusterId and sourceUrl are forwarded when given", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: () => ({ element: { create: created } }) });
    const p = payloadOf(
      await tools.get("cosmos_save_url")!.handler({
        url: "https://example.com/a.jpg",
        clusterId: 344801244,
        sourceUrl: "https://example.com/post",
      }),
    );
    expect(calls[0]!.vars.clusterId).toBe(344801244);
    expect(calls[0]!.vars.sourceUrl).toBe("https://example.com/post");
    expect(p.clusterId).toBe(344801244);
    expect(p.summary).toContain("cluster 344801244");
  });

  test("an element-less response is reported rather than faked", async () => {
    const { tools } = harness({ viewer: VIEWER, respond: () => ({ element: { create: null } }) });
    const p = payloadOf(await tools.get("cosmos_save_url")!.handler({ url: "https://example.com/a.jpg" }));
    expect(p.success).toBe(false);
    expect(p.element).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * cosmos_update_cluster — read-modify-write
 * ------------------------------------------------------------------ */

function updateHarness(cluster: any = HAR_CLUSTER, success = true) {
  return harness({
    viewer: VIEWER,
    respond: (call) =>
      call.op === "CosmosMcpClusterForUpdate"
        ? { cluster }
        : { cluster: { update: { success } } },
  });
}

describe("cosmos_update_cluster", () => {
  test("a rename reads first, then echoes the untouched fields back", async () => {
    const { tools, calls } = updateHarness();
    const p = payloadOf(
      await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244, name: "kitchen v2" }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]!.op).toBe("CosmosMcpClusterForUpdate");
    expect(calls[0]!.query).toBe(CLUSTER_FOR_UPDATE_QUERY);
    expect(calls[0]!.vars).toEqual({ clusterId: 344801244 });

    expect(calls[1]!.op).toBe("CosmosMcpUpdateCluster");
    expect(calls[1]!.query).toBe(UPDATE_CLUSTER_MUTATION);
    expect(calls[1]!.vars).toEqual({
      id: 344801244,
      name: "kitchen v2",
      isPrivate: true, // echoed, NOT defaulted
      description: "tiles and taps", // echoed
      coverImageElementId: 5150, // echoed
    });
    expect(p.success).toBe(true);
    expect(p.changes).toEqual(['renamed to "kitchen v2"']);
  });

  test("renaming a private board does not publish it — the whole point of the read", async () => {
    const { tools, calls } = updateHarness();
    await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244, name: "x" });
    expect(calls[1]!.vars.isPrivate).toBe(true);
  });

  test("renaming a public board does not privatise it either", async () => {
    const { tools, calls } = updateHarness({ ...HAR_CLUSTER, isPrivate: false });
    await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244, name: "x" });
    expect(calls[1]!.vars.isPrivate).toBe(false);
  });

  test("an explicit publish is sent and shouted about in the summary", async () => {
    const { tools, calls } = updateHarness();
    const p = payloadOf(
      await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244, isPrivate: false }),
    );
    expect(calls[1]!.vars.isPrivate).toBe(false);
    expect(calls[1]!.vars.name).toBe("kitchen renovation");
    expect(p.summary).toContain("made PUBLIC");
  });

  test("the mutation selects only `success` — cluster.update returns MutationResponse", () => {
    // Selecting id/name here is a hard FIELDS_ON_CORRECT_TYPE error against the
    // live schema: `cluster.update` returns MutationResponse, not a Cluster.
    const flat = UPDATE_CLUSTER_MUTATION.replace(/\s+/g, " ").trim();
    expect(flat).toEndWith("} ) { success } } }");
  });

  test("no arguments means no network traffic at all", async () => {
    const { tools, calls } = updateHarness();
    const p = payloadOf(await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244 }));
    expect(calls).toHaveLength(0);
    expect(p.success).toBe(false);
    expect(p.summary).toContain("Nothing to do");
  });

  test("values identical to the current ones read but never write", async () => {
    const { tools, calls } = updateHarness();
    const p = payloadOf(
      await tools
        .get("cosmos_update_cluster")!
        .handler({ clusterId: 344801244, name: "kitchen renovation", isPrivate: true }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.op).toBe("CosmosMcpClusterForUpdate");
    expect(p.changes).toEqual([]);
    expect(p.success).toBe(true);
  });

  test("a cluster that cannot be read fails loudly instead of writing a guess", async () => {
    const { tools, calls } = updateHarness(null);
    const result = await tools.get("cosmos_update_cluster")!.handler({ clusterId: 1, name: "x" });
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.error).toBe("not_found");
    expect(calls).toHaveLength(1);
  });

  test("an unconfirmed update is reported, not assumed", async () => {
    const { tools } = updateHarness(HAR_CLUSTER, false);
    const p = payloadOf(await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244, name: "x" }));
    expect(p.success).toBe(false);
    expect(p.summary).toContain("did not confirm");
  });

  test("the returned cluster reflects the merge, not the pre-update read", async () => {
    const { tools } = updateHarness();
    const p = payloadOf(
      await tools.get("cosmos_update_cluster")!.handler({ clusterId: 344801244, name: "new name", description: "" }),
    );
    expect(p.cluster.name).toBe("new name");
    expect(p.cluster.description).toBeNull();
    expect(p.cluster.isPrivate).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * cosmos_delete_cluster
 * ------------------------------------------------------------------ */

describe("cosmos_delete_cluster", () => {
  test("refuses without confirm and sends nothing", async () => {
    const { tools, calls } = harness({ viewer: VIEWER });
    const p = payloadOf(await tools.get("cosmos_delete_cluster")!.handler({ clusterId: 344801244 }));
    expect(calls).toHaveLength(0);
    expect(p.success).toBe(false);
    expect(p.deleted).toBe(false);
    expect(p.confirmationRequired).toBe(true);
    expect(p.summary).toContain("cannot be undone");
  });

  test("confirm: false is still a refusal", async () => {
    const { tools, calls } = harness({ viewer: VIEWER });
    const p = payloadOf(
      await tools.get("cosmos_delete_cluster")!.handler({ clusterId: 344801244, confirm: false }),
    );
    expect(calls).toHaveLength(0);
    expect(p.deleted).toBe(false);
  });

  test("confirm: true deletes exactly one board by id", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { deleteCluster: { success: true } } }),
    });
    const p = payloadOf(
      await tools.get("cosmos_delete_cluster")!.handler({ clusterId: 344801244, confirm: true }),
    );
    expect(calls[0]!.query).toBe(DELETE_CLUSTER_MUTATION);
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, id: 344801244 });
    // The plural DeleteClustersInput form is deliberately not used.
    expect(calls[0]!.query).not.toContain("clusterIds");
    expect(p.deleted).toBe(true);
  });

  test("an unconfirmed delete is not reported as done", async () => {
    const { tools } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { deleteCluster: { success: false } } }),
    });
    const p = payloadOf(await tools.get("cosmos_delete_cluster")!.handler({ clusterId: 1, confirm: true }));
    expect(p.deleted).toBe(false);
    expect(p.summary).toContain("did not confirm");
  });
});

/* ------------------------------------------------------------------ *
 * cosmos_nest_cluster
 * ------------------------------------------------------------------ */

describe("cosmos_nest_cluster", () => {
  const attachOk = () => ({ cluster: { attachToParent: { success: true } } });
  const detachOk = () => ({ cluster: { detachFromParent: { success: true } } });

  test("parentClusterId nests via attachToParent", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: attachOk });
    const p = payloadOf(
      await tools.get("cosmos_nest_cluster")!.handler({ clusterId: 2, parentClusterId: 1 }),
    );
    expect(calls[0]!.query).toBe(ATTACH_CLUSTER_MUTATION);
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, clusterId: 2, parentClusterId: 1 });
    expect(p.parentClusterId).toBe(1);
    expect(p.detached).toBe(false);
  });

  test("detach: true un-nests via detachFromParent", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: detachOk });
    const p = payloadOf(await tools.get("cosmos_nest_cluster")!.handler({ clusterId: 2, detach: true }));
    expect(calls[0]!.query).toBe(DETACH_CLUSTER_MUTATION);
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, clusterId: 2 });
    expect(p.parentClusterId).toBeNull();
    expect(p.detached).toBe(true);
  });

  test("both arguments together are refused before any request", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: attachOk });
    const p = payloadOf(
      await tools.get("cosmos_nest_cluster")!.handler({ clusterId: 2, parentClusterId: 1, detach: true }),
    );
    expect(calls).toHaveLength(0);
    expect(p.success).toBe(false);
    expect(p.summary).toContain("not both");
  });

  test("neither argument is a no-op", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: attachOk });
    const p = payloadOf(await tools.get("cosmos_nest_cluster")!.handler({ clusterId: 2 }));
    expect(calls).toHaveLength(0);
    expect(p.summary).toContain("Nothing to do");
  });

  test("a board cannot be nested inside itself", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: attachOk });
    const p = payloadOf(
      await tools.get("cosmos_nest_cluster")!.handler({ clusterId: 2, parentClusterId: 2 }),
    );
    expect(calls).toHaveLength(0);
    expect(p.success).toBe(false);
    expect(p.summary).toContain("its own parent");
  });

  test("detach: false with a parent still nests", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, respond: attachOk });
    await tools.get("cosmos_nest_cluster")!.handler({ clusterId: 2, parentClusterId: 1, detach: false });
    expect(calls[0]!.query).toBe(ATTACH_CLUSTER_MUTATION);
  });
});

/* ------------------------------------------------------------------ *
 * follow / pin
 * ------------------------------------------------------------------ */

describe("cosmos_follow_cluster", () => {
  test("defaults to following", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { follow: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_follow_cluster")!.handler({ clusterId: 7 }));
    expect(calls[0]!.op).toBe("CosmosMcpFollowCluster");
    expect(calls[0]!.query).toBe(FOLLOW_CLUSTER_MUTATION);
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, clusterId: 7 });
    expect(p.following).toBe(true);
  });

  test("follow: false switches to the unfollow mutation", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { unfollow: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_follow_cluster")!.handler({ clusterId: 7, follow: false }));
    expect(calls[0]!.op).toBe("CosmosMcpUnfollowCluster");
    expect(calls[0]!.query).toBe(UNFOLLOW_CLUSTER_MUTATION);
    expect(p.success).toBe(true);
    expect(p.following).toBe(false);
  });
});

describe("cosmos_follow_user", () => {
  test("follows by numeric id", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ userFollow: { create: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_follow_user")!.handler({ userId: 42 }));
    expect(calls[0]!.query).toBe(FOLLOW_USER_MUTATION);
    expect(calls[0]!.vars).toEqual({ followerId: VIEWER.id, followeeId: 42 });
    expect(p.following).toBe(true);
  });

  test("resolves a username to an id first", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      usernameToId: () => 42,
      respond: () => ({ userFollow: { create: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_follow_user")!.handler({ username: "someone" }));
    expect(calls[0]!.vars.followeeId).toBe(42);
    expect(p.username).toBe("someone");
    expect(p.summary).toContain("@someone");
  });

  test("unfollowing uses userFollow.delete", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ userFollow: { delete: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_follow_user")!.handler({ userId: 42, follow: false }));
    expect(calls[0]!.query).toBe(UNFOLLOW_USER_MUTATION);
    expect(p.following).toBe(false);
  });

  test("both or neither identifier is refused without a request", async () => {
    const { tools, calls } = harness({ viewer: VIEWER, usernameToId: () => 42 });
    expect(payloadOf(await tools.get("cosmos_follow_user")!.handler({})).success).toBe(false);
    expect(
      payloadOf(await tools.get("cosmos_follow_user")!.handler({ userId: 1, username: "a" })).success,
    ).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("following yourself is refused", async () => {
    const { tools, calls } = harness({ viewer: VIEWER });
    const p = payloadOf(await tools.get("cosmos_follow_user")!.handler({ userId: VIEWER.id }));
    expect(calls).toHaveLength(0);
    expect(p.summary).toContain("cannot follow yourself");
  });
});

describe("cosmos_pin_cluster", () => {
  test("pins through userProfile, not cluster", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ userProfile: { pinCluster: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_pin_cluster")!.handler({ clusterId: 7 }));
    expect(calls[0]!.query).toBe(PIN_CLUSTER_MUTATION);
    expect(calls[0]!.query).toContain("userProfile");
    expect(calls[0]!.query).not.toContain("cluster {");
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, clusterId: 7 });
    expect(p.pinned).toBe(true);
  });

  test("pin: false unpins", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ userProfile: { unpinCluster: { success: true } } }),
    });
    const p = payloadOf(await tools.get("cosmos_pin_cluster")!.handler({ clusterId: 7, pin: false }));
    expect(calls[0]!.query).toBe(UNPIN_CLUSTER_MUTATION);
    expect(p.success).toBe(true);
    expect(p.pinned).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Signed out
 * ------------------------------------------------------------------ */

describe("signed out", () => {
  test("every management tool fails with the actionable auth message and no request", async () => {
    const { tools, calls } = harness({ viewer: null });
    const args: Record<string, unknown> = {
      clusterId: 1,
      parentClusterId: 2,
      userId: 3,
      url: "https://example.com/a.jpg",
      name: "x",
      confirm: true,
    };
    for (const [name, t] of tools) {
      const result = await t.handler(args);
      expect(result.isError, name).toBe(true);
      const body = JSON.parse((result.content[0] as { text: string }).text);
      expect(body.error, name).toBe("unauthenticated");
      expect(body.message, name).toContain("COSMOS_COOKIE");
    }
    // Nothing was sent — in particular the delete never reached the network.
    expect(calls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Live schema check.
 *
 * Unauthenticated, so nothing executes: the server rejects on AUTHENTICATION
 * before any mutation runs, and every id below is a fake `1`. This proves the
 * documents validate, nothing more.
 *
 * NOTE ON WHAT THIS DOES *NOT* PROVE: variable coercion happens AFTER the auth
 * check, so a bogus value inside `variables` still yields a clean 401. The
 * input-object shapes were therefore also verified by inlining them as literals
 * in the query text, where wrong field names give `Unknown field` and wrong
 * types give `Expected type 'X'`. See docs/schema-discovery.md.
 * ------------------------------------------------------------------ */

describe.skipIf(!process.env.COSMOS_LIVE_TESTS)("live schema validation", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    [
      "CosmosMcpSaveUrl",
      SAVE_URL_MUTATION,
      { userId: 1, url: "https://example.com/a.jpg", sourceUrl: null, clusterId: null },
    ],
    ["CosmosMcpClusterForUpdate", CLUSTER_FOR_UPDATE_QUERY, { clusterId: 1 }],
    [
      "CosmosMcpUpdateCluster",
      UPDATE_CLUSTER_MUTATION,
      { id: 1, name: "probe", isPrivate: true, description: null, coverImageElementId: null },
    ],
    ["CosmosMcpDeleteCluster", DELETE_CLUSTER_MUTATION, { userId: 1, id: 1 }],
    ["CosmosMcpAttachCluster", ATTACH_CLUSTER_MUTATION, { userId: 1, clusterId: 1, parentClusterId: 1 }],
    ["CosmosMcpDetachCluster", DETACH_CLUSTER_MUTATION, { userId: 1, clusterId: 1 }],
    ["CosmosMcpFollowCluster", FOLLOW_CLUSTER_MUTATION, { userId: 1, clusterId: 1 }],
    ["CosmosMcpUnfollowCluster", UNFOLLOW_CLUSTER_MUTATION, { userId: 1, clusterId: 1 }],
    ["CosmosMcpFollowUser", FOLLOW_USER_MUTATION, { followerId: 1, followeeId: 2 }],
    ["CosmosMcpUnfollowUser", UNFOLLOW_USER_MUTATION, { followerId: 1, followeeId: 2 }],
    ["CosmosMcpPinCluster", PIN_CLUSTER_MUTATION, { userId: 1, clusterId: 1 }],
    ["CosmosMcpUnpinCluster", UNPIN_CLUSTER_MUTATION, { userId: 1, clusterId: 1 }],
  ];

  test.each(cases)("%s is accepted by the live schema", async (op, query, variables) => {
    const res = await fetch(`https://api.cosmos.so/graphql?q=${encodeURIComponent(op)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-name": "cosmos-web",
        origin: "https://www.cosmos.so",
        referer: "https://www.cosmos.so/",
      },
      body: JSON.stringify({ operationName: op, query, variables }),
    });
    const body = (await res.json()) as { errors?: { extensions?: { code?: string }; message: string }[] };
    const errors = body.errors ?? [];
    // AUTHENTICATION is the only acceptable code for a mutation. The one query
    // here, CosmosMcpClusterForUpdate, is public and reaches execution, where
    // cluster id 1 is legitimately NOT_FOUND — which also proves it validated.
    const other = errors.filter(
      (e) => e.extensions?.code !== "AUTHENTICATION" && e.extensions?.code !== "NOT_FOUND",
    );
    expect(other.map((e) => e.message)).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  }, 30_000);
});
