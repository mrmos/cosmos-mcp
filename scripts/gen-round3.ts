/**
 * Generates scripts/probes-round4.json — input-object field mapping.
 *
 * Trick: a single request can test dozens of candidate input-object fields at once.
 * Send `input: {candidateA: true, candidateB: true, ...}`. The server replies with
 * one combined message:
 *   "In field 'candidateA': Unknown field."                  -> field does NOT exist
 *   "In field 'candidateB': [Expected type 'X', found true.]" -> field EXISTS, type is X
 *   (field not mentioned at all)                              -> field exists and accepts `true`
 * plus "Missing required field 'f' of type 'T'." for every required field left out.
 */

const out: { label: string; query: string }[] = [];

const CHUNK = 22;
const chunk = <T>(xs: T[], n: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
};

/** Test a set of candidate field names against one mutation's `input` arg. */
function inputProbe(group: string, field: string, candidates: string[], value = "true") {
  for (const [i, c] of chunk(candidates, CHUNK).entries()) {
    const body = c.map((k) => `${k}: ${value}`).join(", ");
    out.push({
      label: `${group}.${field} input #${i + 1}`,
      query: `mutation Probe { ${group} { ${field}(input: {${body}}) { __typename } } }`,
    });
  }
}

/** Test a set of candidate ARGUMENT names on a query root field. */
function argProbe(field: string, candidates: string[], value = "true") {
  for (const [i, c] of chunk(candidates, CHUNK).entries()) {
    const body = c.map((k) => `${k}: ${value}`).join(", ");
    out.push({
      label: `Query.${field} args #${i + 1}`,
      query: `query Probe { ${field}(${body}) { __typename } }`,
    });
  }
}

/* ---------------- candidate field vocabularies ---------------- */

const IDS = [
  "id", "ids", "userId", "ownerId", "clusterId", "clusterIds", "elementId",
  "elementIds", "parentClusterId", "parentId", "ownerOrgId", "organizationId",
  "categoryId", "categoryIds", "tagId", "tagIds", "collaboratorId",
  "collaboratorIds", "invitedUserId", "targetUserId", "followerId", "followeeId",
  "coverImageElementId", "groupId", "subClusterId", "importId", "exportId",
];

const CONTENT = [
  "name", "title", "description", "slug", "caption", "text", "body", "note",
  "url", "sourceUrl", "sourceUrls", "imageUrl", "thumbnailUrl", "fileName",
  "mimeType", "contentType", "width", "height", "blurHash", "hash",
  "aiGenerated", "notSafeForWork", "isNotSafeForWork", "color", "colors",
];

const FLAGS = [
  "isPrivate", "isPinnedToUserProfile", "isPinned", "isFeatured", "isPublic",
  "isDefault", "pinned", "featured", "private", "visible", "enabled",
];

const ANALYTICS = [
  "userInteractionSource", "actionScreen", "slateId", "searchTerm",
  "elementAnalyticsProperties", "analyticsProperties", "properties",
  "eventType", "viewTime", "source", "sourceType", "origin", "referrer",
];

const SOCIAL = [
  "email", "emails", "username", "usernames", "role", "status", "reason",
  "message", "note", "permission", "accessLevel", "inviteId", "invitationId",
  "token", "code", "expiresAt",
];

const ORDER = [
  "position", "index", "order", "sortOrder", "targetIndex", "newIndex",
  "afterElementId", "beforeElementId", "previousElementId", "nextElementId",
  "rank", "orderedElementIds",
];

const PROFILE = [
  "fullName", "lastName", "firstName", "bio", "avatarUrl", "websiteUrl",
  "instagramUsername", "twitterUsername", "age", "username", "email",
  "enforceNotSafeForWork", "location", "coverImageUrl", "phoneNumber",
  "categoryIds", "interests", "isPrivate",
];

/* ---------------- cluster lifecycle ---------------- */

const CLUSTER_POOL = [...IDS, ...CONTENT, ...FLAGS, ...ANALYTICS, ...ORDER];

inputProbe("cluster", "create", [...IDS, ...CONTENT, ...FLAGS, ...ANALYTICS]);
inputProbe("cluster", "update", [...CLUSTER_POOL]);
inputProbe("cluster", "edit", [...CLUSTER_POOL]);
inputProbe("cluster", "delete", [...IDS, ...ANALYTICS, "confirm", "permanent"]);
inputProbe("cluster", "deleteCluster", [...IDS, ...ANALYTICS]);
inputProbe("cluster", "follow", [...IDS, ...ANALYTICS]);
inputProbe("cluster", "unfollow", [...IDS, ...ANALYTICS]);
inputProbe("cluster", "followCluster", [...IDS, ...ANALYTICS]);
inputProbe("cluster", "addElementsToCluster", [...IDS, ...ANALYTICS, ...ORDER]);
inputProbe("cluster", "reorderElement", [...IDS, ...ORDER]);
inputProbe("cluster", "attachToParent", [...IDS, ...ORDER]);
inputProbe("cluster", "detachFromParent", [...IDS, ...ORDER]);
inputProbe("cluster", "inviteCollaborator", [...IDS, ...SOCIAL]);
inputProbe("cluster", "inviteCollaborators", [...IDS, ...SOCIAL]);
inputProbe("cluster", "deleteCollaborator", [...IDS, ...SOCIAL]);
inputProbe("cluster", "deleteCollaborators", [...IDS, ...SOCIAL]);
inputProbe("cluster", "acceptCollaboration", [...IDS, ...SOCIAL]);
inputProbe("cluster", "declineCollaboration", [...IDS, ...SOCIAL]);
inputProbe("cluster", "leaveCollaboration", [...IDS, ...SOCIAL]);
inputProbe("cluster", "createInviteLink", [...IDS, ...SOCIAL]);
inputProbe("cluster", "reportCluster", [...IDS, ...SOCIAL, "reportType", "details"]);

/* ---------------- element lifecycle ---------------- */

inputProbe("element", "create", [...IDS, ...CONTENT, ...ANALYTICS, ...FLAGS]);
inputProbe("element", "deleteElements", [...IDS, ...ANALYTICS]);
inputProbe("element", "disconnectElementsFromCluster", [...IDS, ...ANALYTICS]);
inputProbe("element", "editElementsConnectionsToClusters", [
  ...IDS, "clusterIdsToConnect", "clusterIdsToDisconnect", ...ANALYTICS,
]);
inputProbe("element", "updateCaption", [...IDS, ...CONTENT]);
inputProbe("element", "clearCaption", [...IDS]);
inputProbe("element", "dislike", [...IDS, ...ANALYTICS]);
inputProbe("element", "undislike", [...IDS, ...ANALYTICS]);
inputProbe("element", "report", [...IDS, ...SOCIAL, "reportType", "details"]);
inputProbe("element", "addTag", [...IDS, ...CONTENT, "tag", "value", "label"]);
inputProbe("element", "removeTag", [...IDS, "tag", "value", "label"]);
inputProbe("element", "setCover", [...IDS, ...CONTENT]);
inputProbe("element", "group", [...IDS, ...ORDER]);
inputProbe("element", "view", [...IDS, ...ANALYTICS]);
inputProbe("element", "recordElementEvent", [...IDS, ...ANALYTICS]);

/* ---------------- import / export ---------------- */

inputProbe("import", "requestFromUrls", [
  "sourceUrls", ...IDS, ...CONTENT, ...ANALYTICS, "channelSlug", "channelId",
  "arenaUsername", "arenaChannel", "importSource", "provider",
]);
inputProbe("import", "request", [
  "sourceUrls", ...IDS, ...CONTENT, "channelSlug", "channelId", "arenaUsername",
  "arenaChannel", "importSource", "provider", "type", "kind",
]);
inputProbe("export", "exportCluster", [...IDS, "format", "type", "includeSubclusters"]);

/* ---------------- user / social ---------------- */

inputProbe("userFollow", "create", [...IDS, ...ANALYTICS, "followerId", "followeeId"]);
inputProbe("userFollow", "delete", [...IDS, ...ANALYTICS, "followerId", "followeeId"]);
inputProbe("user", "updateProfile", [...PROFILE, ...IDS]);
inputProbe("user", "setAge", [...IDS, "age", "birthDate", "dateOfBirth"]);

/* ---------------- newly leaked, existence unconfirmed ---------------- */

const LEAKED: [string, string][] = [
  ["cluster", "unfollowCluster"], ["cluster", "reorder"], ["cluster", "onboardingCluster"],
  ["element", "editElementText"], ["element", "editElementUrl"], ["element", "reorder"],
  ["element", "removeUserTag"], ["element", "reportMany"], ["element", "request"],
  ["import", "request"], ["import", "requestFromUrls"], ["auth", "resend"],
  ["auth", "request"], ["user", "setAge"], ["user", "update"], ["feed", "update"],
  ["forYou", "update"], ["activity", "markAllAsRead"], ["activity", "markAsRead"],
];
for (const [g, f] of LEAKED)
  out.push({
    label: `${g}.${f} (existence)`,
    query: `mutation Probe { ${g} { ${f} { zzzProbe } } }`,
  });

/* ---------------- query root arguments ---------------- */

const LIST_ARGS = [
  "userId", "ownerId", "clusterId", "elementId", "elementIds", "categoryId",
  "searchTerm", "searchOrigin", "filters", "order", "meta", "pageSize",
  "pageCursor", "limit", "offset", "input", "slug", "username", "id",
  "isLoggedIn", "contentType", "color", "type", "sort",
];

for (const f of [
  "searchClusters", "search", "searches", "clusters", "cluster", "users",
  "user", "elements", "clusterElements", "userClusters", "clusterFollowers",
  "featuredClusters", "topicClusters", "clusterConnections", "clusterSuggestions",
  "elementTopUsers", "forYouElements", "recentlyEditedCluster", "onboardingCluster",
  "collaborationInvite", "clusterFollowersBatch", "numberOfFollowedClusters",
])
  argProbe(f, LIST_ARGS);

/* ---------------- me / User remaining fields ---------------- */

const ME_LEAF = [
  "age", "lastName", "websiteUrl", "emailConfirmed", "enforceNotSafeForWork",
  "isFeatured", "numberOfFollowedClusters",
];
for (const f of ME_LEAF) out.push({ label: `me.${f}`, query: `query Probe { me { ${f} } }` });
const ME_OBJ = ["experiments", "featureFlags", "invoices", "onboardingCluster", "recentlyEditedCluster"];
for (const f of ME_OBJ)
  out.push({ label: `me.${f}`, query: `query Probe { me { ${f} { zzzProbe } } }` });

await Bun.write(`${import.meta.dir}/probes-round4.json`, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} probes`);
