# Creative tool ideas — what else is worth exposing

Every claim below is backed by a probe run against `https://api.cosmos.so/graphql`
on 2026-08-05, unauthenticated, with the standard `x-client-name: cosmos-web`
headers. Verdicts use the vocabulary from `schema-discovery.md`:

- **EXEC** — ran unauthenticated and returned real data. Sample responses are real.
- **VALID-BUT-AUTH** — HTTP 401 with only `AUTHENTICATION`. The document is well
  formed; every field and argument in it exists.
- **ABSENT** — HTTP 400 `FIELDS_ON_CORRECT_TYPE` / `Unknown field`. Proven not to exist.

Anything not probed is marked **UNVERIFIED** in place.

---

## Recommendation summary

Four tools, ranked. Three are public and need no credential.

| Rank | Tool | Auth | Value |
| --- | --- | --- | --- |
| 1 | `cosmos_element_saved_by` | no | high |
| 2 | `cosmos_browse_boards` | no | high |
| 3 | `cosmos_conversational_search` | **yes** | high, but gated |
| 4 | `cosmos_board_followers` | no | medium |

Plus one change that is **not** a new tool: give the existing `cosmos_explore` a
`category` argument. See §5.

---

## 1. `cosmos_element_saved_by` — high, public

> Given one element, list the public collections that saved it and the people who
> saved it, ranked by how much traction each has.

**Creative use case.** "Find which boards this Rothko is saved in, so I can open
the boards of people whose taste already overlaps mine and mine them for the rest
of the palette." One good image becomes a door into a dozen curated boards built
by humans who liked the same thing — a far stronger signal than any embedding.
`similarElementsV2` gives you more images that *look* alike;
this gives you people who *think* alike.

**Proven document** (EXEC, HTTP 200):

```graphql
query CosmosMcpElementSavedBy($elementId: ElementId!, $pageSize: Int, $pageCursor: String) {
  elementTopConnections(elementId: $elementId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items {
      clusterId
      userId
      createdAt
      cluster { ...ClusterCore }
    }
    meta { count nextPageCursor }
  }
  elementTopUsers(elementId: $elementId, meta: { pageSize: $pageSize }) {
    items {
      id
      username
      fullName
      avatarUrl
      isPremium
      isVerifiedProfile
      publicElementsCluster { id numberOfElements }
    }
    meta { count nextPageCursor }
  }
}
```

Real response for `elementId: 1670769520` (`pageSize: 2`), trimmed:

```json
{
  "elementTopConnections": {
    "items": [
      { "clusterId": 132730937, "userId": 5010042, "createdAt": "2023-08-21T22:50:57.017352Z",
        "cluster": { "id": 132730937, "name": "Art", "slug": "art", "isFeatured": true,
                     "numberOfElements": 269, "parentClusterId": null,
                     "owner": { "username": "ryanbelk" } } },
      { "clusterId": 1386712980, "userId": 5010042, "createdAt": "2026-08-02T15:32:23.082586Z",
        "cluster": { "id": 1386712980, "name": "Painting", "slug": "painting",
                     "numberOfElements": 161, "parentClusterId": 132730937,
                     "owner": { "username": "ryanbelk" } } }
    ],
    "meta": { "count": 91, "nextPageCursor": "eyJ2MSI6MTE5MCwidjIiOjE2MSwi…" }
  },
  "elementTopUsers": {
    "items": [
      { "id": 5010042, "username": "ryanbelk", "fullName": "Ryan Belk", "isPremium": true,
        "publicElementsCluster": { "id": 83835374, "numberOfElements": 5162 } },
      { "id": 754229811, "username": "mbell", "fullName": "Meredith Bell", "isPremium": true,
        "publicElementsCluster": { "id": 410788410, "numberOfElements": 2708 } }
    ],
    "meta": { "count": 74, "nextPageCursor": "eyJ2MSI6NTUsInYyIjo2NTI0fQ==" }
  }
}
```

**Auth required: no.** Both roots execute anonymously and return real data. The
web app passes `userId` and an `isFollowed(followerId:)` selection; both are
optional and only add viewer context. Ordering is server-side "top", so the first
page is the useful one.

**Why high.** It is the only primitive on the whole API that walks *outward from
an image to people*. Nothing in `browse.ts` does this: `cosmos_get_element`
already fetches `elementTopConnections { meta { count } }` for a popularity
number but throws the items away, so the expensive half of the call is already
being made and discarded. Every returned `clusterId` feeds straight into
`cosmos_list_cluster_elements`, and every `username` into `cosmos_get_user` —
it slots into the existing tool graph with no new concepts.

**Implementation notes.**
- `cluster` on a `Connection` is a full `Cluster`, so `CLUSTER_CORE` spreads
  directly. Confirmed: the probe used the exact `ClusterCore` field list from
  `src/graphql/fragments.ts` and it validated.
- Reuse `normalizeCluster` and `normalizeUser`; `normalizePage` handles both
  `meta { count nextPageCursor }` blocks unchanged.
- Response size: two lists at `pageSize` each. `ClusterCore` is ~15 fields, so 20
  connections plus 20 users is roughly 12 KB. Default the page to 10 — the
  ranking means item 40 is not worth the tokens.
- `cosmos_get_element` should keep its cheap `count` selection; do not merge the
  two tools, or every element lookup pays for the full graph.
- Same-owner boards repeat (`ryanbelk` appears twice above, once for a parent and
  once for its subcluster). Worth deduping by `userId` in the summary line, or at
  least surfacing `parentClusterId` so the agent sees the nesting.

---

## 2. `cosmos_browse_boards` — high, public

> Browse Cosmos' editorially curated collections, optionally narrowed to one
> category, each with a three-image preview.

**Creative use case.** "Show me the interiors boards Cosmos' own editors have
made, so I can pull a whole coherent direction — 'Rooms Lit Only by Lamps',
'Kitchens at Closing Time' — instead of assembling one from 40 loose search
results." These are hand-titled, hand-sequenced boards of 40–60 images; a
designer can hand one to a client as-is.

**Proven documents** (both EXEC, HTTP 200):

```graphql
query CosmosMcpFeaturedClusters($pageSize: Int, $pageCursor: String) {
  featuredClusters(meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items {
      ...ClusterCore
      categories { id name slug }
      topElements(elementCount: 3) {
        __typename
        id
        shareUrl
        ... on MediaElementTile { media { url width height } }
      }
    }
    meta { count nextPageCursor }
  }
}

query CosmosMcpCategoryClusters($categoryId: CategoryId!, $pageSize: Int, $pageCursor: String) {
  categoryClusters(categoryId: $categoryId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items {
      ...ClusterCore
      categories { id name slug }
      topElements(elementCount: 3) {
        __typename
        id
        shareUrl
        ... on MediaElementTile { media { url width height } }
      }
    }
    meta { count nextPageCursor }
  }
}
```

Real response, `featuredClusters(meta: { pageSize: 2 })` — 823 boards total:

```json
{ "items": [
    { "id": 203569485, "name": "Cloud Cover", "slug": "cloud-cover",
      "numberOfElements": 53, "owner": { "username": "sequencebycosmos" },
      "categories": null,
      "topElements": [
        { "id": 1543567476, "shareUrl": "https://www.cosmos.so/e/1543567476",
          "media": { "url": "https://cdn.cosmos.so/e1f74aee-…", "width": 2560, "height": 1708 } }
      ] },
    { "id": 1579555147, "name": "Rooms Lit Only by Lamps", "description": "Evening forever.",
      "numberOfElements": 58, "owner": { "username": "spaces" },
      "categories": [ { "name": "Interiors" } ] }
  ],
  "meta": { "count": 823, "nextPageCursor": "eyJ2MSI6LTYwOH0=" } }
```

Real response, `categoryClusters(categoryId: 1464776492)` — Interiors, 63 boards:
`"Kitchens at Closing Time"` (46 elements, `"Every party ends in the kitchen."`),
`"A Love Letter to Walnut"` (55 elements). Both owned by `spaces`.

**Auth required: no.**

**Why high.** `cosmos_explore` covers featured *elements*; nothing covers featured
*boards*, and boards are the unit a moodboarder actually works in. The editorial
titles are themselves a vocabulary a language model can reason about — "Rooms Lit
Only by Lamps" is a brief, not a tag. 823 boards is a real corpus, and
`categoryClusters` slices it by the 18 categories `cosmos_categories` already
returns. This is the single biggest gap in the current browse surface.

**Implementation notes.**
- One tool, not two: `category` optional. Absent → `featuredClusters`; present →
  look up the slug in `categories` and call `categoryClusters`. `categoryClusters`
  takes `categoryId: CategoryId!` only — `categorySlug` is **ABSENT**
  (`Unknown argument 'categorySlug'`), so the slug must be resolved first. Cache
  the category list; it is 18 items and effectively static.
- `topElements(elementCount:)` is on `Cluster` and works publicly (EXEC). It
  returns a bare list, **not** a paged connection — no `items`/`meta` wrapper, so
  `normalizePage` does not apply. Map it with `normalizeElement` directly.
- Keep `elementCount` at 3–4. `ELEMENT_CORE` is heavy; 20 boards × 4 elements is
  the whole budget. If size bites, select only `id`/`shareUrl`/`media{url,width,height}`
  for the preview rather than spreading `ElementCore`.
- `categories` is `null` on some featured boards (see "Cloud Cover") — normalise
  to `[]`.
- Both roots accept `meta` only; `zzzArg` probes returned `Unknown argument` on
  each, so there is no ordering or filter argument to expose.
- `categoryClusters`' `nextPageCursor` is a plain offset (`"3"`), while
  `featuredClusters`' is base64 JSON. Pass both through opaquely; do not parse.

---

## 3. `cosmos_conversational_search` — high value, auth required

> Search Cosmos with a natural-language brief and get back both a flat result set
> and several named visual *directions*, each with its own images.

**Creative use case.** "Here's the brief — 'warm minimalist Japanese interiors,
but not sterile' — give me three or four distinct directions I can present, each
with its own images and a name I can put on the slide." This is the only endpoint
on the API that returns *grouped, labelled* results rather than a flat ranking,
which is exactly the shape of a moodboard pitch.

**Proven document** (VALID-BUT-AUTH — validated cleanly, only `AUTHENTICATION`):

```graphql
query CosmosMcpConversationalSearch($messages: [ConversationalMessageInput!]!) {
  conversationalSearch(input: { messages: $messages }) {
    results {
      __typename
      id
      shareUrl
      generatedCaption { text }
    }
    directions {
      keyword
      results {
        __typename
        id
        shareUrl
      }
    }
  }
}
```

Variables:

```json
{ "messages": [ { "role": "user", "content": "warm minimalist japanese interiors" } ] }
```

Schema recovered by probe:

```graphql
input ConversationalSearchInput { messages: [ConversationalMessageInput!]! }   # REQ — no other field exists
input ConversationalMessageInput { role: String!, content: String! }           # REQ — both required

type ConversationalSearchResult {
  results: [ElementTile!]!                       # SCALAR_LEAFS error named the type exactly
  directions: [ConversationalDirectionResult]
}
type ConversationalDirectionResult {
  keyword: …                                      # name confirmed; type UNVERIFIED
  results: [ElementTile!]!
}
```

`ConversationalSearchInput` accepts nothing but `messages`: `query`, `searchTerm`,
`prompt`, `message`, `text`, `userId`, `conversationId`, `sessionId`, `history`,
`imageUrl`, `elementIds`, `filters`, `meta`, `searchOrigin`, `threadId`,
`previousQuery`, `context`, `ownerOrgId`, `isPublic`, `limit`, `pageSize`,
`directionCount`, `resultCount`, `seed`, `model`, `locale` all returned
`Unknown field`. `ConversationalMessageInput` accepts nothing but `role` and
`content` (`text`, `message`, `query`, `author`, `type`, `elementIds`, `imageUrl`
all `Unknown field`). Neither `results` nor `directions` takes an argument
(`Unknown argument 'zzzArg'`), so there is no paging and no way to ask for more
directions.

**Auth required: yes.** HTTP 401. Because `messages` carries prior turns, an
agent can refine across calls by appending to the array — but only signed in.

**Why high, with a caveat.** The `directions` shape is unique on this API and maps
one-to-one onto what an art director asks for. The caveat is honest: it is
auth-gated, the actual payload has never been executed, and `keyword`'s type is
unverified (probing it as an object failed, so it is most likely `String`, but
that is inference, not proof). Ship it, but ship it knowing the first real
response may need the normalizer adjusting.

**Implementation notes.**
- Sibling root `conversationalSearchElements(ids: [ElementId!]!): [ElementTile]`
  exists (VALID-BUT-AUTH) — a batch element hydrator. If `results` turns out to
  carry thin tiles, this is the follow-up call. It is not worth its own tool.
- `results` and `directions` are both `[ElementTile!]`, so `ELEMENT_CORE` spreads
  onto both and `normalizeElement` applies unchanged.
- Response size is the real risk: an unbounded `results` plus N directions each
  with their own unbounded `results`, and no page-size argument anywhere. Select
  a *reduced* element shape here rather than full `ELEMENT_CORE`, and truncate
  client-side. Consider returning direction keywords plus the first ~6 elements
  each, with a note telling the agent to call `cosmos_get_element` for detail.
- Take the user's brief as a single string and wrap it as
  `[{ role: "user", content: brief }]`; expose the raw `messages` array only if a
  multi-turn refine tool is wanted later.

---

## 4. `cosmos_board_followers` — medium, public

> List the people following a public collection.

**Creative use case.** "1,991 people follow this ceramics board — show me who, so
I can follow the three most prolific and get their finds in my feed."

**Proven document** (EXEC, HTTP 200):

```graphql
query CosmosMcpClusterFollowers($clusterId: ClusterId!, $pageSize: Int, $pageCursor: String) {
  clusterFollowers(clusterId: $clusterId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items { id username fullName avatarUrl isVerifiedProfile }
    meta { count nextPageCursor }
  }
}
```

Real response for `clusterId: 132730937`: `count: 1991`, items
`alexandru7 / Alexandru Marinescu`, `nicole333 / Nicole Lima`,
`niliarezaee / Niliarezaee`.

**Auth required: no.** `clusterFollowers` also accepts `userId: UserId` and
`searchTerm: String` (per `schema-discovery.md` §4; **UNVERIFIED** here — I did not
probe those two arguments).

**Why only medium.** It answers a real question and it is public, but the ordering
looks arbitrary rather than by influence, so the first page is a random slice of
1,991 people — much weaker than `elementTopUsers`, which is explicitly ranked. If
the tool list has to stay tight, this is the one to cut: idea 1 already gets an
agent to interesting people, by a better route.

---

## 5. Not a new tool: add `category` to `cosmos_explore`

`cosmos_explore` currently wraps `featuredElements` only. `categoryElements` is
public and paged, so the same tool can serve category browsing with one optional
argument — no second tool, no extra choice for the agent to get wrong.

**Proven document** (EXEC, HTTP 200):

```graphql
query CosmosMcpCategoryElements($categoryId: CategoryId!, $pageSize: Int, $pageCursor: String) {
  categoryElements(categoryId: $categoryId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items { ...ElementCore }
    meta { count nextPageCursor }
  }
}
```

`categoryId: 1464776492` (Interiors) returns `count: 21940`, with captions like
*"Digital rendering of the Warsaw No. 1 apartment project by interior architect
Julia Anna Bimer."* Art (`414204306`) returns 12,748.

Same slug-to-id resolution as §2. The cursor is a URL-shaped string
(`cursor://clusters/categories?category_id=14&last=2&count=12748`) — pass it
through opaquely.

---

## Considered and rejected

**Colour beyond what already exists — the lead is closed.** `searchElements`'
filter object accepts exactly two fields. A single literal batch of 25 candidates
returned `Unknown field` for every one of `colors`, `colorHex`, `hexColor`,
`palette`, `dominantColor`, `contentTypes`, `orientation`, `aspectRatio`,
`categoryId`, `categoryIds`, `tag`, `tags`, `isPublicDomain`, `aiGenerated`,
`notSafeForWork`, `minWidth`, `source`, `brand`, `priceMin`, `priceMax`,
`currency`; only `color: String` and `contentType: ElementContentTypeFilter`
survived. There is no palette data on the media either: `colors`, `palette`,
`dominantColor`, `averageColor`, `colorPalette`, `hexColors`, `primaryColor` are
all ABSENT on `Media`, and `colors`/`palette`/`dominantColor` are ABSENT on
`ElementTile`. `blurHash` is the only colour-adjacent field that exists, and it is
already in `MEDIA_CORE` — an agent that wants a palette should decode the blurHash
or read the image, not call the API. Filtering an existing board by colour is
impossible: `clusterConnections` takes **no** `filters` argument at all
(`Unknown argument 'filters'`), `clusterElements`' filter object rejects `color`,
and `similarElementsV2` takes no `filters` either. Colour support is exactly what
`cosmos_search` already exposes.

**A dedicated subcluster tool.** `cluster { subClusters { items … } }` works
publicly and nests (probed to two levels on cluster 132730937), but
`CLUSTER_SELECTION` in `src/tools/browse.ts` *already* selects
`subClusters { items { id name slug numberOfElements } meta { count } }`. A
`cosmos_get_subclusters` tool would duplicate `cosmos_get_cluster`. If deeper
trees matter, add a `depth` argument there instead.

**Are.na import (`arenaChannels`).** VALID-BUT-AUTH — HTTP 401 even though the
Are.na username is public data. Worse, the write side needs
`externalAccountIdentifier`, whose origin is still unknown
(`schema-discovery.md` §9.11). A read-only channel lister that needs a Cosmos
session but cannot then import is not worth a tool slot. Revisit if the OAuth
identifier is ever recovered.

**`forYouUserConfiguration`.** Auth-gated, and the payload is feed-health
telemetry — `isFeedPrepared`, `mitigationStatus`, `cursorAction`,
`currentForYouVersion`. `selectedTopicClusters` returns bare ids with no names.
Nothing a designer would ask for.

**Similarity by cluster ("more boards like this one"). Does not exist.**
`similarClusters`, `relatedClusters`, `trendingClusters`, `recommendedClusters`
were already ruled out in `schema-discovery.md` §8, and I confirmed the last
plausible home: `ClusterRecommendations` has **no** `clusters`, `clustersV2`,
`users` or `similarClusters` field. It carries element lists only —
`elements: SearchElementList` and `elementsV2: ElementTileList`, which
`cosmos_cluster_recommendations` already uses. The nearest substitute is idea 1:
take a board's best element, ask which other boards saved it.

**A shop-specific tool.** `Shop` (returned by `userShop`) rejected `elements`,
`products`, `items`, `brands`, `feed`, and a full a–u single-letter sweep produced
no "did you mean" hits, so its field set is still unknown and probably not
element-shaped. Meanwhile `cosmos_search` already takes `contentType: PRODUCT`,
and `ELEMENT_CORE` already selects `productPrice`, `productBrand`, `productTitle`,
`productDescription`. Shopping is covered; there is nothing left to add.

**`autocompleteSuggestions`.** Public and it works — `search(searchTerm:
"brutalist")` returns `brutalist architecture`, `brutalist design`, `brutalist
graphic design`. But it is a *prefix* completer: `"sage green kitchen"` returned
an empty list. It only helps when the agent has typed half a word, which is not
how an agent searches. It also sits inside `SearchResult`, which the concurrent
cross-entity search work already touches — better folded in there as an extra
selection than shipped alone.

**`reflect`.** VALID-BUT-AUTH, and `ReflectGroup.summary` returns `ReflectSummary`
(the only guess of six that landed). A year-in-review recap, not a research tool.

**Cluster export (`exportCluster` / `clusterExports`).** Auth-gated write flow with
an async job to poll, and `user.markExportTermsAccepted` suggests a terms gate in
front of it. Real work for a rare need.

---

## Probed and confirmed absent — do not re-probe

**Visual / reverse-image search does not exist**, despite
`s3PostPolicyForVisualSearch` hinting otherwise. All thirteen candidates are
ABSENT on `Query`: `visualSearch`, `searchByImage`, `imageSearch`,
`visualSearchElements`, `searchElementsByImage`, `similarElementsByImage`,
`elementsByImage`, `searchVisual`, `reverseImageSearch`, `searchImage`,
`visualSimilarElements`, `searchElementsByImageUrl`, `similarElementsByUrl`. The
S3 policy presumably feeds a non-GraphQL path or an unshipped feature.

**`ExploreQueryGroup`** — only `featuredSpotlights` and `featuredElements` were
ever suggested by the server's "did you mean". ABSENT: `categories`, `category`,
`elements`, `clusters`, `shop`, `featured`, `trending`, `topics`, `feed`,
`spotlight`, `element`, `cluster`, `topic`, `featuredClusters`,
`featuredProfiles`, `shopElements`, `products`, `categoryElements`, `sections`,
`tabs`, `exploreElements`, `shopFeed`, `shops`, `curatedClusters`,
`popularClusters`, `newClusters`. The `/explore/<slug>` routes in the HAR are
client-side routing over `categoryElements` / `categoryClusters`, not a server
group. A full a–z single-letter sweep produced no suggestions — edit distance is
too large for the suggester, so that trick does not work for name discovery.

**`Shop`** — ABSENT: `elements`, `products`, `items`, `brands`, `feed`, plus an
a–u single-letter sweep.

**`Searches`** — confirmed present: `savedSearches`, `trendingSearches`,
`adminSavedSearches` (leaked by a suggestion). ABSENT: `suggestedSearches`,
`recentSearches`.

**`ConversationalSearchResult`** — ABSENT: `items`, `elements`, `elementIds`,
`message`, `text`, `response`, `answer`, `meta`, `conversationId`, `query`,
`searchTerm`, `suggestions`, `zzzA`, `zzzB`. Only `results` and `directions`.

**`ConversationalDirectionResult`** — ABSENT: `title`, `name`, `label`, `text`,
`description`, `query`, `searchTerm`, `prompt`, `elements`, `thumbnail`, `id`,
`slug`, `caption`, `summary`, `keywords`, `theme`, `angle`, `reason`,
`rationale`, `explanation`, `image`, `media`, `cover`, `count`, `elementIds`,
`tiles`, `preview`, `direction`, `titles`, `element`, `names`, `queries`. Only
`keyword` and `results`.

**Other roots** — `conversationalSearchClusters`, `conversationalSearchHistory`,
`conversation`, `category` (singular) are ABSENT on `Query`.

**Arguments** — `featuredClusters`, `categoryClusters`, `clusterConnections` and
`elementTopConnections` reject any argument beyond the documented ones
(`Unknown argument 'zzzArg'`). `clusterElements` has no `order` or `searchTerm`.
`similarElementsV2` and `clusterConnections` have no `filters`.
`categoryElements` has no `categorySlug`. `featuredProfiles` has no `meta`.
`elementConnections` has no `elementId`.

**Auth-gated (VALID-BUT-AUTH), so real but unusable signed out** — `arenaChannels`,
`topicClusters`, `clusterSuggestions`, `reflect`, `conversationalSearch`,
`conversationalSearchElements`, `elementConnections`.

**Public but empty at time of probing** — `featuredProfiles` (`count: 0`) and
`latestElements` (empty `items`). Both are dead ends today; neither is worth a
tool unless Cosmos starts populating them.
