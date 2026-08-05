/**
 * Cosmos GraphQL schema discovery probe.
 *
 * Introspection is disabled and we are unauthenticated, but GraphQL *validation*
 * errors are still returned alongside the AUTHENTICATION error. That lets us
 * reconstruct the schema without ever signing in:
 *
 *   FIELDS_ON_CORRECT_TYPE      -> field does not exist. Message names the PARENT TYPE,
 *                                  and often appends "Did you mean 'a', 'b', ...?" which
 *                                  leaks real sibling field names. Gold.
 *   AUTHENTICATION only         -> field exists, needs auth
 *   ARGUMENTS_OF_CORRECT_TYPE   -> arg exists, wrong value/shape (message lists required fields)
 *   UNKNOWN_ARGUMENT            -> arg name wrong (message often lists valid ones)
 *   PROVIDED_REQUIRED_ARGUMENTS -> required arg missing (message names its type)
 *   SCALAR_LEAFS                -> field exists and is a LEAF (message names its scalar type)
 *
 * Core trick used everywhere below: select a nonsense sub-field `zzzProbe` under the
 * field of interest. The resulting FIELDS_ON_CORRECT_TYPE error names the type that
 * field returns, which confirms existence AND gives us the type name for free.
 *
 * Usage:
 *   bun run scripts/probe-schema.ts 1     # existence sweep
 *   bun run scripts/probe-schema.ts 2     # type-shape sweep
 *   bun run scripts/probe-schema.ts 3     # arg / input-object shapes
 *   bun run scripts/probe-schema.ts 4     # confirmation pass
 */

const ENDPOINT = "https://api.cosmos.so/graphql";
const DELAY_MS = Number(process.env.PROBE_DELAY ?? 120);
const OUT_DIR = process.env.PROBE_OUT ?? "/tmp/cosmos-probe";

type ProbeResult = {
  label: string;
  status: number;
  codes: string[];
  messages: string[];
  verdict: string;
  /** Type name leaked by a "Cannot query field 'x' on type 'T'." message. */
  parentType?: string;
  /** Field names leaked by a "Did you mean ...?" suggestion. */
  suggestions: string[];
  query: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let requestCount = 0;

async function raw(operationName: string, query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(`${ENDPOINT}?q=${operationName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-name": "cosmos-web",
      origin: "https://www.cosmos.so",
      referer: "https://www.cosmos.so/",
      accept: "application/graphql-response+json,application/json;q=0.9",
    },
    body: JSON.stringify({ operationName, query, variables }),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = { parseError: true };
  }
  return { status: res.status, body };
}

const PROBE_TOKEN = "zzzProbe";

function extractParentType(messages: string[]): string | undefined {
  for (const m of messages) {
    const hit = m.match(/Cannot query field '([^']+)' on type '([^']+)'/);
    if (hit && hit[1] === PROBE_TOKEN) return hit[2];
  }
  for (const m of messages) {
    const hit = m.match(/Cannot query field '[^']+' on type '([^']+)'/);
    if (hit) return hit[1];
  }
  return undefined;
}

function extractSuggestions(messages: string[]): string[] {
  const out = new Set<string>();
  for (const m of messages) {
    const tail = m.match(/Did you mean (.+)\?$/)?.[1];
    if (!tail) continue;
    for (const s of tail.matchAll(/'([^']+)'/g)) {
      if (s[1]) out.add(s[1]);
    }
  }
  return [...out];
}

function classify(status: number, codes: string[], messages: string[], query: string): string {
  const joined = messages.join(" | ");
  // The probe token itself failing means the *parent* field exists and returned an object.
  if (query.includes(PROBE_TOKEN) && new RegExp(`Cannot query field '${PROBE_TOKEN}'`).test(joined))
    return "EXISTS (object)";
  if (/must not have a sub ?selection|must not have a selection/i.test(joined))
    return "EXISTS (leaf/scalar)";
  if (codes.includes("FIELDS_ON_CORRECT_TYPE")) return "NOT FOUND";
  if (codes.includes("UNKNOWN_TYPE") || codes.includes("VARIABLES_ARE_INPUT_TYPES"))
    return "NO SUCH TYPE";
  if (codes.includes("UNKNOWN_ARGUMENT")) return "BAD ARG NAME";
  if (codes.includes("PROVIDED_REQUIRED_ARGUMENTS")) return "EXISTS (missing req arg)";
  if (codes.includes("ARGUMENTS_OF_CORRECT_TYPE")) return "EXISTS (input shape!)";
  if (codes.includes("VARIABLES_OF_CORRECT_TYPE")) return "EXISTS (var type!)";
  if (codes.includes("SCALAR_LEAFS")) return "EXISTS (leaf/scalar)";
  if (codes.includes("FRAGMENTS_ON_COMPOSITE_TYPES")) return "EXISTS (composite)";
  if (codes.includes("INTROSPECTION_NOT_ALLOWED")) return "introspection blocked";
  if (codes.includes("AUTHENTICATION")) return "EXISTS (auth-gated)";
  if (codes.length === 0 && status === 200) return "EXISTS (public, returned data)";
  return `? (${status}) ${codes.join(",")}`;
}

async function probe(
  label: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<ProbeResult> {
  requestCount++;
  let attempt = 0;
  let status = 0;
  let body: any = null;
  while (attempt < 5) {
    ({ status, body } = await raw("Probe", query, variables));
    if (status !== 429) break;
    attempt++;
    const backoff = 3000 * Math.pow(2, attempt);
    console.error(`  !! 429 on "${label}", backing off ${backoff}ms`);
    await sleep(backoff);
  }
  const errs: any[] = body?.errors ?? [];
  const codes = [...new Set(errs.map((e) => e?.extensions?.code ?? "NO_CODE"))];
  const messages = errs.map((e) => String(e?.message ?? ""));
  const r: ProbeResult = {
    label,
    status,
    codes,
    messages,
    verdict: classify(status, codes, messages, query),
    parentType: extractParentType(messages),
    suggestions: extractSuggestions(messages),
    query,
  };
  await sleep(DELAY_MS);
  return r;
}

const informative = (r: ProbeResult) => r.messages.filter((m) => !/unauthenticated/i.test(m));

const EXISTS_ORDER = [
  "EXISTS (input shape!)",
  "EXISTS (var type!)",
  "EXISTS (missing req arg)",
  "EXISTS (object)",
  "EXISTS (leaf/scalar)",
  "EXISTS (composite)",
  "EXISTS (auth-gated)",
  "EXISTS (public, returned data)",
  "BAD ARG NAME",
  "NO SUCH TYPE",
  "NOT FOUND",
];

async function report(title: string, results: ProbeResult[], slug: string) {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
  const sorted = [...results].sort(
    (a, b) =>
      (EXISTS_ORDER.indexOf(a.verdict) + 99) % 1000 - ((EXISTS_ORDER.indexOf(b.verdict) + 99) % 1000),
  );
  for (const r of sorted) {
    if (r.verdict === "NOT FOUND") continue;
    console.log(`\n[${r.verdict}] ${r.label}${r.parentType ? `   -> returns ${r.parentType}` : ""}`);
    for (const m of informative(r)) console.log(`    ${m}`);
  }
  const notFound = results.filter((r) => r.verdict === "NOT FOUND");
  console.log(`\n--- NOT FOUND (${notFound.length}): ${notFound.map((r) => r.label).join(", ")}`);

  const allSuggestions = new Set<string>();
  for (const r of results) for (const s of r.suggestions) allSuggestions.add(s);
  if (allSuggestions.size)
    console.log(`\n*** LEAKED SIBLING NAMES: ${[...allSuggestions].sort().join(", ")}`);

  await Bun.write(`${OUT_DIR}/${slug}.json`, JSON.stringify(results, null, 2));
  console.log(`\n(raw results -> ${OUT_DIR}/${slug}.json)`);
}

/* ---------------- query builders ---------------- */

/** field exists? + what type does it return? */
const objField = (path: string) => `query Probe { ${path} { ${PROBE_TOKEN} } }`;
const mObjField = (path: string) => `mutation Probe { ${path} { ${PROBE_TOKEN} } }`;
/** mutation group field, no args at all -> leaks required-arg name+type */
const mNoArgs = (group: string, field: string) =>
  `mutation Probe { ${group} { ${field} { ${PROBE_TOKEN} } } }`;
/** mutation group field with empty input -> leaks required INPUT FIELDS */
const mEmptyInput = (group: string, field: string) =>
  `mutation Probe { ${group} { ${field}(input: {}) { ${PROBE_TOKEN} } } }`;
/** send a bogus input key -> leaks the input type name */
const mBogusKey = (group: string, field: string) =>
  `mutation Probe { ${group} { ${field}(input: {${PROBE_TOKEN}: 1}) { ${PROBE_TOKEN} } } }`;
/** send a bogus ARGUMENT -> leaks the valid argument names */
const mBogusArg = (group: string, field: string) =>
  `mutation Probe { ${group} { ${field}(${PROBE_TOKEN}: 1) { ${PROBE_TOKEN} } } }`;
const qBogusArg = (field: string) => `query Probe { ${field}(${PROBE_TOKEN}: 1) { ${PROBE_TOKEN} } }`;
const qNoArgs = (field: string) => `query Probe { ${field} { ${PROBE_TOKEN} } }`;

/* ================================================================== */
/* ROUND 1 — existence sweep                                          */
/* ================================================================== */

const CLUSTER_MUTATIONS = [
  "create", "update", "edit", "rename", "delete", "remove", "archive", "destroy",
  "setCover", "updateCover", "setCoverImage", "changeCover", "cover",
  "pin", "unpin", "pinToProfile", "unpinFromProfile", "pinToUserProfile",
  "unpinFromUserProfile", "setPinnedToUserProfile", "togglePin", "pinToUser",
  "follow", "unfollow", "setFollow", "toggleFollow", "followCluster",
  "addElementsToCluster", "removeElementsFromCluster", "removeElements",
  "reorder", "reorderElements", "sortElements", "move", "moveToCluster",
  "duplicate", "fork", "copy", "clone",
  "createSubcluster", "createSubCluster", "addSubcluster", "addSubCluster",
  "setParent", "setParentCluster", "nest",
  "addCollaborator", "addCollaborators", "removeCollaborator", "inviteCollaborator",
  "inviteCollaborators", "invite", "acceptInvite", "acceptInvitation",
  "declineInvite", "leaveCluster", "leave", "updateCollaborator",
  "setPrivacy", "makePrivate", "makePublic", "setVisibility",
  "report", "merge", "share", "createShareLink", "generateShareLink",
  "import", "importFromUrl", "export", "view", "recordClusterEvent", "canvas",
  "setDescription", "setName", "updateName", "updateDescription",
  "hide", "mute", "star", "like", "save", "bookmark",
  "removeFromFeatured", "addToFeatured", "feature", "unfeature",
  "removeFromOnboarding", "addToOnboarding", "group", "ungroup", "addTag",
];

const ELEMENT_MUTATIONS = [
  "create", "createElement", "createElements", "add", "addElement", "upload",
  "uploadElement", "uploadFromUrl", "createFromUrl", "createFromUrls",
  "importFromUrl", "import", "importUrl", "saveUrl", "save", "saveToLibrary",
  "addFromUrl", "addUrl", "createImage", "createLink", "createText", "createNote",
  "update", "edit", "delete", "remove", "destroy", "archive",
  "editElementsConnectionsToClusters", "recordElementEvent", "view",
  "removeFromCluster", "removeElementsFromCluster", "disconnect",
  "like", "unlike", "dislike", "hide", "unhide", "block", "report", "flag",
  "notInterested", "markNotInterested", "feedback",
  "setTitle", "setDescription", "setCaption", "updateMetadata",
  "addToLibrary", "removeFromLibrary", "duplicate", "copy", "download",
  "addComment", "comment", "createComment", "reply",
  "addTag", "removeTag", "setCover", "group", "ungroup",
  "removeFromFeatured", "addToFeatured", "removeFromOnboarding",
];

/** Mutation groups seen or hinted at. Probing `group { zzzProbe }` leaks the group's TYPE. */
const MUTATION_GROUPS = [
  "cluster", "element", "activity", "user", "auth", "import", "export",
  "userFollow", "subscription", "payment", "tag", "category", "admin",
  "waitlist", "verifiedProfile", "feed", "forYou", "inviteCode", "search",
  "shop", "userShop", "canvas", "clusterCanvas", "reflect", "onboarding",
  "collection", "organization", "arenaImport", "elementReport", "report",
];

const QUERY_ROOTS = [
  // from "did you mean" leaks in round 1
  "search", "searches", "searchClusters", "searchElements", "featuredProfiles",
  "featuredElements", "featuredClusters", "topicClusters", "categoryClusters",
  "userClusters", "clusters", "cluster", "clusterExport", "clusterExports",
  "clusterCanvas", "clusterElements", "clusterFollowers", "username",
  "suggestUsernames", "userShop", "fullUser", "user", "users", "reflect",
  "elements", "element", "elementView", "elementTile", "elementReports",
  "similarElements", "latestElements", "userElements", "allElements",
  "userFollows", "followingUpdates", "followingFeed", "tag", "me",
  "inviteCode", "forYou", "explore", "categories", "topic", "topics",
  "shop", "canvas", "collection", "collections", "onboarding",
];

async function round1() {
  const results: ProbeResult[] = [];
  for (const g of MUTATION_GROUPS)
    results.push(await probe(`Mutation.${g}`, mObjField(g)));
  for (const f of CLUSTER_MUTATIONS)
    results.push(await probe(`ClusterMutationGroup.${f}`, mNoArgs("cluster", f)));
  for (const f of ELEMENT_MUTATIONS)
    results.push(await probe(`ElementMutationGroup.${f}`, mNoArgs("element", f)));
  for (const f of QUERY_ROOTS) results.push(await probe(`Query.${f}`, qNoArgs(f)));
  await report("ROUND 1 — existence sweep", results, "round1");
  return results;
}

/* ================================================================== */
/* ROUND 2 — enumerate fields on newly-found mutation groups + types  */
/* ================================================================== */

const GENERIC_MUT_FIELDS = [
  "create", "update", "delete", "remove", "add", "edit", "set", "toggle",
  "follow", "unfollow", "block", "unblock", "mute", "report", "hide",
  "like", "save", "invite", "accept", "decline", "record", "start", "cancel",
  "markAllAsRead", "markAsRead", "importFromUrl", "createFromUrl", "upload",
  "createFromUrls", "createFromFile", "createMany", "batchCreate", "view",
  "updateProfile", "setAvatar", "uploadAvatar", "signIn", "signUp", "logout",
];

async function round2(groups: string[], userFields: string[], userSelFields: string[]) {
  const results: ProbeResult[] = [];
  for (const g of groups)
    for (const f of GENERIC_MUT_FIELDS) results.push(await probe(`${g}.${f}`, mNoArgs(g, f)));
  for (const f of userFields) results.push(await probe(`me.${f}`, `query Probe { me { ${f} } }`));
  for (const f of userSelFields) results.push(await probe(`me.${f}`, objField(`me { ${f}`.replace(/$/, ""))));
  await report("ROUND 2 — group fields + User shape", results, "round2");
  return results;
}

/* ================================================================== */
/* ROUND 3/4 — driven by a JSON file of {label, query} pairs           */
/* ================================================================== */

type ShapeProbe = { label: string; query: string; variables?: Record<string, unknown> };

async function runShapes(title: string, slug: string, shapes: ShapeProbe[]) {
  const results: ProbeResult[] = [];
  for (const s of shapes) results.push(await probe(s.label, s.query, s.variables ?? {}));
  await report(title, results, slug);
  return results;
}

/* ================================================================== */

async function main() {
  const which = process.argv.slice(2);
  const run = (n: string) => which.length === 0 || which.includes(n);

  if (run("1")) await round1();
  if (run("2")) {
    const groups = (process.env.PROBE_GROUPS ?? "cluster,element,activity,user").split(",");
    const uf = (process.env.PROBE_USER_FIELDS ?? "").split(",").filter(Boolean);
    const us = (process.env.PROBE_USER_SEL ?? "").split(",").filter(Boolean);
    await round2(groups, uf, us);
  }
  for (const n of ["3", "4", "5", "6"]) {
    if (!run(n)) continue;
    const file = `${import.meta.dir}/probes-round${n}.json`;
    if (!(await Bun.file(file).exists())) continue;
    const shapes = (await Bun.file(file).json()) as ShapeProbe[];
    await runShapes(`ROUND ${n}`, `round${n}`, shapes);
  }
  console.log(`\n\n${requestCount} requests issued.`);
}

export { probe, raw, report, runShapes, mNoArgs, mEmptyInput, mBogusKey, mBogusArg, qBogusArg, qNoArgs, objField, mObjField, informative };
export type { ProbeResult, ShapeProbe };

if (import.meta.main) await main();
