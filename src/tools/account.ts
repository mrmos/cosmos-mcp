/**
 * Account tools — "what can I do right now?".
 *
 * Cosmos has no API keys. Everything personal (your library, your boards,
 * saving) rides on a browser session cookie in `COSMOS_COOKIE`. That makes the
 * server's capabilities configuration-dependent, so the first thing an agent
 * should do is ask.
 */

import { CosmosError, AUTH_HINT } from "../errors";
import { guard, ok, type ToolRegistrar } from "./kit";
import {
  SIGNED_OUT_TOOLS as CATALOG_SIGNED_OUT,
  SIGNED_IN_ONLY_TOOLS as CATALOG_SIGNED_IN_ONLY,
} from "./catalog";

/**
 * Cheap counts for the signed-in user, mirroring the web app's GetProfileCounts.
 * Doubles as a liveness check on the credential: `viewer()` trusts
 * COSMOS_USER_ID without a round trip, this does not.
 */
export const PROFILE_COUNTS_QUERY = /* GraphQL */ `
  query CosmosMcpProfileCounts($userId: UserId!) {
    userClusters(userId: $userId) {
      meta {
        count
      }
    }
    allElementsV2(userId: $userId) {
      meta {
        count
      }
    }
  }
`;

const SIGNED_OUT_TOOLS = [...CATALOG_SIGNED_OUT];
const SIGNED_IN_ONLY_TOOLS = [...CATALOG_SIGNED_IN_ONLY];

const WHOAMI_DESCRIPTION = `Call this FIRST, before any other cosmos tool, to learn what this server can currently do.

Reports whether a cosmos.so credential is configured and still valid, who it belongs to, and how many clusters (boards) and saved elements that account has.

Read it as a capability probe:
- authenticated: true  -> every tool works, including saving and creating boards.
- authenticated: false -> only the read-only browse/search tools work. The result then explains exactly which environment variable is missing and how to fill it; relay that to the user rather than retrying the write.

Never an error result and never a write. One cheap request, safe to call any time you are unsure whether a save will succeed.`;

interface Counts {
  clusterCount: number | null;
  elementCount: number | null;
}

/** Credential the config actually carries, for reporting (never the value). */
export function credentialSummary(config: {
  cookie?: string;
  authorization?: string;
  userId?: number;
}): {
  cookieConfigured: boolean;
  authorizationConfigured: boolean;
  userIdConfigured: boolean;
} {
  return {
    cookieConfigured: Boolean(config.cookie),
    authorizationConfigured: Boolean(config.authorization),
    userIdConfigured: config.userId !== undefined,
  };
}

/**
 * Turns whatever we learned into the signed-out payload. Split out so the
 * "no credential at all" and "credential rejected" cases stay distinguishable.
 */
export function signedOutPayload(
  credential: ReturnType<typeof credentialSummary>,
  reason: "missing" | "rejected",
) {
  const summary =
    reason === "missing"
      ? "Not signed in to cosmos.so: no credential is configured. Browsing and search still work."
      : "Not signed in to cosmos.so: the configured credential was rejected (expired or invalid session). Browsing and search still work.";
  return {
    summary,
    authenticated: false,
    reason,
    viewer: null,
    credential,
    howToFix: AUTH_HINT,
    toolsAvailableNow: SIGNED_OUT_TOOLS,
    toolsRequiringSignIn: SIGNED_IN_ONLY_TOOLS,
  };
}

export const registerAccountTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    "cosmos_whoami",
    {
      title: "Cosmos: who am I / what works",
      description: WHOAMI_DESCRIPTION,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async () => {
      const credential = credentialSummary(ctx.client.config);

      let viewer: Awaited<ReturnType<typeof ctx.client.viewer>> = null;
      try {
        viewer = await ctx.client.viewer();
      } catch (err) {
        // A network blip should not look like a signed-out session.
        if (!(err instanceof CosmosError) || err.kind === "network" || err.kind === "server") throw err;
      }

      if (!viewer) {
        const payload = signedOutPayload(credential, ctx.client.hasCredentials ? "rejected" : "missing");
        const { summary, ...rest } = payload;
        return ok(summary, rest);
      }

      // Verify the credential for real and pick up the profile counts.
      let counts: Counts = { clusterCount: null, elementCount: null };
      try {
        const data = await ctx.client.request<{
          userClusters: { meta: { count: number | null } | null } | null;
          allElementsV2: { meta: { count: number | null } | null } | null;
        }>("CosmosMcpProfileCounts", PROFILE_COUNTS_QUERY, { userId: viewer.id });
        counts = {
          clusterCount: data.userClusters?.meta?.count ?? null,
          elementCount: data.allElementsV2?.meta?.count ?? null,
        };
      } catch (err) {
        if (err instanceof CosmosError && (err.kind === "unauthenticated" || err.kind === "forbidden")) {
          const payload = signedOutPayload(credential, "rejected");
          const { summary, ...rest } = payload;
          return ok(summary, {
            ...rest,
            note:
              "A viewer id was available (COSMOS_USER_ID, or a cached lookup) but cosmos.so rejected the request, " +
              "so the session cookie is missing or expired.",
          });
        }
        // Anything else (network, rate limit) is not an auth problem: report
        // the identity we have and leave counts null.
      }

      return ok(
        viewer.username
          ? `Signed in to cosmos.so as @${viewer.username} (user ${viewer.id}). All tools available.`
          : `Signed in to cosmos.so as user ${viewer.id}. All tools available.`,
        {
          authenticated: true,
          viewer: {
            id: viewer.id,
            username: viewer.username,
            url: viewer.username ? `https://www.cosmos.so/${viewer.username}` : null,
          },
          credential,
          library: counts,
          toolsAvailableNow: [...SIGNED_OUT_TOOLS, ...SIGNED_IN_ONLY_TOOLS],
        },
      );
    }),
  );
};
