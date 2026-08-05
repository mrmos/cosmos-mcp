/** Generates scripts/probes-round6.json — final gap-filling round. */

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

/* ---- gaps in input objects ---- */

inputProbe("cluster", "inviteCollaborators", [
  "clusterId", "collaboratorEmails", "invitees", "emailAddresses", "userEmails",
  "collaboratorsToInvite", "data", "items", "list", "collaborators", "invites",
  "emails", "userIds", "usernames", "inviterId", "userId", "members",
  "invitations", "recipients", "targets", "people",
]);
inputProbe("cluster", "reorderElement", [
  "clusterId", "elementId", "newPosition", "sortIndex", "toPosition",
  "precedingElementId", "succeedingElementId", "orderIndex", "place",
  "direction", "moveTo", "insertAfter", "insertBefore", "position", "index",
  "order", "targetIndex", "userId", "afterElementId", "beforeElementId", "rank",
]);
inputProbe("element", "group", [
  "elementId", "groupWithElementId", "targetId", "mediaIds", "elementIdsToGroup",
  "targetElementId", "withElementId", "otherElementId", "secondaryElementId",
  "childElementIds", "elementIds", "userId", "mediaId", "sourceElementId",
]);
inputProbe("element", "report", [
  "id", "reason", "reportReason", "comment", "userId", "reporterId",
  "elementId", "note", "text", "explanation", "reportType",
]);
inputProbe("cluster", "reportCluster", [
  "clusterId", "reason", "reportReason", "comment", "userId", "reporterId",
  "note", "text", "explanation", "reportType", "id",
]);
inputProbe("cluster", "createInviteLink", [
  "clusterId", "userId", "creatorId", "ownerId", "role", "permission",
  "expiresAt", "ttl", "maxUses", "regenerate", "refresh",
]);

/* ---- search sub-list arguments (pagination / filters) ---- */

const SUB_ARGS = [
  "meta", "filters", "order", "pageSize", "pageCursor", "limit", "offset",
  "first", "after", "userId", "searchOrigin", "contentType", "color",
];
for (const sub of ["clusters", "users", "elements"])
  for (const [i, c] of chunk(SUB_ARGS, CHUNK).entries())
    out.push({
      label: `SearchResult.${sub} args #${i + 1}`,
      query: `query Probe { search(searchTerm: "x") { ${sub}(${c.map((k) => `${k}: true`).join(", ")}) { zzzProbe } } }`,
    });

/* ---- SearchClusterList / SearchUserList shape ---- */
for (const sub of ["clusters", "users", "elements"])
  for (const f of ["items", "meta", "nextPageCursor", "count", "total"])
    out.push({
      label: `SearchResult.${sub}.${f}`,
      query: `query Probe { search(searchTerm: "x") { ${sub} { ${f} { zzzProbe } } } }`,
    });
for (const f of ["id", "name", "slug", "username", "fullName", "avatarUrl", "__typename"])
  out.push({
    label: `SearchUserList.items.${f}`,
    query: `query Probe { search(searchTerm: "x") { users { items { ${f} } } } }`,
  });
for (const f of ["id", "name", "slug", "description", "isPrivate", "owner", "coverImageUrl", "numberOfElements"])
  out.push({
    label: `SearchClusterList.items.${f}`,
    query: `query Probe { search(searchTerm: "x") { clusters { items { ${f} } } } }`,
  });

/* ---- searchClusters / searchElements extra args ---- */
const SC_ARGS = [
  "meta", "filters", "order", "pageSize", "pageCursor", "limit", "userId",
  "searchOrigin", "isPrivate", "ownerId", "excludeClusterIds", "categoryId",
];
for (const [i, c] of chunk(SC_ARGS, CHUNK).entries()) {
  out.push({
    label: `Query.searchClusters args #${i + 1}`,
    query: `query Probe { searchClusters(searchTerm: "x", ${c.map((k) => `${k}: true`).join(", ")}) { zzzProbe } }`,
  });
  out.push({
    label: `Query.search args #${i + 1}`,
    query: `query Probe { search(searchTerm: "x", ${c.map((k) => `${k}: true`).join(", ")}) { zzzProbe } }`,
  });
}

/* ---- do these arg-less query roots take ANY args? (one bogus arg leaks suggestions) ---- */
for (const f of [
  "clusters", "users", "elements", "featuredClusters", "topicClusters",
  "clusterSuggestions", "searches", "featuredElements", "featuredProfiles",
  "latestElements", "elementConnections", "activityFeed", "followingFeed",
  "clusterCanvas", "categories", "cluster", "explore", "reflect", "userShop",
])
  out.push({
    label: `Query.${f} bogus-arg`,
    query: `query Probe { ${f}(zzzArg: 1) { zzzProbe } }`,
  });

/* ---- User: leaked + remaining candidates ---- */
const ME = [
  "birthday", "defaultHomeTab", "isNotSafeForWorkAllowed", "numberOfFollowedClusters",
  "isVerifiedProfile", "websiteUrl", "createdAt", "avatarUrl", "isPremium",
  "hasCompletedOnboarding", "emailConfirmed", "isFeatured", "isBanned",
  "age", "bio", "email", "fullName", "lastName", "firstName", "name",
  "username", "id", "phoneNumber", "hasPassword", "shareUrl",
];
for (const f of ME) out.push({ label: `me.${f}`, query: `query Probe { me { ${f} } }` });
for (const f of ["clusters", "elements", "organizations", "verifiedProfile", "experiments", "featureFlags", "invoices", "subscription", "recentlyEditedCluster", "forYouConfiguration"])
  out.push({ label: `me.${f} (obj)`, query: `query Probe { me { ${f} { zzzProbe } } }` });

/* ---- Cluster type: fields useful to an MCP ---- */
for (const f of [
  "id", "name", "slug", "description", "isPrivate", "ownerId", "owner",
  "coverImageUrl", "coverImageElementId", "numberOfElements", "isFollowed",
  "isFeatured", "parentClusterId", "subClusters", "collaborators",
  "collaboratorsCount", "elements", "followersCount", "createdAt", "updatedAt",
  "url", "shareUrl", "canvas", "tags", "categories", "isPinnedToUserProfile",
])
  out.push({
    label: `Cluster.${f}`,
    query: `query Probe { cluster(id: 1) { ${f} } }`,
  });

await Bun.write(`${import.meta.dir}/probes-round6.json`, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} probes`);
