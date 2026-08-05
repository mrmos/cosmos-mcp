/**
 * Cluster lifecycle and save-from-URL.
 *
 * `curate.ts` can create a board and fill it. This module covers everything
 * after that: renaming, deleting, nesting, following, pinning — plus the one
 * gap that made moodboarding awkward, "save this image I found to my board".
 *
 * Every tool here calls `requireViewer()` first, so a signed-out caller gets the
 * actionable "set COSMOS_COOKIE" message instead of a raw GraphQL failure.
 *
 * Two schema facts drive most of the code below and are easy to get wrong:
 *
 *  1. `cluster.update` returns `MutationResponse`, NOT a `Cluster`. Selecting
 *     `id`/`name` on it is a hard `FIELDS_ON_CORRECT_TYPE` error, verified live.
 *     Only `{ success }` is selectable.
 *  2. `UpdateClusterInput` requires `name` AND `isPrivate` on every call, even a
 *     one-field change. A tool that forwarded only what the caller passed would
 *     silently publish private boards. `cosmos_update_cluster` therefore reads
 *     the cluster first and echoes the unchanged values back — see
 *     `mergeClusterUpdate`.
 */

import { z } from "zod";
import { CLUSTER_CORE } from "../graphql/fragments";
import { CosmosError } from "../errors";
import { normalizeCluster, type NormalizedCluster } from "../normalize";
import { guard, ok, type ToolRegistrar } from "./kit";

/* ------------------------------------------------------------------ *
 * Operations. Each one was POSTed unauthenticated to api.cosmos.so in
 * both forms — variables and query-text literal — and came back with
 * only `{"extensions":{"code":"AUTHENTICATION"}}`. Negative controls
 * (an extra `zzzProbe` field, a wrong-typed field) failed as expected,
 * which is what makes the literal-form pass meaningful: variable
 * coercion does not run before the auth check, so a variables-only
 * probe validates the document but says nothing about the input shape.
 * ------------------------------------------------------------------ */

/**
 * Saving a URL. Cosmos offers three routes and this one is `element.create`:
 *
 *  - `element.create(input: { url })` — what the web app itself uses for "add by
 *    URL". Synchronous, and it returns the created element's id. That id is the
 *    currency of every other tool in this server (cosmos_organize_elements,
 *    cosmos_view_images, cosmos_find_clusters_for_element), so the agent can
 *    verify the save and keep working. Chosen for that reason.
 *  - `import.request(input: { sourceUrl })` — Cosmos scrapes a whole page and
 *    creates however many elements it finds. Fire-and-forget: it returns only
 *    `success`, and progress has to be polled via `activeImports`. Better for
 *    "import this Pinterest board", worse for "save this one image".
 *  - `import.requestFromUrls(input: { sourceUrls })` — the batch form of the
 *    above for a list of direct media URLs. Also async, also id-less.
 *
 * Both import routes validate against the live schema and are named in the tool
 * description, but shipping them as extra tools would give an agent three
 * near-identical ways to do one thing. `CreateElementInput` also accepts `text`,
 * `image` and `videoS3ObjectKey`, and takes exactly one content field per call;
 * only `url` is exposed here, so that constraint holds by construction.
 */
export const SAVE_URL_MUTATION = /* GraphQL */ `
  mutation CosmosMcpSaveUrl($userId: UserId!, $url: String, $sourceUrl: String, $clusterId: ClusterId) {
    element {
      create(input: { userId: $userId, url: $url, sourceUrl: $sourceUrl, clusterId: $clusterId }) {
        id
        __typename
        shareUrl
        createdAt
      }
    }
  }
`;

/**
 * Read half of `cosmos_update_cluster`'s read-modify-write. `coverImageElementId`
 * is not in `ClusterCore` but is confirmed on `Cluster`; it has to be echoed back
 * or a rename could drop the board's cover.
 */
export const CLUSTER_FOR_UPDATE_QUERY = /* GraphQL */ `
  query CosmosMcpClusterForUpdate($clusterId: ClusterId!) {
    cluster(id: $clusterId) {
      ...ClusterCore
      coverImageElementId
    }
  }
  ${CLUSTER_CORE}
`;

/** `MutationResponse` — `{ success }` is the only selectable field. */
export const UPDATE_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpUpdateCluster(
    $id: ClusterId!
    $name: String!
    $isPrivate: Boolean!
    $description: String
    $coverImageElementId: ElementId
  ) {
    cluster {
      update(
        input: {
          id: $id
          name: $name
          isPrivate: $isPrivate
          description: $description
          coverImageElementId: $coverImageElementId
        }
      ) {
        success
      }
    }
  }
`;

/**
 * `cluster.deleteCluster` takes `DeleteClusterInput { userId!, id! }` — one board.
 * `cluster.delete` takes `DeleteClustersInput { userId!, clusterIds! }` and wipes a
 * whole list; both validate live. The single-id form is used here deliberately:
 * a bulk-delete tool is one malformed array away from destroying an account's
 * boards, and nothing in this server needs it.
 */
export const DELETE_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpDeleteCluster($userId: UserId!, $id: ClusterId!) {
    cluster {
      deleteCluster(input: { userId: $userId, id: $id }) {
        success
      }
    }
  }
`;

export const ATTACH_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpAttachCluster($userId: UserId!, $clusterId: ClusterId!, $parentClusterId: ClusterId!) {
    cluster {
      attachToParent(input: { userId: $userId, clusterId: $clusterId, parentClusterId: $parentClusterId }) {
        success
      }
    }
  }
`;

export const DETACH_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpDetachCluster($userId: UserId!, $clusterId: ClusterId!) {
    cluster {
      detachFromParent(input: { userId: $userId, clusterId: $clusterId }) {
        success
      }
    }
  }
`;

export const FOLLOW_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpFollowCluster($userId: UserId!, $clusterId: ClusterId!) {
    cluster {
      follow(input: { userId: $userId, clusterId: $clusterId }) {
        success
      }
    }
  }
`;

export const UNFOLLOW_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpUnfollowCluster($userId: UserId!, $clusterId: ClusterId!) {
    cluster {
      unfollow(input: { userId: $userId, clusterId: $clusterId }) {
        success
      }
    }
  }
`;

/** Following a *person* lives on `userFollow`, not `user` — `user.follow` does not exist. */
export const FOLLOW_USER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpFollowUser($followerId: UserId!, $followeeId: UserId!) {
    userFollow {
      create(input: { followerId: $followerId, followeeId: $followeeId }) {
        success
      }
    }
  }
`;

export const UNFOLLOW_USER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpUnfollowUser($followerId: UserId!, $followeeId: UserId!) {
    userFollow {
      delete(input: { followerId: $followerId, followeeId: $followeeId }) {
        success
      }
    }
  }
`;

/**
 * Pinning lives on `UserProfileMutationGroup`, NOT `ClusterMutationGroup`.
 * Every `cluster.pin*` name has been probed and ruled out.
 */
export const PIN_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpPinCluster($userId: UserId!, $clusterId: ClusterId!) {
    userProfile {
      pinCluster(input: { userId: $userId, clusterId: $clusterId }) {
        success
      }
    }
  }
`;

export const UNPIN_CLUSTER_MUTATION = /* GraphQL */ `
  mutation CosmosMcpUnpinCluster($userId: UserId!, $clusterId: ClusterId!) {
    userProfile {
      unpinCluster(input: { userId: $userId, clusterId: $clusterId }) {
        success
      }
    }
  }
`;

/* ------------------------------------------------------------------ *
 * Shared argument pieces
 * ------------------------------------------------------------------ */

const clusterIdArg = z
  .number()
  .int()
  .positive()
  .describe("Cosmos cluster (board) id. Get it from cosmos_list_my_clusters, cosmos_search or cosmos_get_cluster.");

/* ------------------------------------------------------------------ *
 * Pure logic, kept out of the handlers so tests can hit it directly.
 * ------------------------------------------------------------------ */

/** The subset of a cluster `cosmos_update_cluster` has to preserve. */
export interface ClusterUpdateState {
  id: number;
  name: string;
  description: string | null;
  isPrivate: boolean;
  coverImageElementId: number | null;
}

export interface ClusterUpdateArgs {
  name?: string;
  description?: string;
  isPrivate?: boolean;
  coverImageElementId?: number;
}

/** True when the caller actually asked for a change — used to skip the network entirely. */
export function hasClusterUpdates(args: ClusterUpdateArgs): boolean {
  return (
    args.name !== undefined ||
    args.description !== undefined ||
    args.isPrivate !== undefined ||
    args.coverImageElementId !== undefined
  );
}

/** Reads the cluster's current state off a `CosmosMcpClusterForUpdate` payload. */
export function readClusterState(node: any): ClusterUpdateState | null {
  if (!node?.id) return null;
  return {
    id: node.id,
    name: node.name,
    description: node.description ?? null,
    isPrivate: Boolean(node.isPrivate),
    coverImageElementId: node.coverImageElementId ?? null,
  };
}

/**
 * The read-modify-write core. `UpdateClusterInput` demands `name` and
 * `isPrivate` on every call, so an argument the caller omitted MUST come back as
 * the cluster's current value. Getting this wrong on `isPrivate` publishes a
 * private board.
 *
 * An empty-string `description` is a deliberate "clear it" — anything else would
 * leave no way to remove a description at all.
 */
export function mergeClusterUpdate(
  current: ClusterUpdateState,
  args: ClusterUpdateArgs,
): { id: number; name: string; isPrivate: boolean; description: string | null; coverImageElementId: number | null } {
  const description =
    args.description === undefined ? current.description : args.description.trim() === "" ? null : args.description;
  return {
    id: current.id,
    name: args.name ?? current.name,
    isPrivate: args.isPrivate ?? current.isPrivate,
    description,
    coverImageElementId: args.coverImageElementId ?? current.coverImageElementId,
  };
}

/** Human-readable list of what actually changed, for the tool summary. */
export function describeClusterChanges(
  current: ClusterUpdateState,
  next: ReturnType<typeof mergeClusterUpdate>,
): string[] {
  const changes: string[] = [];
  if (next.name !== current.name) changes.push(`renamed to ${JSON.stringify(next.name)}`);
  if (next.description !== current.description) {
    changes.push(next.description === null ? "description cleared" : "description updated");
  }
  if (next.isPrivate !== current.isPrivate) {
    changes.push(next.isPrivate ? "made PRIVATE" : "made PUBLIC");
  }
  if (next.coverImageElementId !== current.coverImageElementId) {
    changes.push(`cover set to element ${next.coverImageElementId}`);
  }
  return changes;
}

export interface CreatedElement {
  id: number;
  type: string;
  url: string | null;
  createdAt: string | null;
}

export function normalizeCreatedElement(node: any): CreatedElement | null {
  if (!node?.id) return null;
  return {
    id: node.id,
    type: node.__typename ?? "unknown",
    url: node.shareUrl ?? `https://www.cosmos.so/e/${node.id}`,
    createdAt: node.createdAt ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

export const registerManageTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;

  /* ---------------- cosmos_save_url ---------------- */
  server.registerTool(
    "cosmos_save_url",
    {
      title: "Cosmos: save a URL into Cosmos",
      description: `Save an image, video or page URL from anywhere on the web into Cosmos, optionally straight onto a board. This is how "save this image I found to my board" works — everything else in this server can only move around elements that already exist in Cosmos.

Pass \`url\` (the image or page you want saved) and, when you know where it belongs, \`clusterId\`. Omit \`clusterId\` and the element lands in the user's library unfiled, ready for cosmos_quick_connect_suggestion or cosmos_save_elements. \`sourceUrl\` is attribution only: the page the media came from, for credit.

Prefer a DIRECT media URL (…/photo.jpg) over a page URL — Cosmos fetches whatever \`url\` points at, and a page will usually save as a link rather than the picture on it.

WRITES, and is NOT idempotent: calling it twice with the same URL saves the element twice. Returns the new element's id, which you can hand to cosmos_view_images, cosmos_organize_elements or cosmos_save_elements.

Not exposed, but available in the API if a bulk path is ever needed: \`import.request\` scrapes a whole page into many elements, and \`import.requestFromUrls\` takes a batch of direct media URLs. Both are asynchronous and return only a success flag — no element ids — so neither can confirm what was saved.`,
      inputSchema: {
        url: z
          .string()
          .url()
          .describe("The image, video or page URL to save. A direct media URL gives the best result."),
        clusterId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional board to drop it straight into. Omit to leave the element unfiled in the library."),
        sourceUrl: z
          .string()
          .url()
          .optional()
          .describe("Attribution only: the page the media was found on. Does not change what gets saved."),
      },
      annotations: {
        readOnlyHint: false,
        // Adds something new; nothing existing is overwritten or removed.
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(async (args: { url: string; clusterId?: number; sourceUrl?: string }) => {
      const viewer = await client.requireViewer("cosmos_save_url");
      const data = await client.request<{ element: { create: any } }>("CosmosMcpSaveUrl", SAVE_URL_MUTATION, {
        userId: viewer.id,
        url: args.url,
        sourceUrl: args.sourceUrl ?? null,
        clusterId: args.clusterId ?? null,
      });
      const element = normalizeCreatedElement(data.element?.create);
      if (!element) {
        return ok(`cosmos.so accepted the save of ${args.url} but returned no element.`, {
          success: false,
          element: null,
          clusterId: args.clusterId ?? null,
        });
      }
      return ok(
        args.clusterId
          ? `Saved ${args.url} as element ${element.id} in cluster ${args.clusterId}.`
          : `Saved ${args.url} as element ${element.id}, unfiled in your library.`,
        { success: true, element, clusterId: args.clusterId ?? null },
      );
    }),
  );

  /* ---------------- cosmos_update_cluster ---------------- */
  server.registerTool(
    "cosmos_update_cluster",
    {
      title: "Cosmos: rename or edit a cluster (board)",
      description: `Change a board's name, description, privacy or cover image. Every argument except \`clusterId\` is optional — pass only what you want changed.

SAFE BY CONSTRUCTION: Cosmos' update mutation requires the name AND the privacy flag on every call, so this tool reads the board first and sends back the current values for whatever you left out. Passing only \`name\` renames the board and cannot flip it public by accident. That costs one extra read per call.

PRIVACY: \`isPrivate: false\` publishes the board to the user's profile and other people's feeds. Only pass it when the user has explicitly asked to publish, and say so in your reply. Going the other way (\`isPrivate: true\`) is always safe.

\`description: ""\` clears the description. Omitting \`description\` leaves it untouched.

\`coverImageElementId\` must be the id of an element already in that board — this is the only way to set a cover; there is no separate cover mutation.

Returns \`changes\`, the list of what actually differed, so you can report back precisely. It does NOT delete anything; use cosmos_delete_cluster for that.`,
      inputSchema: {
        clusterId: clusterIdArg,
        name: z.string().min(1).max(120).optional().describe("New board name. Omit to leave it alone."),
        description: z
          .string()
          .max(1000)
          .optional()
          .describe('New description. Pass "" to clear it. Omit to leave it alone.'),
        isPrivate: z
          .boolean()
          .optional()
          .describe(
            "New privacy. false PUBLISHES the board — only on explicit request. Omit to keep the current setting.",
          ),
        coverImageElementId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Element id to use as the cover. Must already be in this board. Omit to keep the current cover."),
      },
      annotations: {
        readOnlyHint: false,
        // Overwrites existing values, but only ones the caller named.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(
      async (args: {
        clusterId: number;
        name?: string;
        description?: string;
        isPrivate?: boolean;
        coverImageElementId?: number;
      }) => {
        const viewer = await client.requireViewer("cosmos_update_cluster");
        if (!hasClusterUpdates(args)) {
          return ok("Nothing to do: no name, description, isPrivate or coverImageElementId was given.", {
            success: false,
            clusterId: args.clusterId,
            changes: [],
          });
        }

        // Read first. Without this we cannot satisfy the mutation's mandatory
        // name/isPrivate without inventing values.
        const before = await client.request<{ cluster: any }>(
          "CosmosMcpClusterForUpdate",
          CLUSTER_FOR_UPDATE_QUERY,
          { clusterId: args.clusterId },
        );
        const current = readClusterState(before.cluster);
        if (!current) {
          throw new CosmosError(
            `cosmos_update_cluster: cluster ${args.clusterId} was not found, or this account cannot see it.`,
            { kind: "not_found", operation: "CosmosMcpClusterForUpdate" },
          );
        }

        const next = mergeClusterUpdate(current, args);
        const changes = describeClusterChanges(current, next);
        if (changes.length === 0) {
          return ok(`Cluster ${args.clusterId} already has those values; nothing was written.`, {
            success: true,
            clusterId: args.clusterId,
            changes: [],
            cluster: normalizeCluster(before.cluster),
          });
        }

        // `cluster.update` returns MutationResponse — `{ success }` and nothing
        // else. The cluster echoed back below is the local merge, not a re-read.
        const data = await client.request<{ cluster: { update: { success: boolean } | null } }>(
          "CosmosMcpUpdateCluster",
          UPDATE_CLUSTER_MUTATION,
          next,
        );
        const success = Boolean(data.cluster?.update?.success);
        const cluster: NormalizedCluster | null = normalizeCluster({
          ...before.cluster,
          name: next.name,
          description: next.description,
          isPrivate: next.isPrivate,
          coverImageElementId: next.coverImageElementId,
        });
        return ok(
          success
            ? `Cluster ${args.clusterId}: ${changes.join(", ")}.`
            : `cosmos.so did not confirm the update to cluster ${args.clusterId}.`,
          { success, clusterId: args.clusterId, changes, cluster },
        );
      },
    ),
  );

  /* ---------------- cosmos_delete_cluster ---------------- */
  server.registerTool(
    "cosmos_delete_cluster",
    {
      title: "Cosmos: delete a cluster (board)",
      description: `Permanently delete one board.

THIS CANNOT BE UNDONE. There is no trash, no restore, and no undo through this server or through cosmos.so. Deleting a board the user cares about destroys their curation work.

You MUST pass \`confirm: true\`; the call is refused without it. Do not set it on your own initiative — ask the user, quote the board's name and element count back to them (cosmos_get_cluster or cosmos_list_my_clusters will tell you both), and only then pass it.

If the user wants the board out of sight rather than gone, use cosmos_update_cluster with \`isPrivate: true\` instead. If they only want it out of a parent board, use cosmos_nest_cluster with \`detach: true\`.

Deletes one board per call, by design. Subclusters and the elements inside are Cosmos' business once the board is gone; elements saved elsewhere are unaffected.`,
      inputSchema: {
        clusterId: clusterIdArg,
        confirm: z
          .boolean()
          .optional()
          .describe("Must be true. Set it only after the user has confirmed this exact board should be destroyed."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(async (args: { clusterId: number; confirm?: boolean }) => {
      const viewer = await client.requireViewer("cosmos_delete_cluster");
      if (args.confirm !== true) {
        return ok(
          `Refused: deleting cluster ${args.clusterId} is permanent and cannot be undone. Confirm with the user, then call again with confirm: true.`,
          { success: false, clusterId: args.clusterId, deleted: false, confirmationRequired: true },
        );
      }
      const data = await client.request<{ cluster: { deleteCluster: { success: boolean } | null } }>(
        "CosmosMcpDeleteCluster",
        DELETE_CLUSTER_MUTATION,
        { userId: viewer.id, id: args.clusterId },
      );
      const success = Boolean(data.cluster?.deleteCluster?.success);
      return ok(
        success
          ? `Deleted cluster ${args.clusterId}. This is permanent.`
          : `cosmos.so did not confirm the deletion of cluster ${args.clusterId}.`,
        { success, clusterId: args.clusterId, deleted: success, confirmationRequired: false },
      );
    }),
  );

  /* ---------------- cosmos_nest_cluster ---------------- */
  server.registerTool(
    "cosmos_nest_cluster",
    {
      title: "Cosmos: nest or un-nest a cluster",
      description: `Move a board inside another board, or pull it back out to the top level. Cosmos calls a nested board a subcluster — it is how a big project gets split into "kitchen / bathroom / garden" without losing the parent.

Pass \`parentClusterId\` to nest \`clusterId\` under it. Pass \`detach: true\` to lift it back to the top level. Exactly one of the two; passing both or neither is refused.

Re-parenting an already-nested board works in one call: just pass the new \`parentClusterId\`.

WRITES, but nothing is lost — no elements move and nothing is deleted, only where the board sits in the tree. cosmos_list_my_clusters shows the current nesting under each cluster's \`subClusters\`. To create a board already nested, cosmos_create_cluster cannot do it yet; create it then nest it here.`,
      inputSchema: {
        clusterId: clusterIdArg,
        parentClusterId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Board to nest `clusterId` inside. Mutually exclusive with `detach`."),
        detach: z
          .boolean()
          .optional()
          .describe("True lifts `clusterId` out of its current parent to the top level. Mutually exclusive with `parentClusterId`."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async (args: { clusterId: number; parentClusterId?: number; detach?: boolean }) => {
      const viewer = await client.requireViewer("cosmos_nest_cluster");
      const detach = args.detach === true;
      if (detach && args.parentClusterId !== undefined) {
        return ok("Refused: pass either parentClusterId (to nest) or detach: true (to un-nest), not both.", {
          success: false,
          clusterId: args.clusterId,
        });
      }
      if (!detach && args.parentClusterId === undefined) {
        return ok("Nothing to do: pass parentClusterId to nest this board, or detach: true to un-nest it.", {
          success: false,
          clusterId: args.clusterId,
        });
      }
      if (args.parentClusterId === args.clusterId) {
        return ok(`Refused: cluster ${args.clusterId} cannot be its own parent.`, {
          success: false,
          clusterId: args.clusterId,
        });
      }

      if (detach) {
        const data = await client.request<{ cluster: { detachFromParent: { success: boolean } | null } }>(
          "CosmosMcpDetachCluster",
          DETACH_CLUSTER_MUTATION,
          { userId: viewer.id, clusterId: args.clusterId },
        );
        const success = Boolean(data.cluster?.detachFromParent?.success);
        return ok(
          success
            ? `Cluster ${args.clusterId} is now a top-level board.`
            : `cosmos.so did not confirm detaching cluster ${args.clusterId}.`,
          { success, clusterId: args.clusterId, parentClusterId: null, detached: success },
        );
      }

      const data = await client.request<{ cluster: { attachToParent: { success: boolean } | null } }>(
        "CosmosMcpAttachCluster",
        ATTACH_CLUSTER_MUTATION,
        { userId: viewer.id, clusterId: args.clusterId, parentClusterId: args.parentClusterId },
      );
      const success = Boolean(data.cluster?.attachToParent?.success);
      return ok(
        success
          ? `Cluster ${args.clusterId} is now nested inside cluster ${args.parentClusterId}.`
          : `cosmos.so did not confirm nesting cluster ${args.clusterId}.`,
        { success, clusterId: args.clusterId, parentClusterId: args.parentClusterId ?? null, detached: false },
      );
    }),
  );

  /* ---------------- cosmos_follow_cluster ---------------- */
  server.registerTool(
    "cosmos_follow_cluster",
    {
      title: "Cosmos: follow or unfollow a cluster",
      description: `Follow someone else's board so its new saves show up in cosmos_following_feed, or unfollow with \`follow: false\`.

Use it when the user likes a collection they found through cosmos_search or cosmos_get_cluster and wants to keep seeing it. Following is public on Cosmos — the board's owner can see their followers.

WRITES, but harmlessly and reversibly: following twice is a no-op, and unfollowing restores the previous state exactly. It does NOT copy anything into the user's own boards; for that use cosmos_save_elements.`,
      inputSchema: {
        clusterId: clusterIdArg,
        follow: z.boolean().optional().describe("True (the default) follows. False unfollows."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async (args: { clusterId: number; follow?: boolean }) => {
      const viewer = await client.requireViewer("cosmos_follow_cluster");
      const follow = args.follow ?? true;
      const [op, query] = follow
        ? (["CosmosMcpFollowCluster", FOLLOW_CLUSTER_MUTATION] as const)
        : (["CosmosMcpUnfollowCluster", UNFOLLOW_CLUSTER_MUTATION] as const);
      const data = await client.request<{ cluster: Record<string, { success: boolean } | null> }>(op, query, {
        userId: viewer.id,
        clusterId: args.clusterId,
      });
      const success = Boolean(data.cluster?.[follow ? "follow" : "unfollow"]?.success);
      return ok(
        success
          ? `${follow ? "Following" : "Unfollowed"} cluster ${args.clusterId}.`
          : `cosmos.so did not confirm the ${follow ? "follow" : "unfollow"} of cluster ${args.clusterId}.`,
        { success, clusterId: args.clusterId, following: follow && success },
      );
    }),
  );

  /* ---------------- cosmos_follow_user ---------------- */
  server.registerTool(
    "cosmos_follow_user",
    {
      title: "Cosmos: follow or unfollow a person",
      description: `Follow a Cosmos user so their saves appear in cosmos_following_feed, or unfollow with \`follow: false\`.

Identify them by \`userId\` or by \`username\` — exactly one. Usernames come from cosmos_search, cosmos_get_user or the \`suggestions\` list in cosmos_following_feed.

WRITES and is publicly visible: the other person is notified that they have a new follower. Reversible — unfollowing restores the previous state — but the notification cannot be taken back, so do not follow people speculatively. Following yourself is refused.`,
      inputSchema: {
        userId: z.number().int().positive().optional().describe("Numeric Cosmos user id. Pass this or `username`."),
        username: z.string().min(1).optional().describe("Cosmos username, without the @. Pass this or `userId`."),
        follow: z.boolean().optional().describe("True (the default) follows. False unfollows."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async (args: { userId?: number; username?: string; follow?: boolean }) => {
      const viewer = await client.requireViewer("cosmos_follow_user");
      if ((args.userId === undefined) === (args.username === undefined)) {
        return ok("Refused: pass exactly one of userId or username.", { success: false });
      }
      const followeeId = args.userId ?? (await client.userIdForUsername(args.username!));
      if (followeeId === viewer.id) {
        return ok("Refused: you cannot follow yourself.", { success: false, userId: followeeId });
      }
      const follow = args.follow ?? true;
      const [op, query] = follow
        ? (["CosmosMcpFollowUser", FOLLOW_USER_MUTATION] as const)
        : (["CosmosMcpUnfollowUser", UNFOLLOW_USER_MUTATION] as const);
      const data = await client.request<{ userFollow: Record<string, { success: boolean } | null> }>(op, query, {
        followerId: viewer.id,
        followeeId,
      });
      const success = Boolean(data.userFollow?.[follow ? "create" : "delete"]?.success);
      const who = args.username ? `@${args.username}` : `user ${followeeId}`;
      return ok(
        success
          ? `${follow ? "Following" : "Unfollowed"} ${who}.`
          : `cosmos.so did not confirm the ${follow ? "follow" : "unfollow"} of ${who}.`,
        { success, userId: followeeId, username: args.username ?? null, following: follow && success },
      );
    }),
  );

  /* ---------------- cosmos_pin_cluster ---------------- */
  server.registerTool(
    "cosmos_pin_cluster",
    {
      title: "Cosmos: pin or unpin a cluster on your profile",
      description: `Pin one of the signed-in user's own boards to the top of their Cosmos profile, or unpin it with \`pin: false\`.

Pinning is presentation only: it changes the order boards appear in on the profile page and nothing else. No elements move, nothing is shared, nothing is deleted.

A PRIVATE board stays private when pinned — pinning does not publish it — but pinning a board is usually only worth doing for one the user is happy for visitors to see. Check \`isPrivate\` from cosmos_list_my_clusters if unsure.

WRITES, reversible, idempotent.`,
      inputSchema: {
        clusterId: clusterIdArg,
        pin: z.boolean().optional().describe("True (the default) pins. False unpins."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async (args: { clusterId: number; pin?: boolean }) => {
      const viewer = await client.requireViewer("cosmos_pin_cluster");
      const pin = args.pin ?? true;
      const [op, query] = pin
        ? (["CosmosMcpPinCluster", PIN_CLUSTER_MUTATION] as const)
        : (["CosmosMcpUnpinCluster", UNPIN_CLUSTER_MUTATION] as const);
      const data = await client.request<{ userProfile: Record<string, { success: boolean } | null> }>(op, query, {
        userId: viewer.id,
        clusterId: args.clusterId,
      });
      const success = Boolean(data.userProfile?.[pin ? "pinCluster" : "unpinCluster"]?.success);
      return ok(
        success
          ? `${pin ? "Pinned" : "Unpinned"} cluster ${args.clusterId} ${pin ? "to" : "from"} your profile.`
          : `cosmos.so did not confirm ${pin ? "pinning" : "unpinning"} cluster ${args.clusterId}.`,
        { success, clusterId: args.clusterId, pinned: pin && success },
      );
    }),
  );
};
