/**
 * Generates scripts/probes-round2.json — a broad sweep over every discovered
 * mutation group plus the User type and remaining query roots.
 */
const P = "zzzProbe";
const out: { label: string; query: string }[] = [];

const mNoArgs = (g: string, f: string) => `mutation Probe { ${g} { ${f} { ${P} } } }`;
const qSel = (f: string) => `query Probe { ${f} { ${P} } }`;

/* ---- mutation groups × verbs ---- */

const GROUPS = [
  "cluster", "element", "user", "userFollow", "activity", "import", "export",
  "feed", "forYou", "tag", "category", "auth", "verifiedProfile", "inviteCode",
  "subscription", "waitlist", "payment", "admin",
];

/** Verbs generic enough to be worth trying on every group. */
const VERBS = [
  "create", "update", "edit", "delete", "remove", "add", "set", "record",
  "follow", "unfollow", "block", "unblock", "mute", "report", "hide",
  "like", "dislike", "undislike", "save", "invite", "accept", "decline",
  "start", "cancel", "upload", "view", "reset", "refresh", "sync",
];

for (const g of GROUPS)
  for (const v of VERBS) out.push({ label: `${g}.${v}`, query: mNoArgs(g, v) });

/* ---- cluster: names leaked by "Did you mean" + close cousins ---- */

const CLUSTER = [
  "deleteCluster", "deleteClusters", "deleteCollaborator", "deleteCollaborators",
  "disconnectElementsFromCluster", "reorderElement", "reorderElements",
  "reportCluster", "acceptCollaboration", "leaveCollaboration",
  "declineCollaboration", "rejectCollaboration", "createInviteLink",
  "deleteInviteLink", "createDuringOnboarding", "updateCollaboration",
  "addCollaboration", "removeCollaboration", "collaborate",
  "updateCover", "setCoverElement", "updateCoverImage", "changeCoverImage",
  "pinToUserProfile", "pinCluster", "unpinCluster", "setPinned", "pinned",
  "updatePinnedClusters", "reorderPinnedClusters", "setPinnedClusters",
  "moveElements", "moveElementsToCluster", "transferElements",
  "createSub", "addSub", "createChild", "convertToSubcluster",
  "makeSubcluster", "setSubcluster", "attachToParent", "detachFromParent",
  "duplicateCluster", "copyCluster", "cloneCluster", "forkCluster",
  "exportCluster", "requestExport", "createExport",
  "joinCluster", "requestAccess", "grantAccess", "revokeAccess",
  "updatePrivacy", "togglePrivacy", "publish", "unpublish",
  "addToOnboarding", "removeFromOnboarding", "setCategory", "setCategories",
  "recordEvent", "recordView", "trackEvent", "canary", "userRule",
  "sortElements", "orderElements", "arrange", "layout", "saveCanvas",
  "updateCanvas", "setCanvas",
];
for (const f of CLUSTER)
  out.push({ label: `cluster.${f}`, query: mNoArgs("cluster", f) });

/* ---- element: leaked names + create/upload/import variants ---- */

const ELEMENT = [
  "deleteElements", "deleteElement", "removeElements", "destroyElements",
  "updateCaption", "clearCaption", "setCaption", "editCaption",
  "undislike", "unDislike", "removeDislike", "clearDislike",
  "disconnectElementsFromCluster", "connectElementsToClusters",
  "createElements", "createMany", "createBatch", "batchCreate",
  "createFromFile", "createFromUpload", "createUpload", "requestUpload",
  "getUploadUrl", "createUploadUrl", "presign", "presignedUrl",
  "createFromLink", "addLink", "scrape", "fetchUrl", "resolveUrl",
  "createFromImage", "createFromImageUrl", "createImageElement",
  "setTags", "updateTags", "addTags", "removeTags",
  "moveToCluster", "moveElements", "reorder", "reorderElement",
  "markAsViewed", "recordView", "trackView", "recordEvent",
  "reportElement", "flagElement", "hideElement", "notInterested",
  "updateElement", "editElement", "patch", "setNsfw", "setNotSafeForWork",
  "group", "ungroup", "merge", "split", "removeFromFeatured", "addToFeatured",
];
for (const f of ELEMENT)
  out.push({ label: `element.${f}`, query: mNoArgs("element", f) });

/* ---- user / userFollow social ---- */

const USER = [
  "followUser", "unfollowUser", "createFollow", "deleteFollow",
  "updateProfile", "editProfile", "updateUser", "setBio", "setAvatar",
  "uploadAvatar", "setUsername", "updateUsername", "changeUsername",
  "deleteAccount", "deleteUser", "ban", "unban", "verify", "unverify",
  "updateSettings", "setSettings", "updatePreferences", "setPreferences",
  "completeOnboarding", "onboard", "markOnboarded", "setOnboardingStep",
  "acceptTerms", "setEmail", "updateEmail", "setPassword", "changePassword",
  "recordEvent", "setCategories", "setInterests", "updateInterests",
  "addToFeatured", "removeFromFeatured", "feature", "unfeature",
  "signIn", "signUp", "signOut", "logout", "login", "register",
  "requestDeletion", "restore", "setPrivate", "setPublic",
];
for (const f of USER) out.push({ label: `user.${f}`, query: mNoArgs("user", f) });

const USER_FOLLOW = [
  "followUser", "unfollowUser", "createFollow", "deleteFollow",
  "toggleFollow", "batchFollow", "followMany", "followUsers", "unfollowUsers",
];
for (const f of USER_FOLLOW)
  out.push({ label: `userFollow.${f}`, query: mNoArgs("userFollow", f) });

/* ---- import group (arena / url import) ---- */

const IMPORT = [
  "importFromUrl", "importUrl", "fromUrl", "createFromUrl", "createImport",
  "startImport", "arena", "arenaChannel", "importArenaChannel", "fromArena",
  "pinterest", "importPinterest", "instagram", "figma", "browserExtension",
  "importElements", "importFile", "uploadFile", "csv", "bookmarks",
  "createArenaImport", "status", "retry",
];
for (const f of IMPORT) out.push({ label: `import.${f}`, query: mNoArgs("import", f) });

const EXPORT = [
  "createExport", "exportCluster", "requestExport", "startExport",
  "pdf", "zip", "download", "createClusterExport",
];
for (const f of EXPORT) out.push({ label: `export.${f}`, query: mNoArgs("export", f) });

/* ---- User type (via `me`) ---- */

const USER_LEAF = [
  "id", "username", "email", "fullName", "name", "bio", "avatarUrl", "avatar",
  "isPremium", "isVerifiedProfile", "isBanned", "isAdmin", "isFeatured",
  "createdAt", "updatedAt", "location", "website", "url", "links",
  "followersCount", "followingCount", "numberOfElements", "numberOfClusters",
  "elementsCount", "clustersCount", "onboarded", "onboardingCompleted",
  "onboardingStep", "hasCompletedOnboarding", "phoneNumber", "hasPassword",
  "emailVerified", "isEmailVerified", "referralCode", "invitesLeft",
  "slug", "role", "roles", "plan", "planName", "isPro", "isPrivate",
  "notificationsEnabled", "language", "timezone", "lastActiveAt",
  "isFollowed", "coverImageUrl", "instagramUsername", "twitterUsername",
];
for (const f of USER_LEAF) out.push({ label: `me.${f}`, query: `query Probe { me { ${f} } }` });

const USER_OBJ = [
  "clusters", "publicElementsCluster", "verifiedProfile", "organizations",
  "categories", "elements", "library", "pinnedClusters", "collaborations",
  "followedClusters", "settings", "preferences", "subscription", "profile",
  "avatar", "coverImage", "stats", "counts", "features", "flags",
  "shop", "interests", "tags", "invites", "inviteCodes", "imports",
  "notifications", "activity", "feed", "publicProfile", "forYouConfiguration",
];
for (const f of USER_OBJ)
  out.push({ label: `me.${f}`, query: `query Probe { me { ${f} { ${P} } } }` });

/* ---- remaining query roots worth a try ---- */

const QUERIES = [
  "searchClusters", "searchUsers", "searchProfiles", "userSuggestions",
  "clusterFollowers", "clusterCollaborators", "collaborations",
  "pinnedClusters", "userPinnedClusters", "profileClusters",
  "arenaChannels", "activeImports", "imports", "clusterExports",
  "topics", "topic", "topicElements", "categoryElements",
  "elementTags", "clusterTags", "popularTags", "trendingClusters",
  "recommendedClusters", "clusterRecommendations", "connectableClusters",
  "areSavedToLibrary", "quickConnectRecommendation", "globalSearchHistory",
  "elementTopConnections", "similarElementsV2", "allElementsV2",
  "compositeFollowingFeed", "activityFeed", "forYouUserConfiguration",
  "loader", "userFollowSuggestions", "elementConnections", "elementClusters",
  "elementSocialGraph", "profileCounts", "subcluster", "subclusters",
];
for (const f of QUERIES) out.push({ label: `Query.${f}`, query: qSel(f) });

await Bun.write(
  `${import.meta.dir}/probes-round2.json`,
  JSON.stringify(out, null, 2),
);
console.log(`wrote ${out.length} probes`);
