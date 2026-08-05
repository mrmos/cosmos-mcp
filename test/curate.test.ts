import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CosmosClient } from "../src/graphql/client";
import { CosmosError } from "../src/errors";
import {
  ACTIVITY_QUERY,
  ADD_ELEMENTS_MUTATION,
  CONNECTABLE_CLUSTERS_QUERY,
  CREATE_CLUSTER_MUTATION,
  EDIT_CONNECTIONS_MUTATION,
  FOLLOWING_FEED_QUERY,
  MY_CLUSTERS_QUERY,
  MY_LIBRARY_QUERY,
  QUICK_CONNECT_QUERY,
  buildLibraryVariables,
  buildMyClustersVariables,
  collectFollowSuggestions,
  describeActivity,
  normalizeActivity,
  normalizeConnectableCluster,
  normalizeFeedItem,
  normalizeMyCluster,
  registerCurateTools,
} from "../src/tools/curate";

/* ------------------------------------------------------------------ *
 * Harness. No network, and no mutation ever leaves this process.
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
  registerCurateTools(server, { client });
  return { tools, calls };
}

const VIEWER = { id: 100000001, username: "example-user" };

function payloadOf(result: CallToolResult): any {
  return result.structuredContent ?? JSON.parse((result.content[0] as { text: string }).text);
}

/* ------------------------------------------------------------------ *
 * Variable building
 * ------------------------------------------------------------------ */

describe("buildMyClustersVariables", () => {
  test("defaults to most-recently-updated first and omits an empty search", () => {
    expect(buildMyClustersVariables({ userId: 1 })).toEqual({
      userId: 1,
      searchTerm: null,
      pageSize: 20,
      pageCursor: null,
      sortDefinitions: [{ sortField: "UPDATED_AT", sortDirection: "DESC" }],
    });
  });

  test("trims the search term and honours paging and sort overrides", () => {
    expect(
      buildMyClustersVariables({
        userId: 9,
        search: "  kitchen  ",
        sortBy: "NAME",
        sortDirection: "ASC",
        limit: 5,
        cursor: "abc",
      }),
    ).toEqual({
      userId: 9,
      searchTerm: "kitchen",
      pageSize: 5,
      pageCursor: "abc",
      sortDefinitions: [{ sortField: "NAME", sortDirection: "ASC" }],
    });
  });

  test("whitespace-only search collapses to null rather than matching nothing", () => {
    expect(buildMyClustersVariables({ userId: 1, search: "   " }).searchTerm).toBeNull();
  });
});

describe("buildLibraryVariables", () => {
  test("sends null filters when nothing was asked for", () => {
    expect(buildLibraryVariables({ userId: 1 })).toEqual({
      userId: 1,
      filters: null,
      order: null,
      pageSize: 20,
      pageCursor: null,
    });
  });

  test("maps the two verified filter fields", () => {
    expect(
      buildLibraryVariables({ userId: 1, contentType: "VIDEO", unsortedOnly: true, order: "OLDEST", limit: 3 }),
    ).toEqual({
      userId: 1,
      filters: { contentType: "VIDEO", isUnsorted: true },
      order: "OLDEST",
      pageSize: 3,
      pageCursor: null,
    });
  });

  test("unsortedOnly:false is not sent — the filter only means 'restrict'", () => {
    expect(buildLibraryVariables({ userId: 1, unsortedOnly: false }).filters).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Normalizers, against shapes copied from docs/har-ops
 * ------------------------------------------------------------------ */

const HAR_CLUSTER = {
  id: 344801244,
  name: "example board",
  slug: "site-inspo",
  description: null,
  isPrivate: false,
  isFeatured: false,
  isPublicElementsCluster: false,
  ownerId: 100000001,
  owner: { username: "example-user" },
  parentClusterId: null,
  numberOfElements: 7,
  coverImageUrl: null,
  cover: {
    url: "https://cdn.cosmos.so/96a9af7f-8768-4d92-b27b-368088b9db67.webp",
    width: 100,
    height: 200,
    blurHash: "002Yne",
  },
  subClusters: {
    items: [{ id: 999, name: "sub", slug: "sub", isPrivate: true, numberOfElements: 2 }],
  },
};

describe("normalizeMyCluster", () => {
  test("keeps the cluster shape and folds subclusters in", () => {
    const c = normalizeMyCluster(HAR_CLUSTER, 400)!;
    expect(c.id).toBe(344801244);
    expect(c.url).toBe("https://www.cosmos.so/example-user/site-inspo");
    expect(c.elementCount).toBe(7);
    expect(c.coverUrl).toContain("w=400");
    expect(c.subClusters).toEqual([{ id: 999, name: "sub", slug: "sub", isPrivate: true, elementCount: 2 }]);
  });

  test("a cluster with no subclusters gets an empty list, not undefined", () => {
    expect(normalizeMyCluster({ ...HAR_CLUSTER, subClusters: { items: [] } }, 400)!.subClusters).toEqual([]);
  });

  test("rejects a node with no id", () => {
    expect(normalizeMyCluster({ name: "x" }, 400)).toBeNull();
  });
});

describe("normalizeConnectableCluster", () => {
  const node = {
    cluster: {
      id: 53787248,
      name: "things i like",
      slug: "things-i-like",
      coverImage: { url: "https://cdn.cosmos.so/5f2044a9-b806-4f7f-a77a-0f1c8c9f8721" },
      url: "https://www.cosmos.so/example-user/things-i-like",
      numberOfElements: 10,
      hasSubClusters: false,
      isPrivate: false,
    },
    hasConnections: true,
  };

  test("uses the ClusterCard url verbatim and surfaces existing membership", () => {
    const c = normalizeConnectableCluster(node, 200)!;
    expect(c.url).toBe("https://www.cosmos.so/example-user/things-i-like");
    expect(c.alreadyContainsElements).toBe(true);
    expect(c.coverUrl).toContain("w=200");
  });

  test("hasConnections false means safe to save", () => {
    expect(normalizeConnectableCluster({ ...node, hasConnections: false }, 200)!.alreadyContainsElements).toBe(false);
  });
});

describe("activity normalizing", () => {
  const follow = {
    id: 738810404,
    isRead: true,
    createdAt: "2026-07-26T03:10:40.597442Z",
    __typename: "UserFollowedActivity",
    follower: { id: 108564255, username: "cosmos", fullName: "Cosmos" },
  };

  test("renders a follow as a sentence and keeps the actor", () => {
    const a = normalizeActivity(follow)!;
    expect(a.type).toBe("UserFollowedActivity");
    expect(a.text).toBe("@cosmos followed you");
    expect(a.actor).toEqual({ id: 108564255, username: "cosmos" });
    expect(a.cluster).toBeNull();
    expect(a.isRead).toBe(true);
  });

  test("cluster-bearing activities get a clickable url", () => {
    const a = normalizeActivity({
      id: 2,
      isRead: false,
      createdAt: null,
      __typename: "UsersFollowedYourClusterAggregatableActivity",
      numberOfFollows: 4,
      lastFollower: { id: 5, username: "someone" },
      cluster: { id: 7, name: "example board", slug: "site-inspo", owner: { id: 1, username: "example-user" } },
    })!;
    expect(a.cluster).toEqual({ id: 7, name: "example board", url: "https://www.cosmos.so/example-user/site-inspo" });
    expect(a.text).toContain("4 people followed your cluster");
  });

  test("an unknown union member degrades to its typename instead of throwing", () => {
    expect(describeActivity({ __typename: "SomeFutureActivity" })).toBe("SomeFutureActivity");
    expect(normalizeActivity({ id: 3, __typename: "SomeFutureActivity" })!.text).toBe("SomeFutureActivity");
  });

  test("import activities mention the source", () => {
    expect(
      describeActivity({
        __typename: "ImportCompleteAtomicActivity",
        source: "PINTEREST",
        numberOfElements: 12,
        cluster: { name: "imported" },
      }),
    ).toContain("PINTEREST");
  });
});

describe("following feed normalizing", () => {
  const item = {
    feedSession: {
      id: "sess-1",
      clusterId: 344801244,
      elementCount: 2,
      startedAt: "2026-07-01T00:00:00Z",
      finishedAt: "2026-07-01T00:05:00Z",
      collaborator: { id: 1, username: "curator", fullName: "A Curator" },
      cluster: HAR_CLUSTER,
      elementTiles: [
        {
          __typename: "MediaElementTile",
          id: 38410868,
          ownerId: 1,
          owner: { username: "curator" },
          shareUrl: "https://www.cosmos.so/e/38410868",
          media: {
            __typename: "StaticImage",
            mediaId: "m1",
            url: "https://cdn.cosmos.so/m1",
            width: 100,
            height: 50,
            notSafeForWorkStatus: "SAFE",
          },
        },
        { id: null },
      ],
    },
    userFollowSuggestions: [
      {
        suggestedUserId: 42,
        reason: "MUTUALS",
        mutualConnectionsCount: 3,
        mostPopularClusterName: "type",
        suggestedUser: { id: 42, username: "someone", fullName: "Some One" },
      },
    ],
  };

  test("keeps the session, its cluster and its usable elements", () => {
    const s = normalizeFeedItem(item, 400)!;
    expect(s.by).toEqual({ id: 1, username: "curator", fullName: "A Curator" });
    expect(s.cluster!.id).toBe(344801244);
    expect(s.elements).toHaveLength(1);
    expect(s.elements[0]!.id).toBe(38410868);
  });

  test("a suggestions-only feed item is not a session", () => {
    expect(normalizeFeedItem({ feedSession: null, userFollowSuggestions: [] }, 400)).toBeNull();
  });

  test("suggestions are collected separately and tolerate a single object", () => {
    expect(collectFollowSuggestions([item])).toEqual([
      {
        userId: 42,
        username: "someone",
        fullName: "Some One",
        reason: "MUTUALS",
        mutualConnections: 3,
        popularCluster: "type",
      },
    ]);
    expect(collectFollowSuggestions([{ userFollowSuggestions: { suggestedUserId: 1 } }])).toHaveLength(1);
    expect(collectFollowSuggestions([{ userFollowSuggestions: null }])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Registration and annotations
 * ------------------------------------------------------------------ */

describe("tool registration", () => {
  const { tools } = harness({ viewer: VIEWER });

  test("registers all nine curation tools", () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        "cosmos_activity",
        "cosmos_create_cluster",
        "cosmos_find_clusters_for_element",
        "cosmos_following_feed",
        "cosmos_list_my_clusters",
        "cosmos_my_library",
        "cosmos_organize_elements",
        "cosmos_quick_connect_suggestion",
        "cosmos_save_elements",
      ].sort(),
    );
  });

  test("only the disconnect-capable tool is flagged destructive", () => {
    for (const [name, t] of tools) {
      expect(t.config.annotations.openWorldHint).toBe(true);
      expect(t.config.annotations.destructiveHint).toBe(name === "cosmos_organize_elements");
    }
  });

  test("writes are not marked read-only, reads are", () => {
    const writes = ["cosmos_create_cluster", "cosmos_save_elements", "cosmos_organize_elements"];
    for (const [name, t] of tools) {
      expect(t.config.annotations.readOnlyHint).toBe(!writes.includes(name));
    }
  });

  test("create_cluster's description states the private-by-default choice", () => {
    const d = tools.get("cosmos_create_cluster")!.config.description as string;
    expect(d).toContain("defaults to **true**");
    expect(tools.get("cosmos_create_cluster")!.config.inputSchema.isPrivate.safeParse(undefined).success).toBe(true);
  });

  test("organize_elements' description warns about removal", () => {
    const d = tools.get("cosmos_organize_elements")!.config.description as string;
    expect(d).toContain("DESTRUCTIVE");
    expect(d).toContain("no undo");
  });
});

/* ------------------------------------------------------------------ *
 * Handlers — variables in, normalized payload out
 * ------------------------------------------------------------------ */

describe("cosmos_list_my_clusters", () => {
  test("pages the viewer's own clusters, private ones included", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({
        clusters: {
          items: [HAR_CLUSTER, { ...HAR_CLUSTER, id: 194307119, name: "private", slug: "private", isPrivate: true }],
          meta: { nextPageCursor: "next", count: 2 },
        },
      }),
    });
    const p = payloadOf(await tools.get("cosmos_list_my_clusters")!.handler({ search: "site", limit: 2 }));
    expect(calls[0]!.op).toBe("CosmosMcpMyClusters");
    expect(calls[0]!.vars.searchTerm).toBe("site");
    expect(calls[0]!.vars.userId).toBe(VIEWER.id);
    expect(p.items).toHaveLength(2);
    expect(p.items[1].isPrivate).toBe(true);
    expect(p.nextCursor).toBe("next");
    expect(p.totalCount).toBe(2);
  });
});

describe("cosmos_create_cluster", () => {
  test("defaults to private and returns the normalized cluster", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { create: { ...HAR_CLUSTER, isPrivate: true, name: "kitchen" } } }),
    });
    const result = await tools.get("cosmos_create_cluster")!.handler({ name: "kitchen" });
    expect(calls[0]!.query).toBe(CREATE_CLUSTER_MUTATION);
    expect(calls[0]!.vars).toEqual({
      userId: VIEWER.id,
      name: "kitchen",
      description: null,
      isPrivate: true,
    });
    const p = payloadOf(result);
    expect(p.summary).toContain("private");
    expect(p.cluster.url).toBe("https://www.cosmos.so/example-user/site-inspo");
  });

  test("public boards are called out loudly in the summary", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { create: { ...HAR_CLUSTER, isPrivate: false } } }),
    });
    const p = payloadOf(
      await tools.get("cosmos_create_cluster")!.handler({ name: "public one", isPrivate: false, description: "d" }),
    );
    expect(calls[0]!.vars.isPrivate).toBe(false);
    expect(calls[0]!.vars.description).toBe("d");
    expect(p.summary).toContain("PUBLIC");
  });
});

describe("cosmos_save_elements", () => {
  test("sends the ids and reports the confirmed save", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { addElementsToCluster: { success: true } } }),
    });
    const p = payloadOf(
      await tools.get("cosmos_save_elements")!.handler({ clusterId: 53787248, elementIds: [1, 2, 3] }),
    );
    expect(calls[0]!.query).toBe(ADD_ELEMENTS_MUTATION);
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, elementIds: [1, 2, 3], clusterId: 53787248 });
    expect(calls[0]!.query).not.toContain("elementAnalyticsProperties");
    expect(p.success).toBe(true);
    expect(p.summary).toContain("3 element(s)");
  });

  test("an unconfirmed save is reported, not silently swallowed", async () => {
    const { tools } = harness({
      viewer: VIEWER,
      respond: () => ({ cluster: { addElementsToCluster: { success: false } } }),
    });
    const p = payloadOf(await tools.get("cosmos_save_elements")!.handler({ clusterId: 1, elementIds: [1] }));
    expect(p.success).toBe(false);
    expect(p.summary).toContain("did not confirm");
  });
});

describe("cosmos_organize_elements", () => {
  test("connect-only behaves like a multi-board save", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({ element: { editElementsConnectionsToClusters: { success: true } } }),
    });
    const p = payloadOf(
      await tools.get("cosmos_organize_elements")!.handler({ elementIds: [38410868], clusterIdsToConnect: [1, 2] }),
    );
    expect(calls[0]!.query).toBe(EDIT_CONNECTIONS_MUTATION);
    expect(calls[0]!.vars).toEqual({
      userId: VIEWER.id,
      elementIds: [38410868],
      clusterIdsToConnect: [1, 2],
      clusterIdsToDisconnect: [],
    });
    expect(p.summary).toContain("added to 2 cluster(s)");
    expect(p.summary).not.toContain("REMOVED");
  });

  test("a move reports both halves", async () => {
    const { tools } = harness({
      viewer: VIEWER,
      respond: () => ({ element: { editElementsConnectionsToClusters: { success: true } } }),
    });
    const p = payloadOf(
      await tools
        .get("cosmos_organize_elements")!
        .handler({ elementIds: [1], clusterIdsToConnect: [2], clusterIdsToDisconnect: [3] }),
    );
    expect(p.summary).toContain("added to 1 cluster(s)");
    expect(p.summary).toContain("REMOVED from 1 cluster(s)");
  });

  test("a no-op call never reaches the network", async () => {
    const { tools, calls } = harness({ viewer: VIEWER });
    const p = payloadOf(await tools.get("cosmos_organize_elements")!.handler({ elementIds: [1] }));
    expect(calls).toHaveLength(0);
    expect(p.success).toBe(false);
    expect(p.summary).toContain("Nothing to do");
  });
});

describe("cosmos_find_clusters_for_element", () => {
  test("separates the boards that already hold the element", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({
        areSavedToLibrary: true,
        connectableClusters: {
          items: [
            { cluster: { id: 1, name: "a", slug: "a", url: "u1", numberOfElements: 1 }, hasConnections: true },
            { cluster: { id: 2, name: "b", slug: "b", url: "u2", numberOfElements: 2 }, hasConnections: false },
          ],
          meta: { nextPageCursor: null },
        },
      }),
    });
    const p = payloadOf(
      await tools.get("cosmos_find_clusters_for_element")!.handler({ elementIds: [38410868], search: " x " }),
    );
    expect(calls[0]!.query).toBe(CONNECTABLE_CLUSTERS_QUERY);
    expect(calls[0]!.vars.searchTerm).toBe("x");
    expect(p.savedToLibrary).toBe(true);
    expect(p.alreadyInClusterIds).toEqual([1]);
    expect(p.items).toHaveLength(2);
  });
});

describe("cosmos_my_library", () => {
  test("passes the verified filters through and normalizes elements", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({
        allElementsV2: {
          items: [
            {
              __typename: "MediaElementTile",
              id: 1,
              ownerId: VIEWER.id,
              owner: { username: "example-user" },
              shareUrl: "https://www.cosmos.so/e/1",
              media: { __typename: "StaticImage", mediaId: "m", url: "https://cdn.cosmos.so/m", width: 2, height: 1 },
            },
          ],
          meta: { nextPageCursor: null, count: 18 },
        },
      }),
    });
    const p = payloadOf(
      await tools.get("cosmos_my_library")!.handler({ contentType: "IMAGE", unsortedOnly: true, order: "LATEST" }),
    );
    expect(calls[0]!.query).toBe(MY_LIBRARY_QUERY);
    expect(calls[0]!.vars.filters).toEqual({ contentType: "IMAGE", isUnsorted: true });
    expect(p.items[0].media.thumbnailUrl).toContain("w=400");
    expect(p.totalCount).toBe(18);
  });
});

describe("cosmos_following_feed", () => {
  test("splits sessions from follow suggestions", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({
        compositeFollowingFeed: {
          items: [
            {
              feedSession: {
                id: "s1",
                clusterId: 1,
                elementCount: 0,
                collaborator: { id: 2, username: "c", fullName: null },
                cluster: HAR_CLUSTER,
                elementTiles: [],
              },
              userFollowSuggestions: [{ suggestedUserId: 9, suggestedUser: { id: 9, username: "n" } }],
            },
          ],
          meta: { nextPageCursor: "c2", count: 1 },
        },
      }),
    });
    const p = payloadOf(await tools.get("cosmos_following_feed")!.handler({ limit: 5 }));
    expect(calls[0]!.query).toBe(FOLLOWING_FEED_QUERY);
    expect(calls[0]!.vars).toEqual({ userId: VIEWER.id, pageSize: 5, pageCursor: null });
    expect(p.items).toHaveLength(1);
    expect(p.suggestions).toHaveLength(1);
    expect(p.nextCursor).toBe("c2");
  });
});

describe("cosmos_activity", () => {
  test("forwards the date window and counts unread", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({
        activityFeed: {
          items: [
            { id: 1, isRead: false, createdAt: "x", __typename: "UserFollowedActivity", follower: { id: 2, username: "a" } },
            { id: 2, isRead: true, createdAt: "y", __typename: "UserFollowedActivity", follower: { id: 3, username: "b" } },
          ],
          meta: { nextPageCursor: null },
        },
      }),
    });
    const p = payloadOf(
      await tools.get("cosmos_activity")!.handler({ onlyFollows: true, start: "2026-01-01T00:00:00Z" }),
    );
    expect(calls[0]!.query).toBe(ACTIVITY_QUERY);
    expect(calls[0]!.vars).toEqual({
      ownerId: VIEWER.id,
      start: "2026-01-01T00:00:00Z",
      end: null,
      onlyFollows: true,
      pageSize: 20,
      pageCursor: null,
    });
    expect(p.unreadInPage).toBe(1);
    expect(p.items[0].text).toBe("@a followed you");
  });
});

describe("cosmos_quick_connect_suggestion", () => {
  test("returns the suggested board and never saves", async () => {
    const { tools, calls } = harness({
      viewer: VIEWER,
      respond: () => ({
        quickConnectRecommendation: {
          clusterId: 344801244,
          cluster: { ...HAR_CLUSTER, hasConnections: false, parentCluster: { id: 5, name: "p", slug: "p" } },
        },
      }),
    });
    const p = payloadOf(await tools.get("cosmos_quick_connect_suggestion")!.handler({ elementId: 38410868 }));
    expect(calls[0]!.query).toBe(QUICK_CONNECT_QUERY);
    expect(calls).toHaveLength(1);
    expect(p.cluster.id).toBe(344801244);
    expect(p.cluster.parentCluster).toEqual({ id: 5, name: "p", slug: "p" });
    expect(p.alreadyContainsElement).toBe(false);
    expect(p.summary).toContain("Nothing saved yet");
  });

  test("an empty recommendation is a clean null, not a crash", async () => {
    const { tools } = harness({ viewer: VIEWER, respond: () => ({ quickConnectRecommendation: null }) });
    const p = payloadOf(await tools.get("cosmos_quick_connect_suggestion")!.handler({ elementId: 1 }));
    expect(p.cluster).toBeNull();
  });

  test("flags an element already in the suggested board", async () => {
    const { tools } = harness({
      viewer: VIEWER,
      respond: () => ({
        quickConnectRecommendation: { clusterId: 1, cluster: { ...HAR_CLUSTER, hasConnections: true } },
      }),
    });
    const p = payloadOf(await tools.get("cosmos_quick_connect_suggestion")!.handler({ elementId: 1 }));
    expect(p.alreadyContainsElement).toBe(true);
    expect(p.summary).toContain("already in it");
  });
});

/* ------------------------------------------------------------------ *
 * Signed out
 * ------------------------------------------------------------------ */

describe("signed out", () => {
  test("every curation tool fails with the actionable auth message and no request", async () => {
    const { tools, calls } = harness({ viewer: null });
    const args: Record<string, unknown> = {
      elementIds: [1],
      elementId: 1,
      clusterId: 1,
      name: "x",
      clusterIdsToConnect: [1],
    };
    for (const [name, t] of tools) {
      const result = await t.handler(args);
      expect(result.isError, name).toBe(true);
      const body = JSON.parse((result.content[0] as { text: string }).text);
      expect(body.error, name).toBe("unauthenticated");
      expect(body.message, name).toContain("COSMOS_COOKIE");
    }
    expect(calls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Live schema check. Unauthenticated: it can only ever read back errors,
 * so no mutation is performed even though mutation documents are sent.
 * ------------------------------------------------------------------ */

describe.skipIf(!process.env.COSMOS_LIVE_TESTS)("live schema validation", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["CosmosMcpMyClusters", MY_CLUSTERS_QUERY, buildMyClustersVariables({ userId: 1 })],
    ["CosmosMcpCreateCluster", CREATE_CLUSTER_MUTATION, { userId: 1, name: "probe", description: null, isPrivate: true }],
    ["CosmosMcpAddElementsToCluster", ADD_ELEMENTS_MUTATION, { userId: 1, elementIds: [1], clusterId: 1 }],
    [
      "CosmosMcpEditElementConnections",
      EDIT_CONNECTIONS_MUTATION,
      { userId: 1, elementIds: [1], clusterIdsToConnect: [1], clusterIdsToDisconnect: [] },
    ],
    [
      "CosmosMcpConnectableClusters",
      CONNECTABLE_CLUSTERS_QUERY,
      { userId: 1, elementIds: [1], searchTerm: null, pageSize: 5, pageCursor: null },
    ],
    ["CosmosMcpMyLibrary", MY_LIBRARY_QUERY, buildLibraryVariables({ userId: 1, contentType: "IMAGE", order: "LATEST" })],
    ["CosmosMcpFollowingFeed", FOLLOWING_FEED_QUERY, { userId: 1, pageSize: 5, pageCursor: null }],
    [
      "CosmosMcpActivity",
      ACTIVITY_QUERY,
      { ownerId: 1, start: null, end: null, onlyFollows: null, pageSize: 5, pageCursor: null },
    ],
    ["CosmosMcpQuickConnect", QUICK_CONNECT_QUERY, { userId: 1, elementId: 1 }],
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
    // Signed out, so the request never executes: AUTHENTICATION is the only
    // acceptable code. Anything else is a schema drift we need to fix.
    const other = errors.filter((e) => e.extensions?.code !== "AUTHENTICATION");
    expect(other.map((e) => e.message)).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  }, 30_000);
});
