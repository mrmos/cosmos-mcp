/** Generates scripts/probes-round5.json — remaining input types, query args, User shape. */

const out: { label: string; query: string }[] = [];
const CHUNK = 22;
const chunk = <T>(xs: T[], n: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
};

function inputProbe(group: string, field: string, candidates: string[]) {
  for (const [i, c] of chunk(candidates, CHUNK).entries())
    out.push({
      label: `${group}.${field} input #${i + 1}`,
      query: `mutation Probe { ${group} { ${field}(input: {${c.map((k) => `${k}: true`).join(", ")}}) { __typename } } }`,
    });
}

function argProbe(field: string, candidates: string[], fixed = "") {
  for (const [i, c] of chunk(candidates, CHUNK).entries())
    out.push({
      label: `Query.${field} args #${i + 1}`,
      query: `query Probe { ${field}(${fixed}${fixed ? ", " : ""}${c.map((k) => `${k}: true`).join(", ")}) { zzzProbe } }`,
    });
}

/* ---- A. remaining input object types ---- */

inputProbe("element", "editElementText", [
  "elementId", "elementIds", "userId", "text", "title", "caption", "content", "body", "ownerOrgId",
]);
inputProbe("element", "editElementUrl", [
  "elementId", "elementIds", "userId", "url", "sourceUrl", "link", "ownerOrgId",
]);
inputProbe("element", "removeUserTag", [
  "elementId", "userId", "tagId", "taggedUserId", "assignerId", "removerId",
]);
inputProbe("element", "reportMany", [
  "ids", "elementIds", "userId", "reporterId", "reason", "reportReason", "type", "reportType", "details", "comment",
]);
inputProbe("element", "report", [
  "id", "elementId", "userId", "reporterId", "reason", "reportReason", "type",
  "reportType", "details", "comment", "message", "description", "category",
]);
inputProbe("element", "group", [
  "elementId", "elementIds", "userId", "groupId", "targetElementId", "parentElementId", "clusterId", "mediaIds",
]);
inputProbe("element", "setCover", [
  "elementId", "mediaId", "userId", "url", "coverUrl", "thumbnailUrl", "time", "timestamp", "frame",
]);
inputProbe("element", "addTag", [
  "elementId", "assignerId", "tagId", "userId", "name", "value", "label", "taggedUserId", "text",
]);
inputProbe("element", "create", [
  "userId", "url", "sourceUrl", "text", "clusterId", "ownerOrgId", "caption",
  "title", "description", "name", "notSafeForWork", "aiGenerated", "width",
  "height", "mediaId", "fileId", "uploadId", "blurHash", "mimeType", "kind",
  "elementType", "contentType", "slateId", "userInteractionSource", "actionScreen",
  "analyticsProperties", "elementAnalyticsProperties", "tags", "tagIds", "position",
]);

inputProbe("cluster", "inviteCollaborators", [
  "clusterId", "userId", "userIds", "emails", "email", "invites", "invitations",
  "collaborators", "inviterId", "usernames", "recipients", "members",
]);
inputProbe("cluster", "deleteCollaborators", [
  "clusterId", "userIds", "userId", "collaboratorIds", "requesterId", "removerId",
]);
inputProbe("cluster", "reportCluster", [
  "clusterId", "id", "userId", "reporterId", "reason", "reportReason", "type",
  "reportType", "details", "comment", "message", "description", "category",
]);
inputProbe("cluster", "createInviteLink", [
  "clusterId", "userId", "role", "permission", "expiresAt", "expiresIn", "maxUses",
]);
inputProbe("cluster", "inviteCollaborator", [
  "clusterId", "userId", "email", "username", "role", "permission", "inviterId", "message",
]);
inputProbe("cluster", "reorderElement", [
  "clusterId", "elementId", "userId", "position", "index", "order", "targetIndex",
  "newIndex", "afterElementId", "beforeElementId", "previousElementId",
  "nextElementId", "rank", "toIndex", "fromIndex", "sortOrder", "destinationIndex",
]);
inputProbe("cluster", "create", [
  "userId", "name", "description", "isPrivate", "ownerOrgId", "parentClusterId",
  "elementIds", "coverImageElementId", "slug", "categoryId", "categoryIds",
  "isPinnedToUserProfile", "userInteractionSource", "actionScreen", "slateId",
]);

inputProbe("export", "exportCluster", [
  "clusterId", "userId", "format", "type", "fileType", "includeSubclusters",
  "quality", "resolution", "ownerOrgId",
]);
inputProbe("import", "request", [
  "sourceUrl", "userId", "clusterId", "ownerOrgId", "type", "source",
  "channelSlug", "arenaUsername", "importSource", "provider", "name",
]);
inputProbe("import", "requestFromUrls", [
  "sourceUrls", "userId", "clusterId", "ownerOrgId", "type", "source",
  "channelSlug", "arenaUsername", "importSource", "provider", "name",
  "userInteractionSource", "actionScreen", "slateId",
]);

inputProbe("userFollow", "create", [
  "followerId", "followeeId", "userInteractionSource", "actionScreen", "slateId",
  "userId", "targetUserId", "ownerOrgId",
]);
inputProbe("user", "updateProfile", [
  "userId", "fullName", "firstName", "lastName", "bio", "email", "websiteUrl",
  "ownerOrgId", "avatarUrl", "username", "instagramUsername", "twitterUsername",
  "location", "coverImageUrl", "isPrivate", "categoryIds", "phoneNumber",
  "avatarMediaId", "avatar", "notSafeForWork",
]);
inputProbe("activity", "markAllAsRead", ["ownerId", "userId", "activityIds", "ids"]);

/* ---- B. query root args ---- */

const ARG_POOL = [
  "filters", "meta", "order", "pageSize", "pageCursor", "first", "after",
  "limit", "offset", "categoryId", "categorySlug", "slug", "ids", "userIds",
  "clusterIds", "isPrivate", "ownerOrgId", "code", "inviteCode", "term",
  "query", "q", "searchTerm", "userId", "isLoggedIn", "topic", "topicId",
  "excludeIds", "seed", "count",
];

for (const f of [
  "clusters", "users", "elements", "featuredClusters", "topicClusters",
  "clusterSuggestions", "collaborationInvite", "searches", "featuredElements",
  "featuredProfiles", "latestElements", "userElements", "elementConnections",
  "activityFeed", "followingFeed", "clusterCanvas", "categories",
])
  argProbe(f, ARG_POOL);

argProbe("searchClusters", ARG_POOL, 'searchTerm: "x"');
argProbe("search", ARG_POOL, 'searchTerm: "x"');
argProbe("searchElements", ARG_POOL, 'searchTerm: "x"');
argProbe("clusterElements", ARG_POOL, "clusterId: 1");
argProbe("userClusters", ARG_POOL, "userId: 1");

out.push({
  label: "Query.numberOfFollowedClusters (existence)",
  query: `query Probe { numberOfFollowedClusters }`,
});

/* ---- C. SearchResult / Searches shape ---- */

for (const f of [
  "clusters", "users", "elements", "profiles", "members", "tags", "topics",
  "items", "meta", "clusterList", "userList", "elementList", "total", "count",
])
  out.push({
    label: `SearchResult.${f}`,
    query: `query Probe { search(searchTerm: "x") { ${f} { zzzProbe } } }`,
  });
for (const f of ["items", "meta", "recent", "suggested", "history", "popular", "trending"])
  out.push({ label: `Searches.${f}`, query: `query Probe { searches { ${f} { zzzProbe } } }` });

/* ---- D. User (me) remaining fields ---- */

const ME_LEAF = [
  "firstName", "birthDate", "dateOfBirth", "gender", "country", "city",
  "instagramUsername", "twitterUsername", "isOnboarded", "signupSource",
  "stripeCustomerId", "premiumUntil", "premiumSince", "trialEndsAt",
  "isTrialing", "numberOfClusters", "numberOfPublicElements", "elementCount",
  "clusterCount", "followerCount", "followeeCount", "isStaff", "isModerator",
  "deletedAt", "bannedAt", "lastSeenAt", "profileUrl", "shareUrl",
  "notSafeForWorkPreference", "nsfwPreference", "showNsfw", "theme",
];
for (const f of ME_LEAF) out.push({ label: `me.${f}`, query: `query Probe { me { ${f} } }` });

const ME_OBJ = [
  "publicProfile", "userPublicProfile", "profile", "publicElementsCluster",
  "defaultCluster", "shop", "org", "organization", "onboarding",
];
for (const f of ME_OBJ)
  out.push({ label: `me.${f}`, query: `query Probe { me { ${f} { zzzProbe } } }` });

await Bun.write(`${import.meta.dir}/probes-round5.json`, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} probes`);
