/**
 * Curation tools — the writes, plus the personal reads that only make sense
 * once you are signed in.
 *
 * Every tool here calls `requireViewer()` first so a signed-out caller gets the
 * actionable "set COSMOS_COOKIE" message instead of a raw GraphQL failure.
 *
 * Vocabulary: an *element* is a saved image/video/product; a *cluster* is a
 * board. An element can live in many clusters at once — Cosmos calls those
 * links "connections", and `cosmos_organize_elements` is how you edit them.
 */

import { z } from "zod";
import { CLUSTER_CORE, ELEMENT_CORE } from "../graphql/fragments";
import {
  cdnPreview,
  normalizeCluster,
  normalizeElement,
  normalizePage,
  type NormalizedCluster,
  type NormalizedElement,
  type Page,
} from "../normalize";
import {
  DEFAULT_LIMIT,
  DEFAULT_PREVIEW_WIDTH,
  cursorArg,
  guard,
  limitArg,
  ok,
  previewWidthArg,
  type ToolRegistrar,
} from "./kit";

/* ------------------------------------------------------------------ *
 * Operations. Every one of these has been validated against
 * api.cosmos.so; see the probe notes in the PR description.
 * ------------------------------------------------------------------ */

export const MY_CLUSTERS_QUERY = /* GraphQL */ `
  query CosmosMcpMyClusters(
    $userId: UserId!
    $searchTerm: String
    $pageSize: Int!
    $pageCursor: String
    $sortDefinitions: [SortDefinitionInput!]
  ) {
    clusters(
      filters: { ownerId: $userId, searchTerm: $searchTerm }
      meta: { pageSize: $pageSize, pageCursor: $pageCursor }
      sortDefinitions: $sortDefinitions
    ) {
      items {
        ...ClusterCore
        subClusters {
          items {
            id
            name
            slug
            isPrivate
            numberOfElements
          }
        }
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${CLUSTER_CORE}
`;

export const CREATE_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpCreateCluster($userId: UserId!, $name: String!, $description: String, $isPrivate: Boolean!) {
    cluster {
      create(input: { userId: $userId, name: $name, description: $description, isPrivate: $isPrivate }) {
        ...ClusterCore
      }
    }
  }
  ${CLUSTER_CORE}
`;

export const ADD_ELEMENTS_MUTATION = /* GraphQL */ `
  mutation CosmosMcpAddElementsToCluster($userId: UserId!, $elementIds: [ElementId!]!, $clusterId: ClusterId!) {
    cluster {
      addElementsToCluster(input: { userId: $userId, elementIds: $elementIds, clusterId: $clusterId }) {
        success
      }
    }
  }
`;

export const EDIT_CONNECTIONS_MUTATION = /* GraphQL */ `
  mutation CosmosMcpEditElementConnections(
    $userId: UserId!
    $elementIds: [ElementId!]!
    $clusterIdsToConnect: [ClusterId!]!
    $clusterIdsToDisconnect: [ClusterId!]!
  ) {
    element {
      editElementsConnectionsToClusters(
        input: {
          userId: $userId
          elementIds: $elementIds
          clusterIdsToConnect: $clusterIdsToConnect
          clusterIdsToDisconnect: $clusterIdsToDisconnect
        }
      ) {
        success
      }
    }
  }
`;

export const CONNECTABLE_CLUSTERS_QUERY = /* GraphQL */ `
  query CosmosMcpConnectableClusters(
    $userId: UserId!
    $elementIds: [ElementId!]!
    $searchTerm: String
    $pageSize: Int!
    $pageCursor: String
  ) {
    areSavedToLibrary(userId: $userId, elementIds: $elementIds)
    connectableClusters(
      userId: $userId
      elementIds: $elementIds
      searchTerm: $searchTerm
      meta: { pageSize: $pageSize, pageCursor: $pageCursor }
    ) {
      items {
        cluster {
          id
          name
          slug
          url
          numberOfElements
          hasSubClusters
          isPrivate
          coverImage {
            url
          }
        }
        hasConnections
      }
      meta {
        nextPageCursor
      }
    }
  }
`;

export const MY_LIBRARY_QUERY = /* GraphQL */ `
  query CosmosMcpMyLibrary(
    $userId: UserId!
    $filters: AllElementsFilters
    $order: ElementOrder
    $pageSize: Int!
    $pageCursor: String
  ) {
    allElementsV2(
      userId: $userId
      filters: $filters
      order: $order
      meta: { pageSize: $pageSize, pageCursor: $pageCursor }
    ) {
      items {
        ...ElementCore
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${ELEMENT_CORE}
`;

export const FOLLOWING_FEED_QUERY = /* GraphQL */ `
  query CosmosMcpFollowingFeed($userId: UserId!, $pageSize: Int!, $pageCursor: String) {
    compositeFollowingFeed(userId: $userId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
      items {
        feedSession {
          id
          clusterId
          elementCount
          startedAt
          finishedAt
          collaborator {
            id
            username
            fullName
          }
          cluster {
            ...ClusterCore
          }
          elementTiles {
            ...ElementCore
          }
        }
        userFollowSuggestions {
          suggestedUserId
          reason
          mutualConnectionsCount
          mostPopularClusterName
          suggestedUser {
            id
            username
            fullName
          }
        }
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${CLUSTER_CORE}
  ${ELEMENT_CORE}
`;

export const ACTIVITY_QUERY = /* GraphQL */ `
  query CosmosMcpActivity(
    $ownerId: UserId!
    $start: DateTime
    $end: DateTime
    $onlyFollows: Boolean
    $pageSize: Int!
    $pageCursor: String
  ) {
    activityFeed(
      meta: { pageSize: $pageSize, pageCursor: $pageCursor }
      filters: { ownerId: $ownerId, start: $start, end: $end, onlyFollows: $onlyFollows }
    ) {
      items {
        __typename
        id
        isRead
        createdAt
        ... on UserFollowedActivity {
          follower {
            id
            username
            fullName
          }
        }
        ... on UserFollowerClusterCreatedActivity {
          creator {
            id
            username
          }
          cluster {
            ...ActivityCluster
          }
        }
        ... on ClusterFollowerClusterCreatedActivity {
          creator {
            id
            username
          }
          cluster {
            ...ActivityCluster
          }
        }
        ... on UserConnectedYourElementAggregatableActivity {
          numberOfConnections
          lastConnectedUser {
            id
            username
          }
          element {
            id
            image {
              url
            }
          }
        }
        ... on UserConnectedElementToCollaborativeClusterAggregatableActivity {
          numberOfConnectedElements
          collaborator {
            id
            username
          }
          cluster {
            ...ActivityCluster
          }
        }
        ... on UsersFollowedYourClusterAggregatableActivity {
          numberOfFollows
          lastFollower {
            id
            username
          }
          cluster {
            ...ActivityCluster
          }
        }
        ... on ImportCompleteAtomicActivity {
          numberOfElements
          source
          cluster {
            ...ActivityCluster
          }
        }
        ... on ImportFailedAtomicActivity {
          source
          cluster {
            ...ActivityCluster
          }
        }
        ... on CollaborationInviteActivity {
          inviter {
            id
            username
          }
          cluster {
            ...ActivityCluster
          }
        }
        ... on UserAcceptedCollaborationInviteAtomicActivity {
          collaborator {
            id
            username
          }
          cluster {
            ...ActivityCluster
          }
        }
      }
      meta {
        nextPageCursor
      }
    }
  }

  fragment ActivityCluster on Cluster {
    id
    name
    slug
    owner {
      id
      username
    }
  }
`;

export const QUICK_CONNECT_QUERY = /* GraphQL */ `
  query CosmosMcpQuickConnect($userId: UserId!, $elementId: ElementId!) {
    quickConnectRecommendation(userId: $userId) {
      clusterId
      cluster {
        ...ClusterCore
        parentCluster {
          id
          name
          slug
        }
        hasConnections(elementIds: [$elementId])
      }
    }
  }
  ${CLUSTER_CORE}
`;

/* ------------------------------------------------------------------ *
 * Shared argument pieces
 * ------------------------------------------------------------------ */

const elementIdsArg = z
  .array(z.number().int().positive())
  .min(1)
  .max(100)
  .describe("Cosmos element ids (the numeric `id` fields returned by search/browse tools). 1-100 per call.");

/** Verified live: AllElementsFilters.contentType accepts exactly these. */
const CONTENT_TYPES = ["IMAGE", "VIDEO", "PRODUCT", "LINK"] as const;
/** Verified live: ElementOrder accepts exactly these. */
const LIBRARY_ORDERS = ["LATEST", "OLDEST", "POPULAR", "RANDOM"] as const;
/** Verified live: ClusterSortField accepts exactly these. */
const CLUSTER_SORT_FIELDS = ["UPDATED_AT", "CREATED_AT", "NAME", "ELEMENT_COUNT"] as const;

/* ------------------------------------------------------------------ *
 * Normalizers, kept pure so tests can hit them with fixtures.
 * ------------------------------------------------------------------ */

export interface MyCluster extends NormalizedCluster {
  subClusters: { id: number; name: string; slug: string | null; isPrivate: boolean; elementCount: number | null }[];
}

export function normalizeMyCluster(node: any, previewWidth: number): MyCluster | null {
  const base = normalizeCluster(node, previewWidth);
  if (!base) return null;
  const subs: any[] = node.subClusters?.items ?? [];
  return {
    ...base,
    subClusters: subs
      .filter((s) => s?.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug ?? null,
        isPrivate: Boolean(s.isPrivate),
        elementCount: s.numberOfElements ?? null,
      })),
  };
}

export interface ConnectableCluster {
  id: number;
  name: string;
  slug: string | null;
  url: string | null;
  isPrivate: boolean;
  elementCount: number | null;
  hasSubClusters: boolean;
  coverUrl: string | null;
  /** True when every requested element is already in this cluster. */
  alreadyContainsElements: boolean;
}

export function normalizeConnectableCluster(node: any, previewWidth: number): ConnectableCluster | null {
  const c = node?.cluster;
  if (!c?.id) return null;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug ?? null,
    url: c.url ?? null,
    isPrivate: Boolean(c.isPrivate),
    elementCount: c.numberOfElements ?? null,
    hasSubClusters: Boolean(c.hasSubClusters),
    coverUrl: cdnPreview(c.coverImage?.url, previewWidth),
    alreadyContainsElements: Boolean(node.hasConnections),
  };
}

export interface FeedSession {
  id: number | string;
  clusterId: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  elementCount: number | null;
  by: { id: number; username: string | null; fullName: string | null } | null;
  cluster: NormalizedCluster | null;
  elements: NormalizedElement[];
}

export function normalizeFeedItem(item: any, previewWidth: number): FeedSession | null {
  const s = item?.feedSession;
  if (!s?.id) return null;
  const tiles: any[] = s.elementTiles ?? [];
  return {
    id: s.id,
    clusterId: s.clusterId ?? null,
    startedAt: s.startedAt ?? null,
    finishedAt: s.finishedAt ?? null,
    elementCount: s.elementCount ?? null,
    by: s.collaborator
      ? { id: s.collaborator.id, username: s.collaborator.username ?? null, fullName: s.collaborator.fullName ?? null }
      : null,
    cluster: normalizeCluster(s.cluster, previewWidth),
    elements: tiles.map((t) => normalizeElement(t, previewWidth)).filter((e): e is NormalizedElement => e !== null),
  };
}

export interface FollowSuggestion {
  userId: number;
  username: string | null;
  fullName: string | null;
  reason: string | null;
  mutualConnections: number | null;
  popularCluster: string | null;
}

export function collectFollowSuggestions(items: any[]): FollowSuggestion[] {
  const out: FollowSuggestion[] = [];
  for (const item of items ?? []) {
    const raw = item?.userFollowSuggestions;
    const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const s of list) {
      if (!s?.suggestedUserId) continue;
      out.push({
        userId: s.suggestedUserId,
        username: s.suggestedUser?.username ?? null,
        fullName: s.suggestedUser?.fullName ?? null,
        reason: s.reason ?? null,
        mutualConnections: s.mutualConnectionsCount ?? null,
        popularCluster: s.mostPopularClusterName ?? null,
      });
    }
  }
  return out;
}

export interface Activity {
  id: number | string;
  type: string;
  createdAt: string | null;
  isRead: boolean;
  /** One-line, human-readable rendering — cheaper for an agent than the raw union. */
  text: string;
  actor: { id: number; username: string | null } | null;
  cluster: { id: number; name: string | null; url: string | null } | null;
  elementId: number | null;
}

function actorOf(a: any): { id: number; username: string | null } | null {
  const u =
    a.follower ?? a.creator ?? a.lastConnectedUser ?? a.collaborator ?? a.lastFollower ?? a.inviter ?? null;
  return u?.id ? { id: u.id, username: u.username ?? null } : null;
}

function clusterRefOf(a: any): Activity["cluster"] {
  const c = a.cluster;
  if (!c?.id) return null;
  const owner = c.owner?.username ?? null;
  return {
    id: c.id,
    name: c.name ?? null,
    url: owner && c.slug ? `https://www.cosmos.so/${owner}/${c.slug}` : null,
  };
}

/** Renders one activity union member as a sentence. Unknown types degrade gracefully. */
export function describeActivity(a: any): string {
  const who = actorOf(a)?.username ? `@${actorOf(a)!.username}` : "someone";
  const board = a.cluster?.name ? `"${a.cluster.name}"` : "a cluster";
  switch (a.__typename) {
    case "UserFollowedActivity":
      return `${who} followed you`;
    case "UserFollowerClusterCreatedActivity":
    case "ClusterFollowerClusterCreatedActivity":
      return `${who} created a new cluster ${board}`;
    case "UserConnectedYourElementAggregatableActivity":
      return `${who} and ${Math.max((a.numberOfConnections ?? 1) - 1, 0)} other(s) saved your element`;
    case "UserConnectedElementToCollaborativeClusterAggregatableActivity":
      return `${who} added ${a.numberOfConnectedElements ?? "some"} element(s) to the shared cluster ${board}`;
    case "UsersFollowedYourClusterAggregatableActivity":
      return `${a.numberOfFollows ?? "some"} people followed your cluster ${board}`;
    case "ImportCompleteAtomicActivity":
      return `import from ${a.source ?? "an external source"} finished: ${a.numberOfElements ?? "?"} element(s) into ${board}`;
    case "ImportFailedAtomicActivity":
      return `import from ${a.source ?? "an external source"} failed`;
    case "CollaborationInviteActivity":
      return `${who} invited you to collaborate on ${board}`;
    case "UserAcceptedCollaborationInviteAtomicActivity":
      return `${who} accepted your invite to collaborate on ${board}`;
    default:
      return `${a.__typename ?? "activity"}`;
  }
}

export function normalizeActivity(a: any): Activity | null {
  if (!a?.id) return null;
  return {
    id: a.id,
    type: a.__typename ?? "unknown",
    createdAt: a.createdAt ?? null,
    isRead: Boolean(a.isRead),
    text: describeActivity(a),
    actor: actorOf(a),
    cluster: clusterRefOf(a),
    elementId: a.element?.id ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Variable builders, also pure and also unit-tested.
 * ------------------------------------------------------------------ */

export function buildLibraryVariables(args: {
  userId: number;
  contentType?: (typeof CONTENT_TYPES)[number];
  unsortedOnly?: boolean;
  order?: (typeof LIBRARY_ORDERS)[number];
  limit?: number;
  cursor?: string;
}): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (args.contentType) filters.contentType = args.contentType;
  if (args.unsortedOnly) filters.isUnsorted = true;
  return {
    userId: args.userId,
    filters: Object.keys(filters).length > 0 ? filters : null,
    order: args.order ?? null,
    pageSize: args.limit ?? DEFAULT_LIMIT,
    pageCursor: args.cursor ?? null,
  };
}

export function buildMyClustersVariables(args: {
  userId: number;
  search?: string;
  sortBy?: (typeof CLUSTER_SORT_FIELDS)[number];
  sortDirection?: "ASC" | "DESC";
  limit?: number;
  cursor?: string;
}): Record<string, unknown> {
  return {
    userId: args.userId,
    searchTerm: args.search?.trim() || null,
    pageSize: args.limit ?? DEFAULT_LIMIT,
    pageCursor: args.cursor ?? null,
    sortDefinitions: [
      { sortField: args.sortBy ?? "UPDATED_AT", sortDirection: args.sortDirection ?? "DESC" },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

export const registerCurateTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;

  /* ---------------- cosmos_list_my_clusters ---------------- */
  server.registerTool(
    "cosmos_list_my_clusters",
    {
      title: "Cosmos: list my clusters (boards)",
      description: `List the signed-in user's own clusters — boards — including PRIVATE ones that no public tool can see.

Use it to resolve a board the user names in prose ("the kitchen renovation board") into the clusterId that cosmos_save_elements and cosmos_organize_elements need. Pass \`search\` to filter by name server-side instead of paging through everything.

Returns each cluster with its id, name, privacy, element count, cover image and cosmos.so URL, plus any subclusters (a board nested inside a board).

Read-only, one request per page. Requires COSMOS_COOKIE — call cosmos_whoami first if unsure.`,
      inputSchema: {
        search: z
          .string()
          .min(1)
          .optional()
          .describe("Filter clusters by name. Substring match, case-insensitive, applied by cosmos.so."),
        sortBy: z
          .enum(CLUSTER_SORT_FIELDS)
          .optional()
          .describe("Sort key. Defaults to UPDATED_AT, i.e. most recently touched board first."),
        sortDirection: z.enum(["ASC", "DESC"]).optional().describe("Defaults to DESC."),
        limit: limitArg,
        cursor: cursorArg,
        previewWidth: previewWidthArg,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(
      async (args: {
        search?: string;
        sortBy?: (typeof CLUSTER_SORT_FIELDS)[number];
        sortDirection?: "ASC" | "DESC";
        limit?: number;
        cursor?: string;
        previewWidth?: number;
      }) => {
        const viewer = await client.requireViewer("cosmos_list_my_clusters");
        const width = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
        const data = await client.request<{ clusters: any }>(
          "CosmosMcpMyClusters",
          MY_CLUSTERS_QUERY,
          buildMyClustersVariables({ ...args, userId: viewer.id }),
        );
        const page: Page<MyCluster> = normalizePage(data.clusters, (n) => normalizeMyCluster(n, width));
        return ok(
          args.search
            ? `${page.items.length} cluster(s) matching ${JSON.stringify(args.search)}.`
            : `${page.items.length} cluster(s) owned by you.`,
          page,
        );
      },
    ),
  );

  /* ---------------- cosmos_create_cluster ---------------- */
  server.registerTool(
    "cosmos_create_cluster",
    {
      title: "Cosmos: create a cluster (board)",
      description: `Create a new empty cluster (board) owned by the signed-in user, then fill it with cosmos_save_elements.

BUILDING A GOOD BOARD: alternate search and recommendations, about half and half. Seed with cosmos_search — check the candidates with cosmos_view_images first, captions mislead — then loop: a batch from cosmos_cluster_recommendations, a fresh batch from search, repeat. Recommendations curate far better than search, but run alone they echo and the board turns self-similar; search batches inject material the engine has not seen. Verify your seed really shows what the user asked for, since everything downstream inherits its direction.

PRIVACY: \`isPrivate\` defaults to **true**, deliberately. A public cluster appears on the user's profile and in other people's feeds, which is not something to do by accident — only pass \`isPrivate: false\` when the user has actually asked for a public board.

This WRITES: it creates a real board on the user's account and is not idempotent — calling it twice with the same name creates two boards. Check cosmos_list_my_clusters first if a suitable board may already exist.

Returns the new cluster including its id (feed that to cosmos_save_elements) and its URL.`,
      inputSchema: {
        name: z.string().min(1).max(120).describe("Board name, as the user would read it."),
        description: z.string().max(1000).optional().describe("Optional blurb shown on the board page."),
        isPrivate: z
          .boolean()
          .optional()
          .describe("Defaults to true (private). Pass false only on explicit request to publish."),
      },
      annotations: {
        readOnlyHint: false,
        // Creates something new; nothing existing is overwritten or removed.
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(async (args: { name: string; description?: string; isPrivate?: boolean }) => {
      const viewer = await client.requireViewer("cosmos_create_cluster");
      const isPrivate = args.isPrivate ?? true;
      const data = await client.request<{ cluster: { create: any } }>(
        "CosmosMcpCreateCluster",
        CREATE_CLUSTER_MUTATION,
        {
          userId: viewer.id,
          name: args.name,
          description: args.description ?? null,
          isPrivate,
        },
      );
      const cluster = normalizeCluster(data.cluster?.create);
      return ok(
        `Created ${isPrivate ? "private" : "PUBLIC"} cluster ${JSON.stringify(args.name)}.`,
        { cluster },
      );
    }),
  );

  /* ---------------- cosmos_save_elements ---------------- */
  server.registerTool(
    "cosmos_save_elements",
    {
      title: "Cosmos: save elements to a cluster",
      description: `Add one or more elements to a single cluster. This is the ordinary "save these images to that board" action.

WRITES, but additive only: nothing is removed and re-adding an element that is already in the cluster is a no-op, so it is safe to retry.

Get elementIds from search/browse results and clusterId from cosmos_list_my_clusters or cosmos_create_cluster. To avoid duplicating work, call cosmos_find_clusters_for_element first — it tells you which boards already hold the element. To move elements between boards (add here, remove there) use cosmos_organize_elements instead.`,
      inputSchema: {
        clusterId: z.number().int().positive().describe("Target cluster id. One cluster per call."),
        elementIds: elementIdsArg,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async (args: { clusterId: number; elementIds: number[] }) => {
      const viewer = await client.requireViewer("cosmos_save_elements");
      const data = await client.request<{ cluster: { addElementsToCluster: { success: boolean } | null } }>(
        "CosmosMcpAddElementsToCluster",
        ADD_ELEMENTS_MUTATION,
        { userId: viewer.id, elementIds: args.elementIds, clusterId: args.clusterId },
      );
      const success = Boolean(data.cluster?.addElementsToCluster?.success);
      return ok(
        success
          ? `Saved ${args.elementIds.length} element(s) to cluster ${args.clusterId}.`
          : `cosmos.so did not confirm the save to cluster ${args.clusterId}.`,
        { success, clusterId: args.clusterId, elementIds: args.elementIds },
      );
    }),
  );

  /* ---------------- cosmos_organize_elements ---------------- */
  server.registerTool(
    "cosmos_organize_elements",
    {
      title: "Cosmos: move elements between clusters",
      description: `Edit which clusters a set of elements belongs to, in one atomic call: connect to the clusters in \`clusterIdsToConnect\` AND disconnect from the ones in \`clusterIdsToDisconnect\`. That combination is how you MOVE elements from one board to another.

DESTRUCTIVE: every id in \`clusterIdsToDisconnect\` removes those elements from that board. There is no undo through this server — the only way back is to re-save them. Never populate \`clusterIdsToDisconnect\` on a guess; confirm the current placement with cosmos_find_clusters_for_element first, and confirm removals with the user.

Leave \`clusterIdsToDisconnect\` empty (the default) and this behaves exactly like cosmos_save_elements across several boards at once. Both lists apply to every element in \`elementIds\`.`,
      inputSchema: {
        elementIds: elementIdsArg,
        clusterIdsToConnect: z
          .array(z.number().int().positive())
          .max(50)
          .optional()
          .describe("Clusters to add every listed element to. Defaults to none."),
        clusterIdsToDisconnect: z
          .array(z.number().int().positive())
          .max(50)
          .optional()
          .describe(
            "Clusters to REMOVE every listed element from. Destructive and not undoable here — defaults to none, keep it that way unless the user asked for a removal or a move.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        // Same input applied twice converges on the same membership.
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(
      async (args: {
        elementIds: number[];
        clusterIdsToConnect?: number[];
        clusterIdsToDisconnect?: number[];
      }) => {
        const viewer = await client.requireViewer("cosmos_organize_elements");
        const connect = args.clusterIdsToConnect ?? [];
        const disconnect = args.clusterIdsToDisconnect ?? [];
        if (connect.length === 0 && disconnect.length === 0) {
          return ok("Nothing to do: both clusterIdsToConnect and clusterIdsToDisconnect were empty.", {
            success: false,
            elementIds: args.elementIds,
            clusterIdsToConnect: connect,
            clusterIdsToDisconnect: disconnect,
          });
        }
        const data = await client.request<{
          element: { editElementsConnectionsToClusters: { success: boolean } | null };
        }>("CosmosMcpEditElementConnections", EDIT_CONNECTIONS_MUTATION, {
          userId: viewer.id,
          elementIds: args.elementIds,
          clusterIdsToConnect: connect,
          clusterIdsToDisconnect: disconnect,
        });
        const success = Boolean(data.element?.editElementsConnectionsToClusters?.success);
        const parts: string[] = [];
        if (connect.length > 0) parts.push(`added to ${connect.length} cluster(s)`);
        if (disconnect.length > 0) parts.push(`REMOVED from ${disconnect.length} cluster(s)`);
        return ok(
          success
            ? `${args.elementIds.length} element(s) ${parts.join(" and ")}.`
            : "cosmos.so did not confirm the change.",
          {
            success,
            elementIds: args.elementIds,
            clusterIdsToConnect: connect,
            clusterIdsToDisconnect: disconnect,
          },
        );
      },
    ),
  );

  /* ---------------- cosmos_find_clusters_for_element ---------------- */
  server.registerTool(
    "cosmos_find_clusters_for_element",
    {
      title: "Cosmos: where can this element be saved?",
      description: `For the given element(s), list the signed-in user's clusters they can be saved to, and flag the ones that ALREADY contain them (\`alreadyContainsElements: true\`).

Call this before cosmos_save_elements or cosmos_organize_elements: it is the cheap way to avoid re-saving something the user already has, and the only reliable way to learn which board an element currently sits in before you disconnect it.

Also returns \`savedToLibrary\`: whether the element is already in the user's library at all.

\`search\` filters the candidate clusters by name. Read-only, one request per page.`,
      inputSchema: {
        elementIds: elementIdsArg,
        search: z.string().min(1).optional().describe("Filter the candidate clusters by name."),
        limit: limitArg,
        cursor: cursorArg,
        previewWidth: previewWidthArg,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(
      async (args: {
        elementIds: number[];
        search?: string;
        limit?: number;
        cursor?: string;
        previewWidth?: number;
      }) => {
        const viewer = await client.requireViewer("cosmos_find_clusters_for_element");
        const width = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
        const data = await client.request<{ areSavedToLibrary: boolean | null; connectableClusters: any }>(
          "CosmosMcpConnectableClusters",
          CONNECTABLE_CLUSTERS_QUERY,
          {
            userId: viewer.id,
            elementIds: args.elementIds,
            searchTerm: args.search?.trim() || null,
            pageSize: args.limit ?? DEFAULT_LIMIT,
            pageCursor: args.cursor ?? null,
          },
        );
        const page = normalizePage(data.connectableClusters, (n) => normalizeConnectableCluster(n, width));
        const already = page.items.filter((c) => c.alreadyContainsElements).map((c) => c.id);
        return ok(
          already.length > 0
            ? `${page.items.length} candidate cluster(s); already saved in ${already.length} of them.`
            : `${page.items.length} candidate cluster(s); not saved in any of them yet.`,
          {
            elementIds: args.elementIds,
            savedToLibrary: Boolean(data.areSavedToLibrary),
            alreadyInClusterIds: already,
            ...page,
          },
        );
      },
    ),
  );

  /* ---------------- cosmos_my_library ---------------- */
  server.registerTool(
    "cosmos_my_library",
    {
      title: "Cosmos: my saved elements",
      description: `Everything the signed-in user has saved, newest first by default — across every cluster, including private ones and things saved but never filed.

Use it to answer "what have I saved about X", to gather material for a new board, or with \`unsortedOnly: true\` to find the loose saves that still need filing (pair with cosmos_quick_connect_suggestion).

\`contentType\` narrows to IMAGE, VIDEO, PRODUCT or LINK. \`order\` accepts LATEST, OLDEST, POPULAR or RANDOM.

Read-only. Costs one request per page and each item carries a thumbnail URL, so keep \`limit\` modest and page rather than pulling a large library in one go.`,
      inputSchema: {
        contentType: z
          .enum(CONTENT_TYPES)
          .optional()
          .describe("Restrict to one kind of element. Omit for everything."),
        unsortedOnly: z
          .boolean()
          .optional()
          .describe("True returns only elements not filed into any cluster — the user's inbox of loose saves."),
        order: z.enum(LIBRARY_ORDERS).optional().describe("Sort order. Defaults to LATEST (most recently saved)."),
        limit: limitArg,
        cursor: cursorArg,
        previewWidth: previewWidthArg,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        // RANDOM order deliberately varies between calls.
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(
      async (args: {
        contentType?: (typeof CONTENT_TYPES)[number];
        unsortedOnly?: boolean;
        order?: (typeof LIBRARY_ORDERS)[number];
        limit?: number;
        cursor?: string;
        previewWidth?: number;
      }) => {
        const viewer = await client.requireViewer("cosmos_my_library");
        const width = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
        const data = await client.request<{ allElementsV2: any }>(
          "CosmosMcpMyLibrary",
          MY_LIBRARY_QUERY,
          buildLibraryVariables({ ...args, userId: viewer.id }),
        );
        const page = normalizePage(data.allElementsV2, (n) => normalizeElement(n, width));
        return ok(
          `${page.items.length} saved element(s)${page.totalCount != null ? ` of ${page.totalCount} total` : ""}.`,
          page,
        );
      },
    ),
  );

  /* ---------------- cosmos_following_feed ---------------- */
  server.registerTool(
    "cosmos_following_feed",
    {
      title: "Cosmos: following feed",
      description: `The signed-in user's home feed: recent saving sessions by the people and clusters they follow, each one a batch of elements added to a board.

Use it for "what's new from people I follow" or to pull fresh inspiration from trusted curators rather than global search. Items include the curator, the destination cluster and the elements themselves, so you can hand elementIds straight to cosmos_save_elements.

Also surfaces Cosmos' follow suggestions as a separate \`suggestions\` list.

Read-only, one request per page. Element-heavy: prefer \`limit\` around 10 unless you need more.`,
      inputSchema: {
        limit: limitArg,
        cursor: cursorArg,
        previewWidth: previewWidthArg,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        // The feed moves on its own; same cursor is not guaranteed same page.
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(async (args: { limit?: number; cursor?: string; previewWidth?: number }) => {
      const viewer = await client.requireViewer("cosmos_following_feed");
      const width = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ compositeFollowingFeed: any }>(
        "CosmosMcpFollowingFeed",
        FOLLOWING_FEED_QUERY,
        {
          userId: viewer.id,
          pageSize: args.limit ?? DEFAULT_LIMIT,
          pageCursor: args.cursor ?? null,
        },
      );
      const rawItems: any[] = data.compositeFollowingFeed?.items ?? [];
      const page = normalizePage(data.compositeFollowingFeed, (n) => normalizeFeedItem(n, width));
      return ok(`${page.items.length} feed session(s) from people you follow.`, {
        ...page,
        suggestions: collectFollowSuggestions(rawItems),
      });
    }),
  );

  /* ---------------- cosmos_activity ---------------- */
  server.registerTool(
    "cosmos_activity",
    {
      title: "Cosmos: my notifications",
      description: `The signed-in user's notification feed: new followers, people saving their elements, collaboration invites, cluster follows, finished imports.

Each entry comes with a one-line \`text\` rendering plus the structured actor/cluster references, so you can summarise "what happened while I was away" without decoding Cosmos' activity union.

\`onlyFollows: true\` narrows to follow events. \`start\`/\`end\` take ISO-8601 timestamps for a date window.

Read-only — it does NOT mark anything as read; \`isRead\` reflects the current state only.`,
      inputSchema: {
        onlyFollows: z.boolean().optional().describe("True returns only follow-related activity."),
        start: z
          .string()
          .optional()
          .describe("ISO-8601 timestamp, e.g. 2026-01-31T00:00:00Z. Only activity at or after this point."),
        end: z.string().optional().describe("ISO-8601 timestamp. Only activity at or before this point."),
        limit: limitArg,
        cursor: cursorArg,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(
      async (args: { onlyFollows?: boolean; start?: string; end?: string; limit?: number; cursor?: string }) => {
        const viewer = await client.requireViewer("cosmos_activity");
        const data = await client.request<{ activityFeed: any }>("CosmosMcpActivity", ACTIVITY_QUERY, {
          ownerId: viewer.id,
          start: args.start ?? null,
          end: args.end ?? null,
          onlyFollows: args.onlyFollows ?? null,
          pageSize: args.limit ?? DEFAULT_LIMIT,
          pageCursor: args.cursor ?? null,
        });
        const page = normalizePage(data.activityFeed, normalizeActivity);
        const unread = page.items.filter((a) => !a.isRead).length;
        return ok(`${page.items.length} activity item(s), ${unread} unread.`, { unreadInPage: unread, ...page });
      },
    ),
  );

  /* ---------------- cosmos_quick_connect_suggestion ---------------- */
  server.registerTool(
    "cosmos_quick_connect_suggestion",
    {
      title: "Cosmos: where should this go?",
      description: `Ask Cosmos which of the user's own clusters an element most likely belongs in — the recommendation behind the app's one-tap save.

Use it when filing loose saves (pair with cosmos_my_library \`unsortedOnly: true\`) or when the user says "save this somewhere sensible" without naming a board. It returns a single suggested cluster plus \`alreadyContainsElement\`, so you can skip a pointless save.

It only suggests. Nothing is saved until you call cosmos_save_elements with the returned clusterId — and the suggestion is a guess, so confirm with the user before acting on it. Returns \`cluster: null\` when Cosmos has no opinion (a brand-new account, typically).`,
      inputSchema: {
        elementId: z.number().int().positive().describe("The element you want filed."),
        previewWidth: previewWidthArg,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(async (args: { elementId: number; previewWidth?: number }) => {
      const viewer = await client.requireViewer("cosmos_quick_connect_suggestion");
      const width = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ quickConnectRecommendation: any }>(
        "CosmosMcpQuickConnect",
        QUICK_CONNECT_QUERY,
        { userId: viewer.id, elementId: args.elementId },
      );
      const rec = data.quickConnectRecommendation;
      const cluster = normalizeCluster(rec?.cluster, width);
      if (!cluster) {
        return ok("Cosmos has no cluster suggestion for this element.", {
          elementId: args.elementId,
          cluster: null,
          alreadyContainsElement: false,
        });
      }
      const already = Boolean(rec?.cluster?.hasConnections);
      return ok(
        already
          ? `Suggested cluster "${cluster.name}" — but this element is already in it.`
          : `Suggested cluster "${cluster.name}" (id ${cluster.id}). Nothing saved yet.`,
        {
          elementId: args.elementId,
          cluster: {
            ...cluster,
            parentCluster: rec?.cluster?.parentCluster
              ? {
                  id: rec.cluster.parentCluster.id,
                  name: rec.cluster.parentCluster.name,
                  slug: rec.cluster.parentCluster.slug ?? null,
                }
              : null,
          },
          alreadyContainsElement: already,
        },
      );
    }),
  );
};
