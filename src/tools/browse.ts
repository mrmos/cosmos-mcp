/**
 * Read-only discovery: search, feeds, element/cluster/user lookups, and an
 * image renderer for vision-capable agents.
 *
 * Every document here was run against api.cosmos.so. The two that need a
 * session (`clusterRecommendations`, `userClusters`) were checked the same way:
 * Cosmos reports field errors alongside the auth error, so a response carrying
 * only `AUTHENTICATION` proves the document is well formed.
 *
 * Fragment note: `ELEMENT_CORE` already appends `MEDIA_CORE`, so a document
 * that spreads `MediaCore` must interpolate `ELEMENT_CORE` and nothing else —
 * adding `MEDIA_CORE` again is a duplicate-fragment error.
 */

import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CosmosError } from "../errors";
import type { CosmosClient } from "../graphql/client";
import { CLUSTER_CORE, ELEMENT_CORE, MEDIA_CORE, USER_CORE } from "../graphql/fragments";
import {
  cdnPreview,
  normalizeCluster,
  normalizeElement,
  normalizeMedia,
  normalizePage,
  normalizeUser,
  type NormalizedCluster,
  type NormalizedElement,
  type NormalizedUser,
  type Page,
} from "../normalize";
import {
  DEFAULT_LIMIT,
  DEFAULT_PREVIEW_WIDTH,
  cursorArg,
  guard,
  limitArg,
  ok,
  optionalViewerId,
  previewWidthArg,
  resolveUserId,
  type ToolRegistrar,
} from "./kit";

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const SEARCH_ELEMENTS = /* GraphQL */ `
  query CosmosMcpSearchElements(
    $searchTerm: String!
    $contentType: ElementContentTypeFilter
    $color: String
    $order: ElementOrder
    $pageCursor: String
    $pageSize: Int
  ) {
    searchElements(
      filters: { color: $color, contentType: $contentType }
      order: $order
      searchTerm: $searchTerm
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

/**
 * `searchClusters` returns real `Cluster` nodes — owner and all — so ClusterCore
 * spreads onto it unchanged. `filters.isPrivate` is accepted but was observed to
 * change nothing (identical count and ordering for true, false and null), so it
 * is not exposed as a tool argument; `filters.userId` is, even though Cosmos
 * answers it with HTTP 403 for signed-out callers.
 */
const SEARCH_CLUSTERS = /* GraphQL */ `
  query CosmosMcpSearchClusters($searchTerm: String!, $userId: UserId, $pageCursor: String, $pageSize: Int) {
    searchClusters(
      searchTerm: $searchTerm
      filters: { userId: $userId }
      meta: { pageSize: $pageSize, pageCursor: $pageCursor }
    ) {
      items {
        ...ClusterCore
        followersCount
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${CLUSTER_CORE}
`;

/**
 * `SearchUser` is not `UserPublicProfile`: it has no `fullName`, `bio`,
 * `websiteUrl` or `socialLinks`, and its display name is `name`. Aliasing
 * `name` back to `fullName` is enough for `normalizeUser` to read it, which
 * keeps people the same shape here as in cosmos_get_user.
 */
const SEARCH_USER_SELECTION = /* GraphQL */ `
  id
  username
  fullName: name
  avatarUrl
  isPremium
  isVerifiedProfile
`;

/** There is no `searchUsers` root; `search { users }` is the only way to find people. */
const SEARCH_USERS = /* GraphQL */ `
  query CosmosMcpSearchUsers($searchTerm: String!, $pageCursor: String, $pageSize: Int) {
    search(searchTerm: $searchTerm) {
      users(meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
        items {
          ${SEARCH_USER_SELECTION}
        }
        meta {
          nextPageCursor
          count
        }
      }
    }
  }
`;

/**
 * The cross-entity root. Three quirks, all confirmed live:
 *
 * 1. `search().clusters` yields `SearchCluster`, a different type from
 *    `searchClusters().items`. It has `ownerId` but no `owner`, no
 *    `description`, and spells the size `elementsCount`. Aliasing it to
 *    `numberOfElements` lets `normalizeCluster` read it; `url` still comes back
 *    null, because building one needs the owner's username.
 * 2. `search().elements` ignores `meta.pageSize` — it returned all 448 matches
 *    for "brutalist" whatever was asked for — so the argument is omitted and the
 *    list is cut client-side.
 * 3. `autocompleteSuggestions` is a list type, not a list of strings, so it
 *    needs the `items { searchTerm }` sub-selection.
 */
const SEARCH_ALL = /* GraphQL */ `
  query CosmosMcpSearchAll($searchTerm: String!, $pageSize: Int) {
    search(searchTerm: $searchTerm) {
      clusters(meta: { pageSize: $pageSize }) {
        items {
          id
          name
          slug
          isPrivate
          isFeatured
          ownerId
          numberOfElements: elementsCount
          collaboratorsCount
          coverImageUrl
          cover {
            url
            width
            height
          }
        }
        meta {
          nextPageCursor
          count
        }
      }
      users(meta: { pageSize: $pageSize }) {
        items {
          ${SEARCH_USER_SELECTION}
        }
        meta {
          nextPageCursor
          count
        }
      }
      elements {
        items {
          id
          ownerId
          isFeatured
          sourceUrl
          generatedCaption {
            text
          }
        }
        meta {
          count
        }
      }
      autocompleteSuggestions {
        items {
          searchTerm
        }
        meta {
          count
        }
      }
    }
  }
`;

const ELEMENT_DETAILS = /* GraphQL */ `
  query CosmosMcpElementDetails($elementId: ElementId!, $userId: UserId!, $isLoggedIn: Boolean!) {
    elementView(elementId: $elementId) {
      __typename
      element {
        ...ElementCore
        userContext(userId: $userId) @include(if: $isLoggedIn) {
          isDisliked
          isPublicElement
          connections {
            meta {
              count
            }
          }
        }
      }
      ... on MultiMediaElementView {
        media {
          ...MediaCore
        }
      }
      ... on OembedElementView {
        html
      }
    }
    elementTopConnections(elementId: $elementId) {
      meta {
        count
      }
    }
  }
  ${ELEMENT_CORE}
`;

const SIMILAR_ELEMENTS = /* GraphQL */ `
  query CosmosMcpSimilarElements($elementIds: [ElementId!]!, $pageCursor: String, $pageSize: Int) {
    similarElementsV2(elementIds: $elementIds, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
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

/**
 * Who saved one element, and where.
 *
 * `elementTopConnections` is also selected by ELEMENT_DETAILS, but only for
 * `meta { count }` — cosmos_get_element pays for a popularity number and nothing
 * else. The two selections share no text worth extracting, and merging them
 * would make every element lookup fetch the whole cluster graph, so they stay
 * apart deliberately.
 *
 * `elementTopUsers` is ranked, not paged alongside the connections: its first
 * page is the useful one. `@include` drops it once the caller starts paging the
 * cluster list, rather than resending the same ten people each time.
 */
const ELEMENT_SAVED_BY = /* GraphQL */ `
  query CosmosMcpElementSavedBy(
    $elementId: ElementId!
    $pageSize: Int
    $pageCursor: String
    $includeSavers: Boolean!
  ) {
    elementTopConnections(elementId: $elementId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
      items {
        clusterId
        userId
        createdAt
        cluster {
          ...ClusterCore
        }
      }
      meta {
        nextPageCursor
        count
      }
    }
    elementTopUsers(elementId: $elementId, meta: { pageSize: $pageSize }) @include(if: $includeSavers) {
      items {
        id
        username
        fullName
        avatarUrl
        isPremium
        isVerifiedProfile
        publicElementsCluster {
          id
          numberOfElements
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

/**
 * A thumbnail-only element. Used where elements are garnish rather than the
 * answer — board previews and conversational directions — because ELEMENT_CORE
 * at twenty boards times three previews would cost more than the boards.
 *
 * `ownerId` and `owner` resolve intermittently under `Cluster.topElements` —
 * live, some elements on a board carry an owner and their neighbours come back
 * null. They are selected anyway: normalizeElement reads a missing owner as
 * null, so a partial answer costs nothing and is better than none.
 */
const ELEMENT_PREVIEW = /* GraphQL */ `
  __typename
  id
  shareUrl
  ownerId
  owner {
    username
  }
  generatedCaption {
    text
  }
  ... on MediaElementTile {
    media {
      ...MediaCore
    }
  }
  ... on ProductElementTile {
    media {
      ...MediaCore
    }
  }
`;

/**
 * Selection shared by the two board roots, so `category` changes only which root
 * answers. `topElements` returns a bare list, not a paged connection, and its
 * `elementCount` argument is `UInt!` — an `Int!` variable is rejected outright.
 */
const BOARD_SELECTION = /* GraphQL */ `
  ...ClusterCore
  categories {
    id
    name
    slug
  }
  topElements(elementCount: $previewCount) {
    ${ELEMENT_PREVIEW}
  }
`;

const FEATURED_CLUSTERS = /* GraphQL */ `
  query CosmosMcpFeaturedClusters($pageSize: Int, $pageCursor: String, $previewCount: UInt!) {
    featuredClusters(meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
      items {
        ${BOARD_SELECTION}
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${CLUSTER_CORE}
  ${MEDIA_CORE}
`;

/** `categoryClusters` takes an id only — there is no `categorySlug` argument. */
const CATEGORY_CLUSTERS = /* GraphQL */ `
  query CosmosMcpCategoryClusters(
    $categoryId: CategoryId!
    $pageSize: Int
    $pageCursor: String
    $previewCount: UInt!
  ) {
    categoryClusters(categoryId: $categoryId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
      items {
        ${BOARD_SELECTION}
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${CLUSTER_CORE}
  ${MEDIA_CORE}
`;

const FEATURED_ELEMENTS = /* GraphQL */ `
  query CosmosMcpFeaturedElements($pageCursor: String, $pageSize: Int) {
    featuredElements(meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
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

/**
 * The category half of cosmos_explore. Same element shape as featuredElements,
 * so both branches of the tool return an identical page. The cursor here is a
 * URL-shaped string rather than base64 JSON; it is passed back opaquely.
 */
const CATEGORY_ELEMENTS = /* GraphQL */ `
  query CosmosMcpCategoryElements($categoryId: CategoryId!, $pageCursor: String, $pageSize: Int) {
    categoryElements(categoryId: $categoryId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
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

/**
 * Natural-language search that answers with named directions as well as a flat
 * list. Signed out this is HTTP 401, so the payload has never been seen; the
 * document itself is validated, including the input object, which was inlined as
 * a literal to force coercion (variables are not coerced before the auth check).
 * `keyword` is `String!` — the server named the type in a SCALAR_LEAFS error.
 *
 * Neither `results` nor `directions` takes an argument, so there is no page size
 * to ask for and no way to request more directions. The tool truncates instead.
 */
const CONVERSATIONAL_SEARCH = /* GraphQL */ `
  query CosmosMcpConversationalSearch($messages: [ConversationalMessageInput!]!) {
    conversationalSearch(input: { messages: $messages }) {
      results {
        ${ELEMENT_PREVIEW}
      }
      directions {
        keyword
        results {
          ${ELEMENT_PREVIEW}
        }
      }
    }
  }
  ${MEDIA_CORE}
`;

const SPOTLIGHTS = /* GraphQL */ `
  query CosmosMcpSpotlights($pageCursor: String, $pageSize: Int) {
    explore {
      featuredSpotlights(meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
        items {
          cluster {
            ...ClusterCore
          }
          user {
            id
            username
            fullName
            avatarUrl
            statistics {
              numberOfFollowers
            }
          }
        }
        meta {
          nextPageCursor
        }
      }
    }
  }
  ${CLUSTER_CORE}
`;

const CATEGORIES = /* GraphQL */ `
  query CosmosMcpCategories {
    categories {
      items {
        id
        name
        slug
      }
    }
  }
`;

const SUGGESTED_SEARCHES = /* GraphQL */ `
  query CosmosMcpSuggestedSearches($searchCategory: String) {
    searches {
      savedSearches(searchCategory: $searchCategory) {
        items {
          searchTerm
          displayName
          searchCategory
          coverImage {
            __typename
            url
            notSafeForWorkStatus
          }
        }
      }
      trendingSearches {
        items {
          searchTerm
          displayName
          searchCategory
          coverImage {
            __typename
            url
            notSafeForWorkStatus
          }
        }
      }
    }
  }
`;

const GET_USER = /* GraphQL */ `
  query CosmosMcpGetUser($username: String!) {
    user(username: $username) {
      ...UserCore
      isVerifiedProfile
      statistics {
        numberOfFollowers
        numberOfFollowing
      }
      topClusters {
        items {
          ...ClusterCore
        }
        meta {
          count
        }
      }
    }
  }
  ${USER_CORE}
  ${CLUSTER_CORE}
`;

/** Selection shared by both cluster lookups, so slug and id return the same shape. */
const CLUSTER_SELECTION = /* GraphQL */ `
  ...ClusterCore
  followersCount
  subClusters {
    items {
      id
      name
      slug
      numberOfElements
    }
    meta {
      count
    }
  }
`;

const CLUSTER_BY_SLUG = /* GraphQL */ `
  query CosmosMcpClusterBySlug($input: ClusterGetInput!) {
    cluster(input: $input) {
      ${CLUSTER_SELECTION}
    }
    clusterConnections(clusterInput: $input) {
      meta {
        count
      }
    }
  }
  ${CLUSTER_CORE}
`;

const CLUSTER_BY_ID = /* GraphQL */ `
  query CosmosMcpClusterById($clusterId: ClusterId!) {
    cluster(id: $clusterId) {
      ${CLUSTER_SELECTION}
    }
    clusterConnections(clusterId: $clusterId) {
      meta {
        count
      }
    }
  }
  ${CLUSTER_CORE}
`;

const CLUSTER_ELEMENTS = /* GraphQL */ `
  query CosmosMcpClusterElements($clusterId: ClusterId, $pageCursor: String, $pageSize: Int) {
    clusterConnections(clusterId: $clusterId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
      items {
        element {
          ...ElementCore
        }
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${ELEMENT_CORE}
`;

const CLUSTER_RECOMMENDATIONS = /* GraphQL */ `
  query CosmosMcpClusterRecommendations($clusterId: ClusterId!) {
    clusterRecommendations(clusterId: $clusterId) {
      elementsV2 {
        items {
          ...ElementCore
        }
        meta {
          nextPageCursor
          count
        }
      }
    }
  }
  ${ELEMENT_CORE}
`;

const USER_CLUSTERS = /* GraphQL */ `
  query CosmosMcpUserClusters($userId: UserId!, $pageCursor: String, $pageSize: Int) {
    userClusters(userId: $userId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
      items {
        ...ClusterCore
      }
      meta {
        nextPageCursor
        count
      }
    }
  }
  ${CLUSTER_CORE}
`;

/** Public fallback: three clusters per profile, no paging, but no sign-in either. */
const USER_TOP_CLUSTERS = /* GraphQL */ `
  query CosmosMcpUserTopClusters($username: String!) {
    user(username: $username) {
      id
      topClusters {
        items {
          ...ClusterCore
        }
        meta {
          count
        }
      }
    }
  }
  ${CLUSTER_CORE}
`;

const ELEMENT_MEDIA = /* GraphQL */ `
  query CosmosMcpElementMedia($elementId: ElementId!) {
    elementView(elementId: $elementId) {
      element {
        ...ElementCore
      }
    }
  }
  ${ELEMENT_CORE}
`;

/** Exported for the live integration tests, which replay each document as written. */
export const browseQueries = Object.freeze({
  CosmosMcpSearchElements: SEARCH_ELEMENTS,
  CosmosMcpSearchClusters: SEARCH_CLUSTERS,
  CosmosMcpSearchUsers: SEARCH_USERS,
  CosmosMcpSearchAll: SEARCH_ALL,
  CosmosMcpElementDetails: ELEMENT_DETAILS,
  CosmosMcpElementSavedBy: ELEMENT_SAVED_BY,
  CosmosMcpSimilarElements: SIMILAR_ELEMENTS,
  CosmosMcpFeaturedElements: FEATURED_ELEMENTS,
  CosmosMcpCategoryElements: CATEGORY_ELEMENTS,
  CosmosMcpFeaturedClusters: FEATURED_CLUSTERS,
  CosmosMcpCategoryClusters: CATEGORY_CLUSTERS,
  CosmosMcpConversationalSearch: CONVERSATIONAL_SEARCH,
  CosmosMcpSpotlights: SPOTLIGHTS,
  CosmosMcpCategories: CATEGORIES,
  CosmosMcpSuggestedSearches: SUGGESTED_SEARCHES,
  CosmosMcpGetUser: GET_USER,
  CosmosMcpClusterBySlug: CLUSTER_BY_SLUG,
  CosmosMcpClusterById: CLUSTER_BY_ID,
  CosmosMcpClusterElements: CLUSTER_ELEMENTS,
  CosmosMcpClusterRecommendations: CLUSTER_RECOMMENDATIONS,
  CosmosMcpUserClusters: USER_CLUSTERS,
  CosmosMcpUserTopClusters: USER_TOP_CLUSTERS,
  CosmosMcpElementMedia: ELEMENT_MEDIA,
});

// ---------------------------------------------------------------------------
// Argument shaping
// ---------------------------------------------------------------------------

export type ContentType = "IMAGE" | "VIDEO" | "PRODUCT" | "ALL";
export type SearchOrder = "RELEVANT" | "RECENT" | "POPULAR" | "OLDEST" | "RANDOM";

/**
 * `ElementOrder` has no `RECENT` member — the live enum is
 * RELEVANT/LATEST/POPULAR/OLDEST/RANDOM. `RECENT` is the name an agent reaches
 * for, so accept it and translate.
 */
const ORDER_ALIASES: Record<SearchOrder, string> = {
  RELEVANT: "RELEVANT",
  RECENT: "LATEST",
  POPULAR: "POPULAR",
  OLDEST: "OLDEST",
  RANDOM: "RANDOM",
};

export interface SearchArgs {
  query: string;
  contentType?: ContentType;
  color?: string;
  order?: SearchOrder;
  cursor?: string;
  limit?: number;
}

/**
 * Builds `searchElements` variables. `contentType: ALL` is dropped rather than
 * sent as null: `ElementContentTypeFilter` has no ALL member, and an absent
 * filter is what "everything" means to the API.
 */
export function buildSearchVariables(args: SearchArgs): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    searchTerm: args.query,
    pageSize: args.limit ?? DEFAULT_LIMIT,
    pageCursor: args.cursor ?? null,
  };
  if (args.contentType && args.contentType !== "ALL") vars.contentType = args.contentType;
  if (args.color) vars.color = normalizeColor(args.color);
  if (args.order) vars.order = ORDER_ALIASES[args.order];
  return vars;
}

/** The API wants a bare hex triplet; agents write `#aabbcc` about half the time. */
function normalizeColor(color: string): string {
  const trimmed = color.trim();
  return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
}

export interface SearchClustersArgs {
  query: string;
  ownerUserId?: number;
  cursor?: string;
  limit?: number;
}

/**
 * Builds `searchClusters` variables. `userId` is always present in the document
 * so the filter object is well formed; null means "no owner filter", which is
 * the only form a signed-out caller may send.
 */
export function buildSearchClustersVariables(args: SearchClustersArgs): Record<string, unknown> {
  return {
    searchTerm: args.query,
    userId: args.ownerUserId ?? null,
    pageSize: args.limit ?? DEFAULT_LIMIT,
    pageCursor: args.cursor ?? null,
  };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export interface NormalizedSpotlight {
  cluster: NormalizedCluster | null;
  /** Null for editorial spotlights, which Cosmos publishes without a curator. */
  curator: { id: number; username: string; fullName: string | null; followers: number | null } | null;
}

export function normalizeSpotlight(item: any, previewWidth = DEFAULT_PREVIEW_WIDTH): NormalizedSpotlight | null {
  const cluster = normalizeCluster(item?.cluster, previewWidth);
  if (!cluster) return null;
  const u = item?.user;
  return {
    cluster,
    curator: u?.id
      ? {
          id: u.id,
          username: u.username,
          fullName: typeof u.fullName === "string" && u.fullName.trim() !== "" ? u.fullName.trim() : null,
          followers: u.statistics?.numberOfFollowers ?? null,
        }
      : null,
  };
}

export interface NormalizedSavedSearch {
  searchTerm: string;
  displayName: string | null;
  category: string | null;
  coverUrl: string | null;
}

export function normalizeSavedSearch(s: any, previewWidth = DEFAULT_PREVIEW_WIDTH): NormalizedSavedSearch | null {
  if (!s?.searchTerm) return null;
  return {
    searchTerm: s.searchTerm,
    displayName: s.displayName ?? null,
    category: s.searchCategory ?? null,
    coverUrl: cdnPreview(s.coverImage?.url, previewWidth),
  };
}

/** A person as `search { users }` knows them: a profile with the extras missing. */
export interface NormalizedSearchUser extends NormalizedUser {
  isVerified: boolean;
}

/**
 * `bio`, `websiteUrl` and `socialLinks` come back null for every search hit —
 * `SearchUser` simply does not carry them. cosmos_get_user fills them in.
 */
export function normalizeSearchUser(u: any, previewWidth = 200): NormalizedSearchUser | null {
  const user = normalizeUser(u, previewWidth);
  if (!user) return null;
  return { ...user, isVerified: Boolean(u.isVerifiedProfile) };
}

/**
 * `SearchElement` has no media of any kind — no `media`, no `thumbnailUrl`, no
 * dimensions — so every element here comes back with `media: null`. It does
 * carry `sourceUrl`, which `normalizeElement` reads from a `source` object that
 * `SearchElement` lacks, hence the patch.
 */
export function normalizeSearchElement(e: any): NormalizedElement | null {
  const element = normalizeElement(e);
  if (!element) return null;
  return {
    ...element,
    source: e.sourceUrl ? { url: e.sourceUrl, author: null, isPublicDomain: false } : null,
  };
}

/** A collection that saved an element, with the moment and the person who did it. */
export interface NormalizedSavedByCluster extends NormalizedCluster {
  savedAt: string | null;
  savedByUserId: number | null;
}

/**
 * `Connection.cluster` is a full `Cluster`, so ClusterCore spreads onto it and
 * normalizeCluster reads it unchanged. `parentClusterId` survives on purpose:
 * one owner often appears twice, once for a board and once for its subboard, and
 * the nesting is the only way to tell that apart from two independent saves.
 */
export function normalizeSavedByCluster(
  node: any,
  previewWidth = DEFAULT_PREVIEW_WIDTH,
): NormalizedSavedByCluster | null {
  const cluster = normalizeCluster(node?.cluster, previewWidth);
  if (!cluster) return null;
  return { ...cluster, savedAt: node.createdAt ?? null, savedByUserId: node.userId ?? null };
}

/** A person who saved an element, ranked by Cosmos rather than by recency. */
export interface NormalizedSaver extends NormalizedUser {
  isVerified: boolean;
  /** Size of their public "everything" board — a rough measure of how prolific they are. */
  publicElementCount: number | null;
}

export function normalizeSaver(u: any, previewWidth = 200): NormalizedSaver | null {
  const user = normalizeUser(u, previewWidth);
  if (!user) return null;
  return {
    ...user,
    isVerified: Boolean(u.isVerifiedProfile),
    publicElementCount: u.publicElementsCluster?.numberOfElements ?? null,
  };
}

/** An editorial board plus the handful of images that show what is in it. */
export interface NormalizedBoard extends NormalizedCluster {
  categories: { id: number; name: string; slug: string | null }[];
  preview: NormalizedElement[];
}

/**
 * `categories` is null on plenty of featured boards, and `topElements` is a bare
 * list rather than a paged connection — normalizePage does not apply to it.
 */
export function normalizeBoard(c: any, previewWidth = DEFAULT_PREVIEW_WIDTH): NormalizedBoard | null {
  const cluster = normalizeCluster(c, previewWidth);
  if (!cluster) return null;
  const categories = (Array.isArray(c.categories) ? c.categories : [])
    .filter((cat: any) => cat?.id != null)
    .map((cat: any) => ({ id: cat.id, name: cat.name, slug: cat.slug ?? null }));
  const preview = (Array.isArray(c.topElements) ? c.topElements : [])
    .map((e: any) => normalizeElement(e, previewWidth))
    .filter((e: NormalizedElement | null): e is NormalizedElement => e !== null);
  return { ...cluster, categories, preview };
}

/** One named visual direction from conversationalSearch. */
export interface NormalizedDirection {
  keyword: string | null;
  items: NormalizedElement[];
}

export interface NormalizedConversationalSearch {
  items: NormalizedElement[];
  directions: NormalizedDirection[];
  /** Anything the payload did that the schema did not lead us to expect. */
  warnings: string[];
}

/**
 * Reads a `ConversationalSearchResult` without trusting it.
 *
 * This payload has never been executed — it is auth-gated, and the schema was
 * recovered from validation errors rather than from a response. So every access
 * degrades instead of throwing: a missing half still returns the other half, and
 * whatever was unexpected is named in `warnings` so the caller can see why a
 * result looks thin.
 */
export function normalizeConversationalSearch(
  payload: any,
  opts: { previewWidth?: number; limit?: number; perDirection?: number } = {},
): NormalizedConversationalSearch {
  const previewWidth = opts.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
  const warnings: string[] = [];

  const elements = (raw: any, cap: number, where: string): NormalizedElement[] => {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
      warnings.push(`${where} was ${typeof raw}, not a list; ignored.`);
      return [];
    }
    return raw
      .slice(0, cap)
      .map((e: any) => normalizeElement(e, previewWidth))
      .filter((e): e is NormalizedElement => e !== null);
  };

  if (!payload || typeof payload !== "object") {
    return { items: [], directions: [], warnings: ["conversationalSearch returned no result object."] };
  }

  const items = elements(payload.results, opts.limit ?? 12, "results");

  const directions: NormalizedDirection[] = [];
  const rawDirections = payload.directions;
  if (rawDirections != null && !Array.isArray(rawDirections)) {
    warnings.push(`directions was ${typeof rawDirections}, not a list; ignored.`);
  } else {
    for (const d of (rawDirections ?? []) as any[]) {
      if (!d || typeof d !== "object") continue;
      let keyword: string | null = null;
      if (typeof d.keyword === "string") {
        keyword = d.keyword.trim() || null;
      } else if (d.keyword != null) {
        warnings.push(`A direction's keyword was ${typeof d.keyword}, not a string; dropped.`);
      }
      const dItems = elements(d.results, opts.perDirection ?? 6, "a direction's results");
      if (keyword === null && dItems.length === 0) continue;
      directions.push({ keyword, items: dItems });
    }
  }

  if (items.length === 0 && directions.length === 0) {
    warnings.push("The response carried neither results nor directions.");
  }
  return { items, directions, warnings };
}

/**
 * Merges several single-seed similarity pages into one ranked list.
 *
 * `similarElementsV2` rejects more than one seed id, so multi-seed requests fan
 * out and are interleaved round-robin: each seed contributes its best match
 * before any seed contributes its second. Seeds themselves are dropped, as are
 * duplicates across seeds.
 */
export function interleaveSimilar(
  pages: NormalizedElement[][],
  seedIds: number[],
  limit: number,
): NormalizedElement[] {
  const seen = new Set<number>(seedIds);
  const merged: NormalizedElement[] = [];
  const depth = Math.max(0, ...pages.map((p) => p.length));
  for (let i = 0; i < depth && merged.length < limit; i++) {
    for (const page of pages) {
      if (merged.length >= limit) break;
      const item = page[i];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

const elementIdArg = z.number().int().positive();

/**
 * Cosmos takes a numeric category id and has no `categorySlug` argument
 * anywhere, so the slug from a URL has to be resolved through cosmos_categories
 * first. Saying so here is what stops an agent guessing.
 */
const categoryArg = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(
    "Numeric category id, as returned by cosmos_categories — call that first. Slugs are not accepted. " +
      "Omit to browse everything.",
  );

/** Shared paging plumbing: `pageSize`/`pageCursor` is what every list root takes. */
function pageVars(cursor: string | undefined, limit: number | undefined): Record<string, unknown> {
  return { pageSize: limit ?? DEFAULT_LIMIT, pageCursor: cursor ?? null };
}

function elementPage(connection: any, previewWidth: number): Page<NormalizedElement> {
  return normalizePage(connection, (n) => normalizeElement(n, previewWidth));
}

/** One similarity page for one seed. Kept separate so multi-seed calls can fan out. */
async function similarForSeed(
  client: CosmosClient,
  elementId: number,
  cursor: string | undefined,
  limit: number,
  previewWidth: number,
): Promise<Page<NormalizedElement>> {
  const data = await client.request<{ similarElementsV2: any }>("CosmosMcpSimilarElements", SIMILAR_ELEMENTS, {
    elementIds: [elementId],
    ...pageVars(cursor, limit),
  });
  return elementPage(data.similarElementsV2, previewWidth);
}

export const registerBrowseTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;

  server.registerTool(
    "cosmos_search",
    {
      title: "Search Cosmos",
      description:
        "Full-text search across every public element on cosmos.so. This is the entry point when " +
        "you have words for what you want ('brutalist stairwell', 'risograph poster', 'sage green kitchen'). " +
        "Cosmos indexes generated captions as well as source pages, so descriptive phrases beat single nouns. " +
        "Filter by `contentType` when you specifically need video or shoppable products, and by `color` " +
        "(hex) when the brief is led by palette. Once a result looks right, feed its id to " +
        "cosmos_similar_elements — that finds far more of the same look than rephrasing the query will.",
      inputSchema: {
        query: z.string().min(1).describe("Search phrase. Descriptive phrases work better than single words."),
        contentType: z
          .enum(["IMAGE", "VIDEO", "PRODUCT", "ALL"])
          .optional()
          .describe("Restrict to one medium. ALL (the default) applies no filter."),
        color: z
          .string()
          .optional()
          .describe("Dominant colour as hex, with or without the leading '#', e.g. '#8B4513'."),
        order: z
          .enum(["RELEVANT", "RECENT", "POPULAR", "OLDEST", "RANDOM"])
          .optional()
          .describe("Result ordering. Defaults to RELEVANT."),
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: SearchArgs & { previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ searchElements: any }>(
        "CosmosMcpSearchElements",
        SEARCH_ELEMENTS,
        buildSearchVariables(args),
      );
      const page = elementPage(data.searchElements, previewWidth);
      return ok(`${page.items.length} result(s) for ${JSON.stringify(args.query)} of ${page.totalCount ?? "?"} total.`, page);
    }),
  );

  server.registerTool(
    "cosmos_search_clusters",
    {
      title: "Search collections",
      description:
        "Full-text search across public collections (boards) on cosmos.so. This is a major moodboarding " +
        "tool: finding an existing, well-curated board on your subject beats assembling one image by " +
        "image, because someone has already done the editing. Search the mood or the subject " +
        "('brutalist', 'wabi sabi interiors', 'risograph'), read `elementCount` and `followers` to spot " +
        "the boards worth trusting, then call cosmos_list_cluster_elements on the id to pull the images. " +
        "cosmos_search finds single images; this finds whole directions.",
      inputSchema: {
        query: z.string().min(1).describe("Search phrase, matched against collection names."),
        ownerUserId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Restrict to one owner's collections. Cosmos rejects this filter for signed-out callers, " +
              "so it needs COSMOS_COOKIE; omit it for a site-wide search.",
          ),
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: SearchClustersArgs & { previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ searchClusters: any }>(
        "CosmosMcpSearchClusters",
        SEARCH_CLUSTERS,
        buildSearchClustersVariables(args),
      );
      const page = normalizePage(data.searchClusters, (c) => {
        const cluster = normalizeCluster(c, previewWidth);
        return cluster ? { ...cluster, followers: c.followersCount ?? null } : null;
      });
      return ok(
        `${page.items.length} collection(s) for ${JSON.stringify(args.query)} of ${page.totalCount ?? "?"} total.`,
        page,
      );
    }),
  );

  server.registerTool(
    "cosmos_search_users",
    {
      title: "Search people",
      description:
        "Finds cosmos.so profiles by name or handle. Use it when a brief names a person or studio, or " +
        "when you want to mine a curator's taste and only have their name. Cosmos matches handles and " +
        "display names, not bios, so a partial handle works better than a description. Follow a hit with " +
        "cosmos_get_user for the bio and links, or cosmos_list_user_clusters for their boards. Search " +
        "results carry no bio or website — those fields are simply absent from this index.",
      inputSchema: {
        query: z.string().min(1).describe("Name or handle to look for."),
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { query: string; cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = Math.min(args.previewWidth ?? DEFAULT_PREVIEW_WIDTH, 200);
      const data = await client.request<{ search: any }>("CosmosMcpSearchUsers", SEARCH_USERS, {
        searchTerm: args.query,
        ...pageVars(args.cursor, args.limit),
      });
      const page = normalizePage(data.search?.users, (u) => normalizeSearchUser(u, previewWidth));
      return ok(
        `${page.items.length} profile(s) for ${JSON.stringify(args.query)} of ${page.totalCount ?? "?"} total.`,
        page,
      );
    }),
  );

  server.registerTool(
    "cosmos_search_all",
    {
      title: "Search everything at once",
      description:
        "One search across collections, people and elements, plus the phrases Cosmos would autocomplete " +
        "your term to. Reach for it as a first move when you do not yet know what a term is — 'kettal' " +
        "could be a brand, a person or a board, and this tells you which in one call. Deliberately " +
        "shallow: a handful of hits per section, cluster URLs and element thumbnails omitted. Once you " +
        "know which kind of thing you are after, switch to cosmos_search_clusters, cosmos_search_users or " +
        "cosmos_search, which return full records and page properly.",
      inputSchema: {
        query: z.string().min(1).describe("Term to look up across every entity type."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Hits per section (1-10). Defaults to 5, which keeps the whole response small."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { query: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const limit = args.limit ?? 5;
      const data = await client.request<{ search: any }>("CosmosMcpSearchAll", SEARCH_ALL, {
        searchTerm: args.query,
        pageSize: limit,
      });
      const result = data.search ?? {};

      // Every section reports `nextCursor: null`: this tool takes no cursor, and
      // whether the cross-entity cursors are interchangeable with the dedicated
      // roots' has not been established. Paging belongs to the dedicated tools.
      const section = <T>(page: Page<T>, cut = false) => ({
        items: cut ? page.items.slice(0, limit) : page.items,
        nextCursor: null,
        totalCount: page.totalCount,
      });

      const clusters = normalizePage(result.clusters, (c) => normalizeCluster(c, previewWidth));
      const users = normalizePage(result.users, (u) => normalizeSearchUser(u, Math.min(previewWidth, 200)));
      // The server ignores pageSize here and returns the whole match set.
      const allElements = normalizePage(result.elements, normalizeSearchElement);
      const elementTotal = allElements.totalCount ?? allElements.items.length;
      const suggestions = ((result.autocompleteSuggestions?.items ?? []) as any[])
        .map((s) => s?.searchTerm)
        .filter((s): s is string => typeof s === "string" && s !== "");

      return ok(
        `${JSON.stringify(args.query)}: ${clusters.totalCount ?? "?"} collection(s), ` +
          `${users.totalCount ?? "?"} profile(s), ${elementTotal} element(s).`,
        {
          clusters: section(clusters),
          users: section(users),
          elements: { ...section(allElements, true), totalCount: elementTotal },
          suggestions,
          note:
            "A shallow cross-entity sample. Collections here carry no url or description and elements " +
            "carry no media — use cosmos_search_clusters, cosmos_search_users or cosmos_search for full, " +
            "pageable results.",
        },
      );
    }),
  );

  server.registerTool(
    "cosmos_get_element",
    {
      title: "Get element detail",
      description:
        "Everything Cosmos knows about one element: media, generated caption, original source URL and " +
        "author, and how many collections have saved it (a rough popularity signal). Use it after search " +
        "or a feed when you need provenance or the full-resolution media URL for a single image, rather " +
        "than re-listing a page. For judging how something actually looks, use cosmos_view_images instead.",
      inputSchema: {
        elementId: elementIdArg.describe("Numeric element id, as returned by any listing tool."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { elementId: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const viewerId = await optionalViewerId(client);
      const data = await client.request<{ elementView: any; elementTopConnections: any }>(
        "CosmosMcpElementDetails",
        ELEMENT_DETAILS,
        { elementId: args.elementId, userId: viewerId ?? 0, isLoggedIn: viewerId !== null },
      );
      const view = data.elementView;
      const element = normalizeElement(view?.element, previewWidth);
      if (!element) {
        throw new CosmosError(`No cosmos.so element with id ${args.elementId}`, {
          kind: "not_found",
          operation: "CosmosMcpElementDetails",
        });
      }
      const extraMedia = Array.isArray(view.media)
        ? view.media.map((m: any) => normalizeMedia(m, previewWidth)).filter(Boolean)
        : [];
      const ctxNode = view.element?.userContext;
      return ok(`Element ${element.id}${element.caption ? `: ${element.caption}` : ""}`, {
        element,
        viewType: view.__typename ?? null,
        savedToClusters: data.elementTopConnections?.meta?.count ?? null,
        ...(extraMedia.length > 0 ? { extraMedia } : {}),
        ...(view.html ? { embedHtml: view.html } : {}),
        ...(ctxNode
          ? {
              viewerContext: {
                savedByViewer: (ctxNode.connections?.meta?.count ?? 0) > 0,
                isDisliked: Boolean(ctxNode.isDisliked),
              },
            }
          : {}),
      });
    }),
  );

  server.registerTool(
    "cosmos_similar_elements",
    {
      title: "Find visually similar elements",
      description:
        "THE core moodboarding tool. Give it one element you like and it returns visually similar ones — " +
        "Cosmos matches on look (composition, palette, texture, subject), not on words, so it surfaces " +
        "material that no search phrase would reach. The reliable workflow is: cosmos_search or " +
        "cosmos_explore once to find a single image that nails the direction, then expand it here, then " +
        "expand the best result from that. Pass several ids to blend directions: each seed is queried " +
        "separately and the results are interleaved, so every seed is represented near the top.",
      inputSchema: {
        elementIds: z
          .array(elementIdArg)
          .min(1)
          .max(5)
          .describe(
            "One to five seed element ids. Cosmos only accepts a single seed per request, so multiple " +
              "ids fan out into parallel queries whose results are interleaved.",
          ),
        cursor: z
          .string()
          .optional()
          .describe("Cursor from a previous call. Only meaningful when exactly one seed id is given."),
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { elementIds: number[]; cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const limit = args.limit ?? DEFAULT_LIMIT;
      const seeds = [...new Set(args.elementIds)];

      if (seeds.length === 1) {
        const page = await similarForSeed(client, seeds[0]!, args.cursor, limit, previewWidth);
        return ok(`${page.items.length} element(s) visually similar to ${seeds[0]}.`, page);
      }

      const pages = await Promise.all(
        seeds.map((id) => similarForSeed(client, id, undefined, limit, previewWidth)),
      );
      const items = interleaveSimilar(
        pages.map((p) => p.items),
        seeds,
        limit,
      );
      return ok(`${items.length} element(s) blended from ${seeds.length} seeds.`, {
        items,
        nextCursor: null,
        totalCount: null,
        note: "Multi-seed results are interleaved from separate queries; paging needs a single seed id.",
      });
    }),
  );

  server.registerTool(
    "cosmos_element_saved_by",
    {
      title: "Who saved this element",
      description:
        "Walks outward from one image to the people who liked it. Returns the public collections that " +
        "saved this element and, ranked by Cosmos, the people who saved it. This is the strongest taste " +
        "signal on the site: cosmos_similar_elements finds images that LOOK alike, this finds humans who " +
        "THINK alike. Start from one image that nails the brief, read which boards it lives in, then mine " +
        "those boards with cosmos_list_cluster_elements and those people with cosmos_get_user — you " +
        "inherit the rest of their palette, curated by hand rather than by embedding. Ordering is " +
        "server-side, so the first page is the one worth reading. The same owner often appears twice, " +
        "once for a board and once for its subboard; `parentClusterId` tells them apart.",
      inputSchema: {
        elementId: elementIdArg.describe("Numeric element id, as returned by any listing tool."),
        cursor: z
          .string()
          .optional()
          .describe(
            "Cursor from a previous call, paging the collections. The people list is ranked rather than " +
              "paged and is returned on the first page only.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Items per list (1-50). Defaults to 10, because two lists come back."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { elementId: number; cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const includeSavers = !args.cursor;
      const data = await client.request<{ elementTopConnections: any; elementTopUsers?: any }>(
        "CosmosMcpElementSavedBy",
        ELEMENT_SAVED_BY,
        { elementId: args.elementId, ...pageVars(args.cursor, args.limit ?? 10), includeSavers },
      );
      const clusters = normalizePage(data.elementTopConnections, (n) => normalizeSavedByCluster(n, previewWidth));
      const savers = normalizePage(data.elementTopUsers, (u) => normalizeSaver(u, Math.min(previewWidth, 200)));
      const distinctOwners = new Set(clusters.items.map((c) => c.savedByUserId).filter((id) => id !== null)).size;
      return ok(
        `Element ${args.elementId} is saved in ${clusters.totalCount ?? "?"} collection(s) by ` +
          `${savers.totalCount ?? "?"} person(s); showing ${clusters.items.length} collection(s) from ` +
          `${distinctOwners} owner(s).`,
        {
          clusters,
          savers: includeSavers
            ? savers
            : { items: [], nextCursor: null, totalCount: null, note: "People are only returned on the first page." },
        },
      );
    }),
  );

  server.registerTool(
    "cosmos_conversational_search",
    {
      title: "Search by brief (experimental)",
      description:
        "Hands Cosmos a natural-language brief and gets back both a flat result set and several named " +
        "visual DIRECTIONS, each with its own images. It is the only endpoint here that returns grouped, " +
        "labelled results, which is the exact shape of a moodboard pitch: 'warm minimalist Japanese " +
        "interiors, but not sterile' comes back as three or four distinct angles you can put on separate " +
        "slides. EXPERIMENTAL: this response has never been observed — it is gated behind a session, so " +
        "only the query was verified, not the payload. Treat a thin or oddly shaped result as the tool's " +
        "fault, check `warnings`, and fall back to cosmos_search. Requires COSMOS_COOKIE.",
      inputSchema: {
        brief: z
          .string()
          .min(1)
          .describe("The brief in plain language. Full sentences work better here than keywords."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Cap on the flat result list (1-30). Defaults to 12; the API offers no page size."),
        perDirection: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Cap on the images kept per direction (1-20). Defaults to 6."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { brief: string; limit?: number; perDirection?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      await client.requireViewer("cosmos_conversational_search");
      const data = await client.request<{ conversationalSearch: any }>(
        "CosmosMcpConversationalSearch",
        CONVERSATIONAL_SEARCH,
        { messages: [{ role: "user", content: args.brief }] },
      );
      const result = normalizeConversationalSearch(data.conversationalSearch, {
        previewWidth,
        limit: args.limit,
        perDirection: args.perDirection,
      });
      const named = result.directions.map((d) => d.keyword).filter((k): k is string => k !== null);
      return ok(
        `${result.items.length} result(s) and ${result.directions.length} direction(s) for ` +
          `${JSON.stringify(args.brief)}${named.length > 0 ? `: ${named.join(", ")}` : ""}.`,
        {
          ...result,
          note:
            "Elements here are previews. Call cosmos_get_element for provenance, or " +
            "cosmos_similar_elements on any id to expand a direction.",
        },
      );
    }),
  );

  server.registerTool(
    "cosmos_explore",
    {
      title: "Explore featured elements",
      description:
        "Cosmos' editorially featured feed — a broad, high-quality cross-section of the site. Reach for " +
        "it when you have no brief yet, when a search came back thin, or when you want a seed image to " +
        "hand to cosmos_similar_elements. Results are not personalised and change slowly, so paging " +
        "through gives genuinely new material. Pass `category` to browse one subject area instead " +
        "(Interiors alone runs to ~22,000 elements), which is a better first move than a broad search " +
        "when the brief names a discipline rather than a thing.",
      inputSchema: {
        category: categoryArg,
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { category?: number; cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      if (args.category) {
        const data = await client.request<{ categoryElements: any }>(
          "CosmosMcpCategoryElements",
          CATEGORY_ELEMENTS,
          { categoryId: args.category, ...pageVars(args.cursor, args.limit) },
        );
        const page = elementPage(data.categoryElements, previewWidth);
        return ok(
          `${page.items.length} element(s) in category ${args.category} of ${page.totalCount ?? "?"} total.`,
          page,
        );
      }
      const data = await client.request<{ featuredElements: any }>(
        "CosmosMcpFeaturedElements",
        FEATURED_ELEMENTS,
        pageVars(args.cursor, args.limit),
      );
      const page = elementPage(data.featuredElements, previewWidth);
      return ok(`${page.items.length} featured element(s).`, page);
    }),
  );

  server.registerTool(
    "cosmos_browse_boards",
    {
      title: "Browse curated boards",
      description:
        "Cosmos' own editorial collections — around 823 hand-titled, hand-sequenced boards like 'Rooms " +
        "Lit Only by Lamps' or 'Kitchens at Closing Time', each 40-60 images deep. This is the fastest " +
        "route from a mood to a finished direction: the titles are briefs in themselves, and one board " +
        "can be handed to a client as-is, where forty loose search results cannot. Each result carries a " +
        "few preview images so you can judge it without a second call; when one fits, pass its id to " +
        "cosmos_list_cluster_elements for the rest. Pass `category` to narrow to one subject area — call " +
        "cosmos_categories first, it returns the numeric ids this argument takes.",
      inputSchema: {
        category: categoryArg,
        previewCount: z
          .number()
          .int()
          .min(0)
          .max(6)
          .optional()
          .describe("Preview images per board (0-6). Defaults to 3; raise it only for a short list."),
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(
      async (args: {
        category?: number;
        previewCount?: number;
        cursor?: string;
        limit?: number;
        previewWidth?: number;
      }) => {
        const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
        const previewCount = args.previewCount ?? 3;
        const vars = { ...pageVars(args.cursor, args.limit), previewCount };
        const data = args.category
          ? await client.request<{ categoryClusters: any }>("CosmosMcpCategoryClusters", CATEGORY_CLUSTERS, {
              categoryId: args.category,
              ...vars,
            })
          : await client.request<{ featuredClusters: any }>("CosmosMcpFeaturedClusters", FEATURED_CLUSTERS, vars);
        const list = args.category ? (data as any).categoryClusters : (data as any).featuredClusters;
        const page = normalizePage(list, (c) => normalizeBoard(c, previewWidth));
        return ok(
          `${page.items.length} curated board(s)` +
            (args.category ? ` in category ${args.category}` : "") +
            ` of ${page.totalCount ?? "?"} total.`,
          page,
        );
      },
    ),
  );

  server.registerTool(
    "cosmos_spotlights",
    {
      title: "List curated spotlights",
      description:
        "Cosmos' hand-picked collections — tightly themed boards like 'Rooms Lit Only by Lamps'. Each " +
        "one is a ready-made reference set with a strong point of view, so this is the fastest way to " +
        "borrow a coherent aesthetic: pick a spotlight, then call cosmos_list_cluster_elements on its id " +
        "to pull the images. Better than search when the brief is a mood rather than a subject.",
      inputSchema: { cursor: cursorArg, limit: limitArg, previewWidth: previewWidthArg },
      annotations: READ_ONLY,
    },
    guard(async (args: { cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ explore: any }>(
        "CosmosMcpSpotlights",
        SPOTLIGHTS,
        pageVars(args.cursor, args.limit),
      );
      const list = data.explore?.featuredSpotlights;
      const items = ((list?.items ?? []) as any[])
        .map((i) => normalizeSpotlight(i, previewWidth))
        .filter((s): s is NormalizedSpotlight => s !== null);
      return ok(`${items.length} spotlight(s).`, {
        items,
        nextCursor: list?.meta?.nextPageCursor ?? null,
        totalCount: null,
      });
    }),
  );

  server.registerTool(
    "cosmos_categories",
    {
      title: "List explore categories",
      description:
        "The seventeen top-level subject areas Cosmos organises the site by (Fashion, Interiors, " +
        "Typography, Architecture, Cinema…). Call this first when you need to know what the site covers " +
        "before committing to a search phrase. Each `slug` doubles as the `category` argument to " +
        "cosmos_suggested_searches and works well as a `query` for cosmos_search.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    guard(async () => {
      const data = await client.request<{ categories: any }>("CosmosMcpCategories", CATEGORIES, {});
      const items = ((data.categories?.items ?? []) as any[]).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      }));
      return ok(`${items.length} category(ies).`, { items });
    }),
  );

  server.registerTool(
    "cosmos_suggested_searches",
    {
      title: "List suggested searches",
      description:
        "Search phrases Cosmos itself promotes: what is trending site-wide, plus any searches the " +
        "signed-in viewer has saved. Useful when you need a direction rather than an answer — the " +
        "phrasing here matches how the index is captioned, so these terms tend to search well. Trending " +
        "results are often empty for signed-out sessions; cosmos_categories and cosmos_spotlights are " +
        "the dependable alternatives.",
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe("Restrict saved searches to one category slug, as returned by cosmos_categories."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { category?: string; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ searches: any }>("CosmosMcpSuggestedSearches", SUGGESTED_SEARCHES, {
        searchCategory: args.category ?? null,
      });
      const map = (list: any) =>
        ((list?.items ?? []) as any[])
          .map((s) => normalizeSavedSearch(s, previewWidth))
          .filter((s): s is NormalizedSavedSearch => s !== null);
      const trending = map(data.searches?.trendingSearches);
      const saved = map(data.searches?.savedSearches);
      return ok(`${trending.length} trending and ${saved.length} saved search(es).`, { trending, saved });
    }),
  );

  server.registerTool(
    "cosmos_get_user",
    {
      title: "Get a public profile",
      description:
        "Public profile for a cosmos.so username: bio, links, follower counts and the three collections " +
        "the profile leads with. Use it to size up a curator whose taste you want to mine — if the top " +
        "collections look right, follow up with cosmos_list_user_clusters or " +
        "cosmos_list_cluster_elements. Works signed out.",
      inputSchema: {
        username: z.string().min(1).describe("Profile handle, without the @ and without the site URL."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { username: string; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ user: any }>("CosmosMcpGetUser", GET_USER, {
        username: args.username,
      });
      const user = normalizeUser(data.user, Math.min(previewWidth, 200));
      if (!user) {
        throw new CosmosError(`No cosmos.so user named ${JSON.stringify(args.username)}`, {
          kind: "not_found",
          operation: "CosmosMcpGetUser",
        });
      }
      const topClusters = ((data.user.topClusters?.items ?? []) as any[])
        .map((c) => normalizeCluster(c, previewWidth))
        .filter((c): c is NormalizedCluster => c !== null);
      return ok(`@${user.username}${user.fullName ? ` (${user.fullName})` : ""}`, {
        user: {
          ...user,
          isVerified: Boolean(data.user.isVerifiedProfile),
          followers: data.user.statistics?.numberOfFollowers ?? null,
          following: data.user.statistics?.numberOfFollowing ?? null,
        },
        topClusters,
        clusterCount: data.user.topClusters?.meta?.count ?? null,
      });
    }),
  );

  server.registerTool(
    "cosmos_get_cluster",
    {
      title: "Get a cluster",
      description:
        "Metadata for one collection: name, description, owner, size, cover and any subclusters. " +
        "Identify it either by clusterId or by the pair (username, slug) — a cosmos.so URL like " +
        "cosmos.so/spaces/rooms-lit-only-by-lamps gives you both. Call this before " +
        "cosmos_list_cluster_elements when you want to know how big a board is before paging it.",
      inputSchema: {
        clusterId: z.number().int().positive().optional().describe("Numeric cluster id. Use this or username+slug."),
        username: z.string().optional().describe("Owner's handle, from the cluster URL."),
        slug: z.string().optional().describe("Cluster slug, the last path segment of the cluster URL."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { clusterId?: number; username?: string; slug?: string; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const bySlug = Boolean(args.username && args.slug);
      if (!bySlug && !args.clusterId) {
        throw new CosmosError("Pass either clusterId, or both username and slug.", {
          kind: "validation",
          operation: "cosmos_get_cluster",
        });
      }
      const data = bySlug
        ? await client.request<{ cluster: any; clusterConnections: any }>(
            "CosmosMcpClusterBySlug",
            CLUSTER_BY_SLUG,
            { input: { ownerUsername: args.username, slug: args.slug } },
          )
        : await client.request<{ cluster: any; clusterConnections: any }>("CosmosMcpClusterById", CLUSTER_BY_ID, {
            clusterId: args.clusterId,
          });

      const cluster = normalizeCluster(data.cluster, previewWidth);
      if (!cluster) {
        throw new CosmosError(
          bySlug ? `No cluster ${args.username}/${args.slug}` : `No cluster with id ${args.clusterId}`,
          { kind: "not_found", operation: "cosmos_get_cluster" },
        );
      }
      const subClusters = ((data.cluster.subClusters?.items ?? []) as any[]).map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug ?? null,
        elementCount: s.numberOfElements ?? null,
      }));
      return ok(`Cluster ${cluster.id} "${cluster.name}" (${cluster.elementCount ?? "?"} elements).`, {
        cluster: {
          ...cluster,
          followers: data.cluster.followersCount ?? null,
          connectionCount: data.clusterConnections?.meta?.count ?? null,
        },
        subClusters,
      });
    }),
  );

  server.registerTool(
    "cosmos_list_cluster_elements",
    {
      title: "List elements in a cluster",
      description:
        "Pages through the elements saved in a collection, newest first. This is how you actually read a " +
        "moodboard someone else built — pair it with cosmos_spotlights or cosmos_get_user to find boards " +
        "worth reading. Public clusters work signed out; private ones need COSMOS_COOKIE.",
      inputSchema: {
        clusterId: z.number().int().positive().describe("Numeric cluster id, from cosmos_get_cluster or a listing."),
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { clusterId: number; cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ clusterConnections: any }>("CosmosMcpClusterElements", CLUSTER_ELEMENTS, {
        clusterId: args.clusterId,
        ...pageVars(args.cursor, args.limit),
      });
      const page = normalizePage(data.clusterConnections, (n) => normalizeElement(n?.element, previewWidth));
      return ok(`${page.items.length} element(s) in cluster ${args.clusterId} of ${page.totalCount ?? "?"} total.`, page);
    }),
  );

  server.registerTool(
    "cosmos_cluster_recommendations",
    {
      title: "Recommended elements for a cluster",
      description:
        "Cosmos' own suggestions for what belongs in an existing collection, computed from everything " +
        "already in it. The best way to expand a moodboard once it has a few images: it reads the whole " +
        "board rather than a single seed, so it holds the direction better than cosmos_similar_elements " +
        "on any one image. Requires COSMOS_COOKIE.",
      inputSchema: {
        clusterId: z.number().int().positive().describe("Cluster to get suggestions for."),
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { clusterId: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const data = await client.request<{ clusterRecommendations: any }>(
        "CosmosMcpClusterRecommendations",
        CLUSTER_RECOMMENDATIONS,
        { clusterId: args.clusterId },
      );
      const page = elementPage(data.clusterRecommendations?.elementsV2, previewWidth);
      return ok(`${page.items.length} recommendation(s) for cluster ${args.clusterId}.`, page);
    }),
  );

  server.registerTool(
    "cosmos_list_user_clusters",
    {
      title: "List a user's clusters",
      description:
        "The collections on a profile. Omit `username` to list the signed-in viewer's own boards — that " +
        "is how you find the cluster id to save into. Cosmos gates the full list behind a session; " +
        "without COSMOS_COOKIE a named profile still returns the three collections it leads with, " +
        "flagged as partial.",
      inputSchema: {
        username: z.string().optional().describe("Profile handle. Omit to use the signed-in viewer."),
        userId: z.number().int().positive().optional().describe("Numeric user id, if you already have it."),
        cursor: cursorArg,
        limit: limitArg,
        previewWidth: previewWidthArg,
      },
      annotations: READ_ONLY,
    },
    guard(async (args: { username?: string; userId?: number; cursor?: string; limit?: number; previewWidth?: number }) => {
      const previewWidth = args.previewWidth ?? DEFAULT_PREVIEW_WIDTH;
      const userId = args.userId ?? (await resolveUserId(client, args.username, "CosmosMcpUserClusters"));
      try {
        const data = await client.request<{ userClusters: any }>("CosmosMcpUserClusters", USER_CLUSTERS, {
          userId,
          ...pageVars(args.cursor, args.limit),
        });
        const page = normalizePage(data.userClusters, (c) => normalizeCluster(c, previewWidth));
        return ok(`${page.items.length} cluster(s) of ${page.totalCount ?? "?"} total.`, page);
      } catch (err) {
        if (!(err instanceof CosmosError) || err.kind !== "unauthenticated" || !args.username) throw err;
        const data = await client.request<{ user: any }>("CosmosMcpUserTopClusters", USER_TOP_CLUSTERS, {
          username: args.username,
        });
        const items = ((data.user?.topClusters?.items ?? []) as any[])
          .map((c) => normalizeCluster(c, previewWidth))
          .filter((c): c is NormalizedCluster => c !== null);
        return ok(`${items.length} of @${args.username}'s top cluster(s) (signed out: partial list).`, {
          items,
          nextCursor: null,
          totalCount: data.user?.topClusters?.meta?.count ?? null,
          partial: true,
          note: "Cosmos only exposes a profile's leading collections to signed-out callers. Set COSMOS_COOKIE for the full, pageable list.",
        });
      }
    }),
  );

  server.registerTool(
    "cosmos_view_images",
    {
      title: "View elements as images",
      description:
        "Downloads elements and returns them as actual image blocks, so you can look at them instead of " +
        "reading URLs. Use it to judge whether candidates fit a brief, to compare a shortlist side by " +
        "side, or to describe an image a user linked. Videos come back as their poster frame. This is by " +
        "far the most expensive tool here — pass a shortlist of two to eight ids, not a whole page of " +
        "search results, and keep `width` small unless fine detail matters.",
      inputSchema: {
        elementIds: z.array(elementIdArg).min(1).max(8).describe("Up to eight element ids to render."),
        width: z
          .number()
          .int()
          .min(80)
          .max(1024)
          .optional()
          .describe("Pixel width to fetch each image at (80-1024). Defaults to 400."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args: { elementIds: number[]; width?: number }) => {
      const width = args.width ?? DEFAULT_PREVIEW_WIDTH;
      const ids = [...new Set(args.elementIds)];
      const results = await Promise.all(ids.map((id) => fetchElementImage(client, id, width)));

      const content: CallToolResult["content"] = [];
      const rendered: { elementId: number; url: string; caption: string | null }[] = [];
      const skipped: { elementId: number; reason: string }[] = [];

      for (const r of results) {
        if (r.kind === "error") {
          skipped.push({ elementId: r.elementId, reason: r.reason });
          continue;
        }
        rendered.push({ elementId: r.elementId, url: r.pageUrl, caption: r.caption });
        content.push({
          type: "text",
          text: `Element ${r.elementId} — ${r.pageUrl}${r.caption ? `\n${r.caption}` : ""}${r.isVideo ? "\n(video: poster frame shown)" : ""}`,
        });
        content.push({ type: "image", data: r.data, mimeType: r.mimeType });
      }

      const summary =
        `Rendered ${rendered.length} of ${ids.length} element(s) at ${width}px` +
        (skipped.length > 0 ? `; skipped ${skipped.map((s) => `${s.elementId} (${s.reason})`).join(", ")}` : ".");
      content.unshift({ type: "text", text: summary });

      return { content, structuredContent: { summary, rendered, skipped } };
    }),
  );
};

type ImageResult =
  | {
      kind: "image";
      elementId: number;
      data: string;
      mimeType: string;
      pageUrl: string;
      caption: string | null;
      isVideo: boolean;
    }
  | { kind: "error"; elementId: number; reason: string };

/**
 * Resolves one element to a base64 image block. Never throws: a failure for one
 * id must not lose the images that did come back.
 */
async function fetchElementImage(client: CosmosClient, elementId: number, width: number): Promise<ImageResult> {
  let element: NormalizedElement | null;
  try {
    const data = await client.request<{ elementView: any }>("CosmosMcpElementMedia", ELEMENT_MEDIA, { elementId });
    element = normalizeElement(data.elementView?.element, width);
  } catch (err) {
    // The full auth blurb would be repeated per id and drown the captions; an
    // unknown or private element reads as `unauthenticated` when signed out.
    const reason =
      err instanceof CosmosError ? `lookup failed (${err.kind})` : err instanceof Error ? err.message : String(err);
    return { kind: "error", elementId, reason };
  }
  if (!element?.media?.thumbnailUrl) return { kind: "error", elementId, reason: "no renderable media" };

  try {
    const res = await fetch(element.media.thumbnailUrl, {
      signal: AbortSignal.timeout(client.config.timeoutMs),
    });
    if (!res.ok) return { kind: "error", elementId, reason: `image fetch returned HTTP ${res.status}` };
    const mimeType = (res.headers.get("content-type") ?? "image/webp").split(";")[0]!.trim();
    if (!mimeType.startsWith("image/")) return { kind: "error", elementId, reason: `unexpected type ${mimeType}` };
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return {
      kind: "image",
      elementId,
      data,
      mimeType,
      pageUrl: element.url,
      caption: element.caption,
      isVideo: element.media.kind === "video",
    };
  } catch (err) {
    return { kind: "error", elementId, reason: err instanceof Error ? err.message : String(err) };
  }
}
