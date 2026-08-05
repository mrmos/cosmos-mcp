import { afterEach, describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CosmosClient } from "../src/graphql/client";
import { CosmosError } from "../src/errors";
import type { NormalizedElement } from "../src/normalize";
import {
  browseQueries,
  buildSearchClustersVariables,
  buildSearchVariables,
  interleaveSimilar,
  normalizeBoard,
  normalizeConversationalSearch,
  normalizeSavedByCluster,
  normalizeSavedSearch,
  normalizeSaver,
  normalizeSearchElement,
  normalizeSearchUser,
  normalizeSpotlight,
  registerBrowseTools,
} from "../src/tools/browse";

/* ------------------------------------------------------------------ *
 * Stand-ins. Nothing below the "live" block touches the network.
 * ------------------------------------------------------------------ */

interface Registered {
  config: any;
  handler: (args: any) => Promise<CallToolResult>;
}

type RequestFn = (op: string, query: string, vars: Record<string, unknown>) => Promise<unknown>;

interface FakeClientOptions {
  viewer?: { id: number; username: string | null } | null;
  userIds?: Record<string, number>;
  request?: RequestFn;
}

function fakeClient(opts: FakeClientOptions = {}) {
  const calls: { op: string; vars: Record<string, unknown> }[] = [];
  const client = {
    config: { timeoutMs: 5_000 },
    hasCredentials: Boolean(opts.viewer),
    async viewer() {
      return opts.viewer ?? null;
    },
    async requireViewer(operation: string) {
      if (opts.viewer) return opts.viewer;
      throw new CosmosError(`${operation}: not signed in.`, { kind: "unauthenticated", operation });
    },
    async userIdForUsername(username: string) {
      const id = opts.userIds?.[username];
      if (!id) throw new CosmosError(`no user ${username}`, { kind: "not_found" });
      return id;
    },
    async request(op: string, query: string, vars: Record<string, unknown> = {}) {
      calls.push({ op, vars });
      if (!opts.request) throw new Error(`unexpected request: ${op}`);
      return opts.request(op, query, vars);
    },
  };
  return { client: client as unknown as CosmosClient, calls };
}

function tools(opts: FakeClientOptions = {}) {
  const { client, calls } = fakeClient(opts);
  const registry = new Map<string, Registered>();
  const server = {
    registerTool(name: string, config: any, handler: any) {
      registry.set(name, { config, handler });
    },
  } as unknown as McpServer;
  registerBrowseTools(server, { client });
  return { registry, calls };
}

function call(name: string, args: any, opts: FakeClientOptions = {}) {
  const { registry, calls } = tools(opts);
  const tool = registry.get(name)!;
  return { tool, calls, run: () => tool.handler(args) };
}

function payloadOf(result: CallToolResult): any {
  return result.structuredContent ?? JSON.parse((result.content[0] as { text: string }).text);
}

/** Smallest element node the fragments can return, enough for normalizeElement. */
function elementNode(id: number, over: Record<string, unknown> = {}) {
  return {
    __typename: "MediaElementTile",
    id,
    ownerId: 1,
    owner: { username: "someone" },
    shareUrl: `https://www.cosmos.so/e/${id}`,
    generatedCaption: { text: `<n>Caption</n> for ${id}` },
    media: {
      __typename: "StaticImage",
      mediaId: `m${id}`,
      url: `https://cdn.cosmos.so/${id}`,
      width: 800,
      height: 600,
      notSafeForWorkStatus: "SAFE",
    },
    multipleMedia: [],
    ...over,
  };
}

function elementList(ids: number[], meta: Record<string, unknown> = {}) {
  return { items: ids.map((id) => elementNode(id)), meta: { nextPageCursor: null, count: ids.length, ...meta } };
}

const CLUSTER_NODE = {
  id: 1579555147,
  name: "Rooms Lit Only by Lamps",
  slug: "rooms-lit-only-by-lamps",
  description: "Evening forever.",
  ownerId: 1904119612,
  owner: { username: "spaces" },
  numberOfElements: 58,
  isPrivate: false,
  isFeatured: true,
  cover: { url: "https://cdn.cosmos.so/cover", width: 576, height: 576 },
};

/**
 * Real nodes from the cross-entity `search` root, aliases already applied the
 * way the documents ask for them: `fullName: name` on SearchUser and
 * `numberOfElements: elementsCount` on SearchCluster.
 */
const SEARCH_USER_NODE = {
  id: 1125073276,
  username: "brutalist",
  fullName: "lily",
  avatarUrl: "https://cdn.cosmos.so/b9b4e8da-13f1-440d-927a-dd2557f05db9",
  isPremium: false,
  isVerifiedProfile: true,
};

const SEARCH_CLUSTER_NODE = {
  id: 850947880,
  name: "BRUTALIST BOARD ⌂",
  slug: "brutalist-board-%e2%8c%82",
  isPrivate: false,
  isFeatured: false,
  ownerId: 667992078,
  numberOfElements: 382,
  collaboratorsCount: 0,
  coverImageUrl: "https://cdn.cosmos.so/a6e804b4",
  cover: { url: "https://cdn.cosmos.so/a6e804b4", width: 514, height: 612 },
};

const SEARCH_ELEMENT_NODE = {
  id: 494166707,
  ownerId: 74046152,
  isFeatured: false,
  sourceUrl: "https://www.instagram.com/p/CjqN3CBtrdl/",
  generatedCaption: { text: "<n>Amira Al Zuhair</n> in <n>Giambattista Valli</n>." },
};

/** One `elementTopConnections` item, shaped as the live root returns it. */
const CONNECTION_NODE = {
  clusterId: 1386712980,
  userId: 5010042,
  createdAt: "2026-08-02T15:32:23.082586Z",
  cluster: {
    id: 1386712980,
    name: "Painting",
    slug: "painting",
    description: null,
    ownerId: 5010042,
    owner: { username: "ryanbelk" },
    parentClusterId: 132730937,
    numberOfElements: 161,
    isPrivate: false,
    isFeatured: false,
    cover: { url: "https://cdn.cosmos.so/f4a934f6", width: 1280, height: 1707 },
  },
};

/** One `elementTopUsers` item. */
const SAVER_NODE = {
  id: 5010042,
  username: "ryanbelk",
  fullName: "Ryan Belk",
  avatarUrl: "https://cdn.cosmos.so/dc0a7625",
  isPremium: true,
  isVerifiedProfile: false,
  publicElementsCluster: { id: 83835374, numberOfElements: 5162 },
};

/** A `featuredClusters` item: ClusterCore plus categories and a bare preview list. */
const BOARD_NODE = {
  ...CLUSTER_NODE,
  categories: [{ id: 1464776492, name: "Interiors", slug: "interior-design" }],
  topElements: [elementNode(153335808), elementNode(1166528291)],
};

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

describe("buildSearchVariables", () => {
  test("carries the search term and paging defaults", () => {
    expect(buildSearchVariables({ query: "sage kitchen" })).toEqual({
      searchTerm: "sage kitchen",
      pageSize: 20,
      pageCursor: null,
    });
  });

  test("omits contentType for ALL — the enum has no ALL member", () => {
    const vars = buildSearchVariables({ query: "x", contentType: "ALL" });
    expect("contentType" in vars).toBe(false);
    expect(buildSearchVariables({ query: "x", contentType: "VIDEO" }).contentType).toBe("VIDEO");
  });

  test("translates RECENT onto the live enum's LATEST", () => {
    expect(buildSearchVariables({ query: "x", order: "RECENT" }).order).toBe("LATEST");
    expect(buildSearchVariables({ query: "x", order: "RELEVANT" }).order).toBe("RELEVANT");
    expect(buildSearchVariables({ query: "x", order: "RANDOM" }).order).toBe("RANDOM");
  });

  test("strips the leading # from colours", () => {
    expect(buildSearchVariables({ query: "x", color: "#8B4513" }).color).toBe("8B4513");
    expect(buildSearchVariables({ query: "x", color: " 8B4513 " }).color).toBe("8B4513");
  });

  test("passes the cursor and limit straight through", () => {
    const vars = buildSearchVariables({ query: "x", cursor: "abc", limit: 5 });
    expect(vars.pageCursor).toBe("abc");
    expect(vars.pageSize).toBe(5);
  });
});

describe("buildSearchClustersVariables", () => {
  test("sends a null owner filter rather than omitting it", () => {
    expect(buildSearchClustersVariables({ query: "brutalist" })).toEqual({
      searchTerm: "brutalist",
      userId: null,
      pageSize: 20,
      pageCursor: null,
    });
  });

  test("carries the owner filter, cursor and limit", () => {
    expect(buildSearchClustersVariables({ query: "x", ownerUserId: 7, cursor: "1", limit: 3 })).toEqual({
      searchTerm: "x",
      userId: 7,
      pageSize: 3,
      pageCursor: "1",
    });
  });
});

describe("normalizeSearchUser", () => {
  test("reads the aliased display name and flags verification", () => {
    const u = normalizeSearchUser(SEARCH_USER_NODE, 100)!;
    expect(u).toEqual({
      id: 1125073276,
      username: "brutalist",
      fullName: "lily",
      bio: null,
      url: "https://www.cosmos.so/brutalist",
      avatarUrl: "https://cdn.cosmos.so/b9b4e8da-13f1-440d-927a-dd2557f05db9?format=webp&w=100",
      websiteUrl: null,
      isPremium: false,
      isVerified: true,
    });
  });

  test("a node without an id is dropped", () => {
    expect(normalizeSearchUser({ username: "ghost" })).toBeNull();
  });
});

describe("normalizeSearchElement", () => {
  test("keeps the element shape but has no media to offer", () => {
    const e = normalizeSearchElement(SEARCH_ELEMENT_NODE)!;
    expect(e.id).toBe(494166707);
    expect(e.url).toBe("https://www.cosmos.so/e/494166707");
    expect(e.caption).toBe("Amira Al Zuhair in Giambattista Valli.");
    expect(e.owner).toEqual({ id: 74046152, username: null });
    expect(e.media).toBeNull();
  });

  test("lifts the flat sourceUrl into the shared source object", () => {
    expect(normalizeSearchElement(SEARCH_ELEMENT_NODE)!.source).toEqual({
      url: "https://www.instagram.com/p/CjqN3CBtrdl/",
      author: null,
      isPublicDomain: false,
    });
    expect(normalizeSearchElement({ ...SEARCH_ELEMENT_NODE, sourceUrl: null })!.source).toBeNull();
  });

  test("a node without an id is dropped", () => {
    expect(normalizeSearchElement({ sourceUrl: "https://example.com" })).toBeNull();
  });
});

describe("interleaveSimilar", () => {
  const el = (id: number) => ({ id }) as NormalizedElement;

  test("round-robins so every seed is represented near the top", () => {
    const merged = interleaveSimilar([[el(1), el(2)], [el(3), el(4)]], [], 4);
    expect(merged.map((e) => e.id)).toEqual([1, 3, 2, 4]);
  });

  test("drops the seeds themselves and cross-seed duplicates", () => {
    const merged = interleaveSimilar([[el(9), el(1)], [el(1), el(2)]], [9], 10);
    expect(merged.map((e) => e.id)).toEqual([1, 2]);
  });

  test("honours the limit and tolerates ragged pages", () => {
    expect(interleaveSimilar([[el(1)], [el(2), el(3), el(4)]], [], 3).map((e) => e.id)).toEqual([1, 2, 3]);
    expect(interleaveSimilar([], [], 5)).toEqual([]);
  });
});

describe("normalizeSpotlight", () => {
  test("keeps the cluster and folds the curator down to four fields", () => {
    const s = normalizeSpotlight({
      cluster: CLUSTER_NODE,
      user: { id: 7, username: "spaces", fullName: " Spaces ", statistics: { numberOfFollowers: 12 } },
    })!;
    expect(s.cluster!.url).toBe("https://www.cosmos.so/spaces/rooms-lit-only-by-lamps");
    expect(s.curator).toEqual({ id: 7, username: "spaces", fullName: "Spaces", followers: 12 });
  });

  test("editorial spotlights have no curator", () => {
    expect(normalizeSpotlight({ cluster: CLUSTER_NODE, user: null })!.curator).toBeNull();
  });

  test("an entry without a cluster is dropped", () => {
    expect(normalizeSpotlight({ cluster: null, user: null })).toBeNull();
  });
});

describe("normalizeSavedSearch", () => {
  test("resizes the cover and keeps the searchable term", () => {
    expect(
      normalizeSavedSearch(
        {
          searchTerm: "wabi sabi",
          displayName: "Wabi Sabi",
          searchCategory: "interior-design",
          coverImage: { url: "https://cdn.cosmos.so/abc" },
        },
        200,
      ),
    ).toEqual({
      searchTerm: "wabi sabi",
      displayName: "Wabi Sabi",
      category: "interior-design",
      coverUrl: "https://cdn.cosmos.so/abc?format=webp&w=200",
    });
  });

  test("an entry with no term is unusable", () => {
    expect(normalizeSavedSearch({ displayName: "nothing" })).toBeNull();
  });
});

describe("normalizeSavedByCluster", () => {
  test("keeps the cluster and records who saved it, when", () => {
    const c = normalizeSavedByCluster(CONNECTION_NODE)!;
    expect(c.id).toBe(1386712980);
    expect(c.url).toBe("https://www.cosmos.so/ryanbelk/painting");
    expect(c.savedByUserId).toBe(5010042);
    expect(c.savedAt).toBe("2026-08-02T15:32:23.082586Z");
  });

  test("keeps parentClusterId, so a board and its subboard are distinguishable", () => {
    expect(normalizeSavedByCluster(CONNECTION_NODE)!.parentClusterId).toBe(132730937);
  });

  test("a connection with no cluster is dropped", () => {
    expect(normalizeSavedByCluster({ clusterId: 1, userId: 2, cluster: null })).toBeNull();
  });
});

describe("normalizeSaver", () => {
  test("folds in verification and how prolific the person is", () => {
    const u = normalizeSaver(SAVER_NODE, 100)!;
    expect(u.username).toBe("ryanbelk");
    expect(u.fullName).toBe("Ryan Belk");
    expect(u.isVerified).toBe(false);
    expect(u.publicElementCount).toBe(5162);
    expect(u.avatarUrl).toContain("w=100");
  });

  test("a person with no public board reports no count rather than zero", () => {
    expect(normalizeSaver({ ...SAVER_NODE, publicElementsCluster: null })!.publicElementCount).toBeNull();
    expect(normalizeSaver({ username: "ghost" })).toBeNull();
  });
});

describe("normalizeBoard", () => {
  test("carries the categories and the preview images", () => {
    const b = normalizeBoard(BOARD_NODE)!;
    expect(b.name).toBe("Rooms Lit Only by Lamps");
    expect(b.url).toBe("https://www.cosmos.so/spaces/rooms-lit-only-by-lamps");
    expect(b.categories).toEqual([{ id: 1464776492, name: "Interiors", slug: "interior-design" }]);
    expect(b.preview.map((e) => e.id)).toEqual([153335808, 1166528291]);
  });

  test("previewWidth reaches the preview thumbnails", () => {
    expect(normalizeBoard(BOARD_NODE, 120)!.preview[0]!.media!.thumbnailUrl).toContain("w=120");
  });

  test("a null categories list normalizes to empty, as featured boards return it", () => {
    const b = normalizeBoard({ ...BOARD_NODE, categories: null, topElements: null })!;
    expect(b.categories).toEqual([]);
    expect(b.preview).toEqual([]);
  });

  test("a node without an id is dropped", () => {
    expect(normalizeBoard({ name: "nameless" })).toBeNull();
  });
});

describe("normalizeConversationalSearch", () => {
  const payload = {
    results: [elementNode(1), elementNode(2), elementNode(3)],
    directions: [
      { keyword: " warm wood ", results: [elementNode(4), elementNode(5)] },
      { keyword: "paper light", results: [elementNode(6)] },
    ],
  };

  test("reads results and named directions", () => {
    const r = normalizeConversationalSearch(payload);
    expect(r.items.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(r.directions.map((d) => d.keyword)).toEqual(["warm wood", "paper light"]);
    expect(r.directions[0]!.items.map((e) => e.id)).toEqual([4, 5]);
    expect(r.warnings).toEqual([]);
  });

  test("truncates both lists, because the API takes no page size", () => {
    const r = normalizeConversationalSearch(payload, { limit: 2, perDirection: 1 });
    expect(r.items).toHaveLength(2);
    expect(r.directions[0]!.items).toHaveLength(1);
  });

  // This payload has never been executed live, so every shape below is a guess
  // the normalizer has to survive rather than a case it can rule out.
  test("a missing result object degrades to empty with a warning", () => {
    for (const bad of [null, undefined, "nope"]) {
      const r = normalizeConversationalSearch(bad);
      expect(r.items).toEqual([]);
      expect(r.directions).toEqual([]);
      expect(r.warnings).toHaveLength(1);
    }
  });

  test("directions may be null — the schema allows it and it is not an error", () => {
    const r = normalizeConversationalSearch({ results: [elementNode(1)], directions: null });
    expect(r.items).toHaveLength(1);
    expect(r.directions).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test("a half-broken payload keeps the half that parsed", () => {
    const r = normalizeConversationalSearch({
      results: { not: "a list" },
      directions: [null, { keyword: "kept", results: [elementNode(9)] }],
    });
    expect(r.items).toEqual([]);
    expect(r.directions.map((d) => d.keyword)).toEqual(["kept"]);
    expect(r.warnings.join(" ")).toContain("results was object");
  });

  test("a keyword that is not a string is reported, not thrown on", () => {
    const r = normalizeConversationalSearch({
      results: [],
      directions: [{ keyword: { text: "surprise" }, results: [elementNode(1)] }],
    });
    expect(r.directions).toEqual([{ keyword: null, items: expect.anything() }]);
    expect(r.directions[0]!.items.map((e) => e.id)).toEqual([1]);
    expect(r.warnings.join(" ")).toContain("keyword was object");
  });

  test("an empty direction is dropped, and an empty response says so", () => {
    const r = normalizeConversationalSearch({ results: [], directions: [{ keyword: null, results: [] }] });
    expect(r.directions).toEqual([]);
    expect(r.warnings.join(" ")).toContain("neither results nor directions");
  });
});

/* ------------------------------------------------------------------ *
 * Tool behaviour
 * ------------------------------------------------------------------ */

describe("tool registration", () => {
  test("every browse tool is annotated read-only", () => {
    const { registry } = tools();
    expect([...registry.keys()].sort()).toEqual(
      [
        "cosmos_browse_boards",
        "cosmos_categories",
        "cosmos_cluster_recommendations",
        "cosmos_conversational_search",
        "cosmos_element_saved_by",
        "cosmos_explore",
        "cosmos_get_cluster",
        "cosmos_get_element",
        "cosmos_get_user",
        "cosmos_list_cluster_elements",
        "cosmos_list_user_clusters",
        "cosmos_search",
        "cosmos_search_all",
        "cosmos_search_clusters",
        "cosmos_search_users",
        "cosmos_similar_elements",
        "cosmos_spotlights",
        "cosmos_suggested_searches",
        "cosmos_view_images",
      ].sort(),
    );
    for (const [, t] of registry) expect(t.config.annotations.readOnlyHint).toBe(true);
  });
});

describe("cosmos_search", () => {
  test("normalizes the page and reports the total", async () => {
    const { run, calls } = call(
      "cosmos_search",
      { query: "brutalist", contentType: "ALL", limit: 2 },
      { request: async () => ({ searchElements: elementList([1, 2], { nextPageCursor: "next", count: 500 }) }) },
    );
    const p = payloadOf(await run());
    expect(p.items).toHaveLength(2);
    expect(p.items[0].caption).toBe("Caption for 1");
    expect(p.items[0].url).toBe("https://www.cosmos.so/e/1");
    expect(p.nextCursor).toBe("next");
    expect(p.totalCount).toBe(500);
    expect(calls[0]!.vars).toEqual({ searchTerm: "brutalist", pageSize: 2, pageCursor: null });
  });

  test("previewWidth reaches the generated thumbnail", async () => {
    const { run } = call(
      "cosmos_search",
      { query: "x", previewWidth: 120 },
      { request: async () => ({ searchElements: elementList([1]) }) },
    );
    const p = payloadOf(await run());
    expect(p.items[0].media.thumbnailUrl).toContain("w=120");
  });
});

describe("cosmos_search_clusters", () => {
  test("names itself as a moodboarding tool", () => {
    const { tool } = call("cosmos_search_clusters", {});
    expect(tool.config.description).toContain("moodboarding");
  });

  test("normalizes clusters and folds in the follower count", async () => {
    const { run, calls } = call(
      "cosmos_search_clusters",
      { query: "brutalist", limit: 2 },
      {
        request: async () => ({
          searchClusters: {
            items: [{ ...CLUSTER_NODE, followersCount: 19 }],
            meta: { nextPageCursor: "1", count: 418 },
          },
        }),
      },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpSearchClusters");
    expect(calls[0]!.vars).toEqual({ searchTerm: "brutalist", userId: null, pageSize: 2, pageCursor: null });
    expect(p.items[0].url).toBe("https://www.cosmos.so/spaces/rooms-lit-only-by-lamps");
    expect(p.items[0].elementCount).toBe(58);
    expect(p.items[0].followers).toBe(19);
    expect(p.nextCursor).toBe("1");
    expect(p.totalCount).toBe(418);
  });

  test("previewWidth reaches the cover thumbnail", async () => {
    const { run } = call(
      "cosmos_search_clusters",
      { query: "x", previewWidth: 120 },
      { request: async () => ({ searchClusters: { items: [CLUSTER_NODE], meta: {} } }) },
    );
    expect(payloadOf(await run()).items[0].coverUrl).toContain("w=120");
  });
});

describe("cosmos_search_users", () => {
  test("pages profiles through the cross-entity root", async () => {
    const { run, calls } = call(
      "cosmos_search_users",
      { query: "brutalist", limit: 3, cursor: "1" },
      {
        request: async () => ({
          search: { users: { items: [SEARCH_USER_NODE], meta: { nextPageCursor: "2", count: 10 } } },
        }),
      },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpSearchUsers");
    expect(calls[0]!.vars).toEqual({ searchTerm: "brutalist", pageSize: 3, pageCursor: "1" });
    expect(p.items[0].username).toBe("brutalist");
    expect(p.items[0].fullName).toBe("lily");
    expect(p.items[0].isVerified).toBe(true);
    expect(p.nextCursor).toBe("2");
    expect(p.totalCount).toBe(10);
  });

  test("avatars are never fetched larger than 200px", async () => {
    const { run } = call(
      "cosmos_search_users",
      { query: "x", previewWidth: 1200 },
      { request: async () => ({ search: { users: { items: [SEARCH_USER_NODE], meta: {} } } }) },
    );
    expect(payloadOf(await run()).items[0].avatarUrl).toContain("w=200");
  });
});

describe("cosmos_search_all", () => {
  const response = {
    search: {
      clusters: { items: [SEARCH_CLUSTER_NODE], meta: { nextPageCursor: "1", count: 418 } },
      users: { items: [SEARCH_USER_NODE], meta: { nextPageCursor: "1", count: 10 } },
      elements: {
        items: [1, 2, 3, 4].map((i) => ({ ...SEARCH_ELEMENT_NODE, id: i })),
        meta: { count: 447 },
      },
      autocompleteSuggestions: { items: [{ searchTerm: "brutalist architecture" }, { searchTerm: "" }] },
    },
  };

  test("returns all four sections and defaults to five per section", async () => {
    const { run, calls } = call("cosmos_search_all", { query: "brutalist" }, { request: async () => response });
    const p = payloadOf(await run());
    expect(calls[0]!.vars).toEqual({ searchTerm: "brutalist", pageSize: 5 });
    expect(p.clusters.items[0].id).toBe(850947880);
    expect(p.clusters.totalCount).toBe(418);
    expect(p.users.items[0].username).toBe("brutalist");
    expect(p.elements.totalCount).toBe(447);
    expect(p.suggestions).toEqual(["brutalist architecture"]);
    expect(p.summary).toContain("418 collection(s)");
  });

  test("no section advertises a cursor, since this tool cannot take one", async () => {
    const { tool, run } = call("cosmos_search_all", { query: "x" }, { request: async () => response });
    expect("cursor" in tool.config.inputSchema).toBe(false);
    const p = payloadOf(await run());
    expect([p.clusters.nextCursor, p.users.nextCursor, p.elements.nextCursor]).toEqual([null, null, null]);
    expect(p.clusters.totalCount).toBe(418);
  });

  test("cuts the element list itself, because the server ignores pageSize there", async () => {
    const { run } = call("cosmos_search_all", { query: "x", limit: 2 }, { request: async () => response });
    const p = payloadOf(await run());
    expect(p.elements.items.map((e: any) => e.id)).toEqual([1, 2]);
    expect(p.elements.totalCount).toBe(447);
    expect(p.elements.nextCursor).toBeNull();
  });

  test("SearchCluster carries no owner, so the url is honestly null", async () => {
    const { run } = call("cosmos_search_all", { query: "x" }, { request: async () => response });
    const p = payloadOf(await run());
    expect(p.clusters.items[0].url).toBeNull();
    expect(p.clusters.items[0].elementCount).toBe(382);
    expect(p.note).toContain("cosmos_search_clusters");
  });
});

describe("cosmos_get_element", () => {
  test("adds the save count and skips viewer context when signed out", async () => {
    const { run, calls } = call(
      "cosmos_get_element",
      { elementId: 38410868 },
      {
        request: async () => ({
          elementView: { __typename: "BaseElementView", element: elementNode(38410868) },
          elementTopConnections: { meta: { count: 3 } },
        }),
      },
    );
    const p = payloadOf(await run());
    expect(p.element.id).toBe(38410868);
    expect(p.savedToClusters).toBe(3);
    expect(p.viewerContext).toBeUndefined();
    expect(calls[0]!.vars).toEqual({ elementId: 38410868, userId: 0, isLoggedIn: false });
  });

  test("a signed-in viewer switches on the @include branch", async () => {
    const { run, calls } = call(
      "cosmos_get_element",
      { elementId: 1 },
      {
        viewer: { id: 42, username: "me" },
        request: async () => ({
          elementView: {
            __typename: "BaseElementView",
            element: elementNode(1, { userContext: { isDisliked: false, connections: { meta: { count: 2 } } } }),
          },
          elementTopConnections: { meta: { count: 9 } },
        }),
      },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.vars).toEqual({ elementId: 1, userId: 42, isLoggedIn: true });
    expect(p.viewerContext).toEqual({ savedByViewer: true, isDisliked: false });
  });

  test("a missing element is a not_found error result, not a crash", async () => {
    const { run } = call("cosmos_get_element", { elementId: 1 }, { request: async () => ({ elementView: null }) });
    const result = await run();
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe("not_found");
  });
});

describe("cosmos_similar_elements", () => {
  test("names itself as the moodboarding tool", () => {
    const { tool } = call("cosmos_similar_elements", {});
    expect(tool.config.description).toContain("moodboarding");
  });

  test("a single seed pages normally", async () => {
    const { run, calls } = call(
      "cosmos_similar_elements",
      { elementIds: [7], cursor: "c1", limit: 2 },
      { request: async () => ({ similarElementsV2: elementList([10, 11], { nextPageCursor: "c2" }) }) },
    );
    const p = payloadOf(await run());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.vars).toEqual({ elementIds: [7], pageSize: 2, pageCursor: "c1" });
    expect(p.nextCursor).toBe("c2");
    expect(p.items.map((e: any) => e.id)).toEqual([10, 11]);
  });

  test("several seeds fan out to one request each and interleave", async () => {
    const perSeed: Record<number, number[]> = { 7: [10, 11], 8: [11, 12] };
    const { run, calls } = call(
      "cosmos_similar_elements",
      { elementIds: [7, 8, 7], limit: 4 },
      {
        request: async (_op, _q, vars) => ({
          similarElementsV2: elementList(perSeed[(vars.elementIds as number[])[0]!]!),
        }),
      },
    );
    const p = payloadOf(await run());
    expect(calls).toHaveLength(2); // the duplicate seed is collapsed
    expect(p.items.map((e: any) => e.id)).toEqual([10, 11, 12]);
    expect(p.nextCursor).toBeNull();
    expect(p.note).toContain("single seed");
  });

  test("seeds never come back as their own results", async () => {
    const { run } = call(
      "cosmos_similar_elements",
      { elementIds: [7, 8] },
      { request: async () => ({ similarElementsV2: elementList([7, 8, 9]) }) },
    );
    expect(payloadOf(await run()).items.map((e: any) => e.id)).toEqual([9]);
  });
});

describe("cosmos_explore", () => {
  test("without a category it is the featured feed, unchanged", async () => {
    const { run, calls } = call(
      "cosmos_explore",
      { limit: 2 },
      { request: async () => ({ featuredElements: elementList([1, 2], { nextPageCursor: "n" }) }) },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpFeaturedElements");
    expect(calls[0]!.vars).toEqual({ pageSize: 2, pageCursor: null });
    expect(p.items.map((e: any) => e.id)).toEqual([1, 2]);
    expect(p.summary).toContain("featured element(s)");
  });

  test("a category id switches roots and returns the same page shape", async () => {
    const { run, calls } = call(
      "cosmos_explore",
      { category: 1464776492, cursor: "cursor://x", limit: 2 },
      { request: async () => ({ categoryElements: elementList([3], { count: 21940 }) }) },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpCategoryElements");
    expect(calls[0]!.vars).toEqual({ categoryId: 1464776492, pageSize: 2, pageCursor: "cursor://x" });
    expect(p.items.map((e: any) => e.id)).toEqual([3]);
    expect(p.totalCount).toBe(21940);
    expect(p.summary).toContain("in category 1464776492");
  });
});

describe("cosmos_element_saved_by", () => {
  const response = {
    elementTopConnections: {
      items: [CONNECTION_NODE, { ...CONNECTION_NODE, clusterId: 9, cluster: { ...CONNECTION_NODE.cluster, id: 9 } }],
      meta: { nextPageCursor: "c2", count: 91 },
    },
    elementTopUsers: { items: [SAVER_NODE], meta: { nextPageCursor: "u2", count: 74 } },
  };

  test("returns both lists and counts distinct owners, not rows", async () => {
    const { run, calls } = call(
      "cosmos_element_saved_by",
      { elementId: 1670769520 },
      { request: async () => response },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpElementSavedBy");
    expect(calls[0]!.vars).toEqual({
      elementId: 1670769520,
      pageSize: 10,
      pageCursor: null,
      includeSavers: true,
    });
    expect(p.clusters.items).toHaveLength(2);
    expect(p.clusters.totalCount).toBe(91);
    expect(p.clusters.nextCursor).toBe("c2");
    expect(p.savers.items[0].username).toBe("ryanbelk");
    // Both rows belong to ryanbelk: a board and its subboard, one person.
    expect(p.summary).toContain("from 1 owner(s)");
    expect(p.summary).toContain("saved in 91 collection(s)");
  });

  test("paging drops the people list rather than resending a ranked page", async () => {
    const { run, calls } = call(
      "cosmos_element_saved_by",
      { elementId: 1, cursor: "c2", limit: 3 },
      { request: async () => ({ elementTopConnections: response.elementTopConnections }) },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.vars).toEqual({ elementId: 1, pageSize: 3, pageCursor: "c2", includeSavers: false });
    expect(p.savers.items).toEqual([]);
    expect(p.savers.note).toContain("first page");
  });

  test("avatars are never fetched larger than 200px", async () => {
    const { run } = call(
      "cosmos_element_saved_by",
      { elementId: 1, previewWidth: 1200 },
      { request: async () => response },
    );
    expect(payloadOf(await run()).savers.items[0].avatarUrl).toContain("w=200");
  });
});

describe("cosmos_browse_boards", () => {
  test("uses the featured root and previews three elements per board by default", async () => {
    const { run, calls } = call(
      "cosmos_browse_boards",
      {},
      { request: async () => ({ featuredClusters: { items: [BOARD_NODE], meta: { nextPageCursor: "n", count: 823 } } }) },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpFeaturedClusters");
    expect(calls[0]!.vars).toEqual({ pageSize: 20, pageCursor: null, previewCount: 3 });
    expect(p.items[0].name).toBe("Rooms Lit Only by Lamps");
    expect(p.items[0].preview).toHaveLength(2);
    expect(p.totalCount).toBe(823);
    expect(p.nextCursor).toBe("n");
  });

  test("a category id switches roots without changing the shape", async () => {
    const { run, calls } = call(
      "cosmos_browse_boards",
      { category: 1464776492, limit: 2, previewCount: 1 },
      { request: async () => ({ categoryClusters: { items: [BOARD_NODE], meta: { count: 93 } } }) },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpCategoryClusters");
    expect(calls[0]!.vars).toEqual({ categoryId: 1464776492, pageSize: 2, pageCursor: null, previewCount: 1 });
    expect(p.items[0].id).toBe(1579555147);
    expect(p.summary).toContain("in category 1464776492");
  });

  test("the description sends the agent to cosmos_categories for the id", () => {
    const { tool } = call("cosmos_browse_boards", {});
    expect(tool.config.description).toContain("cosmos_categories");
  });
});

describe("cosmos_conversational_search", () => {
  test("wraps the brief as a single user message", async () => {
    const { run, calls } = call(
      "cosmos_conversational_search",
      { brief: "warm minimalist japanese interiors" },
      {
        viewer: { id: 42, username: "me" },
        request: async () => ({
          conversationalSearch: {
            results: [elementNode(1)],
            directions: [{ keyword: "paper light", results: [elementNode(2)] }],
          },
        }),
      },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpConversationalSearch");
    expect(calls[0]!.vars).toEqual({
      messages: [{ role: "user", content: "warm minimalist japanese interiors" }],
    });
    expect(p.items.map((e: any) => e.id)).toEqual([1]);
    expect(p.directions[0].keyword).toBe("paper light");
    expect(p.summary).toContain("paper light");
  });

  test("signed out it fails on auth before any request is made", async () => {
    const { run, calls } = call("cosmos_conversational_search", { brief: "x" });
    const result = await run();
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe("unauthenticated");
    expect(calls).toEqual([]);
  });

  test("an unexpected payload degrades to a warning instead of an error result", async () => {
    const { run } = call(
      "cosmos_conversational_search",
      { brief: "x" },
      { viewer: { id: 1, username: "me" }, request: async () => ({ conversationalSearch: { results: "?" } }) },
    );
    const result = await run();
    expect(result.isError).toBeUndefined();
    const p = payloadOf(result);
    expect(p.items).toEqual([]);
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  test("the description admits the payload is unproven", () => {
    const { tool } = call("cosmos_conversational_search", {});
    expect(tool.config.description).toContain("EXPERIMENTAL");
  });
});

describe("cosmos_get_cluster", () => {
  const clusterResponse = {
    cluster: { ...CLUSTER_NODE, followersCount: 4, subClusters: { items: [{ id: 2, name: "sub", slug: "sub", numberOfElements: 1 }] } },
    clusterConnections: { meta: { count: 58 } },
  };

  test("username + slug uses the input form", async () => {
    const { run, calls } = call(
      "cosmos_get_cluster",
      { username: "spaces", slug: "rooms-lit-only-by-lamps" },
      { request: async () => clusterResponse },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.op).toBe("CosmosMcpClusterBySlug");
    expect(calls[0]!.vars).toEqual({ input: { ownerUsername: "spaces", slug: "rooms-lit-only-by-lamps" } });
    expect(p.cluster.followers).toBe(4);
    expect(p.cluster.connectionCount).toBe(58);
    expect(p.subClusters).toEqual([{ id: 2, name: "sub", slug: "sub", elementCount: 1 }]);
  });

  test("a bare id uses the id form", async () => {
    const { run, calls } = call("cosmos_get_cluster", { clusterId: 1579555147 }, { request: async () => clusterResponse });
    await run();
    expect(calls[0]!.op).toBe("CosmosMcpClusterById");
    expect(calls[0]!.vars).toEqual({ clusterId: 1579555147 });
  });

  test("a lone username is not enough to identify a cluster", async () => {
    const { run } = call("cosmos_get_cluster", { username: "spaces" });
    const result = await run();
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe("validation");
  });
});

describe("cosmos_list_cluster_elements", () => {
  test("unwraps the connection nodes", async () => {
    const { run } = call(
      "cosmos_list_cluster_elements",
      { clusterId: 1 },
      {
        request: async () => ({
          clusterConnections: {
            items: [{ element: elementNode(5) }, { element: null }],
            meta: { nextPageCursor: null, count: 2 },
          },
        }),
      },
    );
    const p = payloadOf(await run());
    expect(p.items.map((e: any) => e.id)).toEqual([5]);
  });
});

describe("cosmos_list_user_clusters", () => {
  test("resolves a username to an id and pages the full list", async () => {
    const { run, calls } = call(
      "cosmos_list_user_clusters",
      { username: "spaces", limit: 2 },
      {
        userIds: { spaces: 1904119612 },
        request: async () => ({ userClusters: { items: [CLUSTER_NODE], meta: { nextPageCursor: "n", count: 21 } } }),
      },
    );
    const p = payloadOf(await run());
    expect(calls[0]!.vars).toEqual({ userId: 1904119612, pageSize: 2, pageCursor: null });
    expect(p.items).toHaveLength(1);
    expect(p.nextCursor).toBe("n");
  });

  test("signed out, a named profile degrades to its top clusters rather than failing", async () => {
    const { run, calls } = call(
      "cosmos_list_user_clusters",
      { username: "spaces" },
      {
        userIds: { spaces: 1904119612 },
        request: async (op) => {
          if (op === "CosmosMcpUserClusters") throw new CosmosError("not signed in", { kind: "unauthenticated" });
          return { user: { topClusters: { items: [CLUSTER_NODE], meta: { count: 21 } } } };
        },
      },
    );
    const result = await run();
    expect(result.isError).toBeUndefined();
    const p = payloadOf(result);
    expect(p.partial).toBe(true);
    expect(p.totalCount).toBe(21);
    expect(p.note).toContain("COSMOS_COOKIE");
    expect(calls.map((c) => c.op)).toEqual(["CosmosMcpUserClusters", "CosmosMcpUserTopClusters"]);
  });

  test("without a username there is nothing public to fall back to", async () => {
    const { run } = call("cosmos_list_user_clusters", {});
    const result = await run();
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe("unauthenticated");
  });

  test("a non-auth failure is not swallowed by the fallback", async () => {
    const { run } = call(
      "cosmos_list_user_clusters",
      { username: "spaces" },
      {
        userIds: { spaces: 1 },
        request: async () => {
          throw new CosmosError("rate limited", { kind: "rate_limited" });
        },
      },
    );
    expect(JSON.parse(((await run()).content[0] as { text: string }).text).error).toBe("rate_limited");
  });
});

describe("cosmos_view_images", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(handler: (url: string) => Response) {
    globalThis.fetch = (async (input: any) => handler(String(input))) as typeof fetch;
  }

  const pixel = new Uint8Array([1, 2, 3, 4]);

  test("returns interleaved caption and image blocks", async () => {
    stubFetch(() => new Response(pixel, { headers: { "content-type": "image/webp" } }));
    const { run } = call(
      "cosmos_view_images",
      { elementIds: [1, 2], width: 200 },
      { request: async (_op, _q, vars) => ({ elementView: { element: elementNode(vars.elementId as number) } }) },
    );
    const result = await run();
    expect(result.content.map((c) => c.type)).toEqual(["text", "text", "image", "text", "image"]);
    expect((result.content[0] as { text: string }).text).toContain("Rendered 2 of 2");
    const image = result.content[2] as { data: string; mimeType: string };
    expect(image.mimeType).toBe("image/webp");
    expect(Buffer.from(image.data, "base64")).toEqual(Buffer.from(pixel));
    expect(payloadOf(result).rendered[0].url).toBe("https://www.cosmos.so/e/1");
  });

  test("requests the CDN at the width asked for", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return new Response(pixel, { headers: { "content-type": "image/jpeg" } });
    });
    const { run } = call(
      "cosmos_view_images",
      { elementIds: [1] },
      { request: async () => ({ elementView: { element: elementNode(1) } }) },
    );
    await run();
    expect(seen[0]).toContain("w=400");
  });

  test("a failed download is skipped and named, not fatal", async () => {
    stubFetch((url) =>
      url.includes("/2") ? new Response("nope", { status: 404 }) : new Response(pixel, { headers: { "content-type": "image/webp" } }),
    );
    const { run } = call(
      "cosmos_view_images",
      { elementIds: [1, 2] },
      { request: async (_op, _q, vars) => ({ elementView: { element: elementNode(vars.elementId as number) } }) },
    );
    const p = payloadOf(await run());
    expect(p.rendered.map((r: any) => r.elementId)).toEqual([1]);
    expect(p.skipped).toEqual([{ elementId: 2, reason: "image fetch returned HTTP 404" }]);
  });

  test("an element with no media is skipped", async () => {
    stubFetch(() => new Response(pixel, { headers: { "content-type": "image/webp" } }));
    const { run } = call(
      "cosmos_view_images",
      { elementIds: [1] },
      { request: async () => ({ elementView: { element: elementNode(1, { media: null }) } }) },
    );
    const p = payloadOf(await run());
    expect(p.skipped).toEqual([{ elementId: 1, reason: "no renderable media" }]);
  });

  test("videos come back as their poster frame, labelled", async () => {
    stubFetch(() => new Response(pixel, { headers: { "content-type": "image/webp" } }));
    const video = elementNode(3, {
      media: {
        __typename: "Video",
        mediaId: "v3",
        url: "https://cdn.cosmos.so/videos/v3.mp4",
        thumbnail: { url: "https://cdn.cosmos.so/poster" },
        duration: 2,
        mux: { playbackUrl: "https://stream.mux.com/x.m3u8" },
      },
    });
    const { run } = call("cosmos_view_images", { elementIds: [3] }, { request: async () => ({ elementView: { element: video } }) });
    const result = await run();
    expect((result.content[1] as { text: string }).text).toContain("poster frame");
  });
});

/* ------------------------------------------------------------------ *
 * Live checks. Signed out, so auth-gated documents can only be read for
 * schema errors — Cosmos returns those alongside the AUTHENTICATION entry.
 * ------------------------------------------------------------------ */

describe.skipIf(!process.env.COSMOS_LIVE_TESTS)("live schema validation", () => {
  async function exec(operationName: keyof typeof browseQueries, variables: Record<string, unknown>) {
    const res = await fetch(`https://api.cosmos.so/graphql?q=${operationName}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-name": "cosmos-web",
        origin: "https://www.cosmos.so",
        referer: "https://www.cosmos.so/",
      },
      body: JSON.stringify({ operationName, query: browseQueries[operationName], variables }),
    });
    const body = (await res.json()) as { data?: any; errors?: { extensions?: { code?: string } }[] };
    return { status: res.status, data: body.data, codes: (body.errors ?? []).map((e) => e.extensions?.code) };
  }

  const SEED_ELEMENT = 38410868;
  const SEED_CLUSTER = 1579555147;

  test("search returns elements", async () => {
    const r = await exec("CosmosMcpSearchElements", buildSearchVariables({ query: "brutalist stairwell", limit: 3 }));
    expect(r.codes).toEqual([]);
    expect(r.data.searchElements.items.length).toBeGreaterThan(0);
  }, 30_000);

  test("searchClusters returns collections, with owners and paging", async () => {
    const r = await exec("CosmosMcpSearchClusters", buildSearchClustersVariables({ query: "brutalist", limit: 3 }));
    expect(r.codes).toEqual([]);
    const list = r.data.searchClusters;
    expect(list.items.length).toBe(3);
    expect(list.meta.count).toBeGreaterThan(100);
    expect(typeof list.items[0].owner.username).toBe("string");
    expect(typeof list.items[0].numberOfElements).toBe("number");

    const next = await exec(
      "CosmosMcpSearchClusters",
      buildSearchClustersVariables({ query: "brutalist", limit: 3, cursor: list.meta.nextPageCursor }),
    );
    expect(next.codes).toEqual([]);
    expect(next.data.searchClusters.items[0].id).not.toBe(list.items[0].id);
  }, 30_000);

  test("search { users } returns profiles under the aliased display name", async () => {
    const r = await exec("CosmosMcpSearchUsers", { searchTerm: "brutalist", pageSize: 3, pageCursor: null });
    expect(r.codes).toEqual([]);
    const list = r.data.search.users;
    expect(list.items.length).toBeGreaterThan(0);
    expect(typeof list.items[0].username).toBe("string");
    expect("fullName" in list.items[0]).toBe(true);
    expect(typeof list.meta.count).toBe("number");
  }, 30_000);

  test("the cross-entity search fills all four sections", async () => {
    const r = await exec("CosmosMcpSearchAll", { searchTerm: "brutalist", pageSize: 3 });
    expect(r.codes).toEqual([]);
    const s = r.data.search;
    expect(s.clusters.items.length).toBe(3);
    expect(typeof s.clusters.items[0].numberOfElements).toBe("number");
    expect(s.users.items.length).toBeGreaterThan(0);
    expect(s.elements.items.length).toBeGreaterThan(0);
    expect(s.autocompleteSuggestions.items.length).toBeGreaterThan(0);
    // The reason cosmos_search_all truncates elements itself.
    expect(s.elements.items.length).toBeGreaterThan(3);
  }, 30_000);

  test("element detail returns the element and its save count", async () => {
    const r = await exec("CosmosMcpElementDetails", { elementId: SEED_ELEMENT, userId: 0, isLoggedIn: false });
    expect(r.codes).toEqual([]);
    expect(r.data.elementView.element.id).toBe(SEED_ELEMENT);
    expect(typeof r.data.elementTopConnections.meta.count).toBe("number");
  }, 30_000);

  test("similarElementsV2 accepts exactly one seed id", async () => {
    const okRes = await exec("CosmosMcpSimilarElements", { elementIds: [SEED_ELEMENT], pageSize: 2, pageCursor: null });
    expect(okRes.codes).toEqual([]);
    expect(okRes.data.similarElementsV2.items.length).toBeGreaterThan(0);

    // The reason cosmos_similar_elements fans out instead of batching.
    const multi = await exec("CosmosMcpSimilarElements", { elementIds: [SEED_ELEMENT, 245356704], pageSize: 2, pageCursor: null });
    expect(multi.status).toBe(400);
  }, 30_000);

  test("public feeds and lookups all resolve", async () => {
    const cases: [keyof typeof browseQueries, Record<string, unknown>, (d: any) => unknown][] = [
      ["CosmosMcpFeaturedElements", { pageSize: 2, pageCursor: null }, (d) => d.featuredElements.items],
      ["CosmosMcpSpotlights", { pageSize: 2, pageCursor: null }, (d) => d.explore.featuredSpotlights.items],
      ["CosmosMcpCategories", {}, (d) => d.categories.items],
      ["CosmosMcpSuggestedSearches", { searchCategory: null }, (d) => d.searches.trendingSearches.items],
      ["CosmosMcpGetUser", { username: "spaces" }, (d) => d.user.topClusters.items],
      ["CosmosMcpClusterBySlug", { input: { ownerUsername: "spaces", slug: "rooms-lit-only-by-lamps" } }, (d) => d.cluster.id],
      ["CosmosMcpClusterById", { clusterId: SEED_CLUSTER }, (d) => d.cluster.id],
      ["CosmosMcpClusterElements", { clusterId: SEED_CLUSTER, pageSize: 2, pageCursor: null }, (d) => d.clusterConnections.items],
      ["CosmosMcpUserTopClusters", { username: "spaces" }, (d) => d.user.topClusters.items],
      ["CosmosMcpElementMedia", { elementId: SEED_ELEMENT }, (d) => d.elementView.element.id],
    ];
    for (const [op, vars, pick] of cases) {
      const r = await exec(op, vars);
      expect({ op, codes: r.codes }).toEqual({ op, codes: [] });
      expect({ op, got: Boolean(pick(r.data)) }).toEqual({ op, got: true });
    }
  }, 60_000);

  test("elementTopConnections and elementTopUsers both answer signed out", async () => {
    const r = await exec("CosmosMcpElementSavedBy", {
      elementId: 1670769520,
      pageSize: 2,
      pageCursor: null,
      includeSavers: true,
    });
    expect(r.codes).toEqual([]);
    const conns = r.data.elementTopConnections;
    expect(conns.items.length).toBe(2);
    expect(typeof conns.items[0].cluster.owner.username).toBe("string");
    expect(conns.meta.count).toBeGreaterThan(0);
    expect(r.data.elementTopUsers.items.length).toBeGreaterThan(0);
    expect(typeof r.data.elementTopUsers.items[0].username).toBe("string");

    // The @include branch the tool flips once the caller starts paging.
    const paged = await exec("CosmosMcpElementSavedBy", {
      elementId: 1670769520,
      pageSize: 2,
      pageCursor: conns.meta.nextPageCursor,
      includeSavers: false,
    });
    expect(paged.codes).toEqual([]);
    expect("elementTopUsers" in paged.data).toBe(false);
    expect(paged.data.elementTopConnections.items[0].clusterId).not.toBe(conns.items[0].clusterId);
  }, 30_000);

  test("both board roots return curated collections with preview images", async () => {
    const featured = await exec("CosmosMcpFeaturedClusters", { pageSize: 2, pageCursor: null, previewCount: 3 });
    expect(featured.codes).toEqual([]);
    const list = featured.data.featuredClusters;
    expect(list.items.length).toBe(2);
    expect(list.meta.count).toBeGreaterThan(100);
    expect(list.items[0].topElements.length).toBe(3);
    expect(typeof list.items[0].topElements[0].media.url).toBe("string");

    // Interiors. `categoryClusters` takes an id; there is no categorySlug argument.
    const byCategory = await exec("CosmosMcpCategoryClusters", {
      categoryId: 1464776492,
      pageSize: 2,
      pageCursor: null,
      previewCount: 3,
    });
    expect(byCategory.codes).toEqual([]);
    expect(byCategory.data.categoryClusters.items.length).toBe(2);
    expect(byCategory.data.categoryClusters.meta.count).toBeGreaterThan(10);
  }, 30_000);

  test("cosmos_categories hands out the ids categoryElements takes", async () => {
    const cats = await exec("CosmosMcpCategories", {});
    const interiors = cats.data.categories.items.find((c: any) => c.slug === "interior-design");
    expect(typeof interiors.id).toBe("number");

    const r = await exec("CosmosMcpCategoryElements", { categoryId: interiors.id, pageSize: 2, pageCursor: null });
    expect(r.codes).toEqual([]);
    expect(r.data.categoryElements.items.length).toBe(2);
    expect(r.data.categoryElements.meta.count).toBeGreaterThan(1000);
  }, 30_000);

  test("the session-gated documents fail on auth only, never on schema", async () => {
    const cases: [keyof typeof browseQueries, Record<string, unknown>][] = [
      ["CosmosMcpClusterRecommendations", { clusterId: SEED_CLUSTER }],
      ["CosmosMcpUserClusters", { userId: 1904119612, pageSize: 2, pageCursor: null }],
      ["CosmosMcpConversationalSearch", { messages: [{ role: "user", content: "warm minimalist japanese interiors" }] }],
    ];
    for (const [op, vars] of cases) {
      const r = await exec(op, vars);
      expect({ op, ok: r.codes.every((c) => c === "AUTHENTICATION") }).toEqual({ op, ok: true });
    }
  }, 30_000);

  /**
   * Variables are not coerced before Cosmos' auth check, so the run above proves
   * nothing about `ConversationalSearchInput`. Inlining the input as a literal
   * forces coercion; the three deliberately broken literals are the control that
   * shows a clean run of the real one means something.
   */
  test("the conversational input object validates as a literal", async () => {
    const literal = (input: string) =>
      browseQueries.CosmosMcpConversationalSearch.replace(
        "query CosmosMcpConversationalSearch($messages: [ConversationalMessageInput!]!)",
        "query CosmosMcpConversationalSearch",
      ).replace("input: { messages: $messages }", `input: ${input}`);

    const send = async (input: string) => {
      const res = await fetch("https://api.cosmos.so/graphql?q=CosmosMcpConversationalSearch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client-name": "cosmos-web",
          origin: "https://www.cosmos.so",
          referer: "https://www.cosmos.so/",
        },
        body: JSON.stringify({
          operationName: "CosmosMcpConversationalSearch",
          query: literal(input),
          variables: {},
        }),
      });
      const body = (await res.json()) as { errors?: { extensions?: { code?: string } }[] };
      return { status: res.status, codes: (body.errors ?? []).map((e) => e.extensions?.code) };
    };

    const good = await send('{ messages: [{ role: "user", content: "warm minimalist japanese interiors" }] }');
    expect(good.status).toBe(401);
    expect(good.codes).toEqual(["AUTHENTICATION"]);

    for (const bad of [
      '{ messages: [{ role: "user", content: "x" }], zzz: 1 }',
      '{ messages: [{ role: "user", content: "x", zzz: 1 }] }',
      '{ messages: [{ role: "user" }] }',
    ]) {
      const r = await send(bad);
      expect({ bad, coerced: r.codes.includes("ARGUMENTS_OF_CORRECT_TYPE") }).toEqual({ bad, coerced: true });
    }
  }, 30_000);
});
