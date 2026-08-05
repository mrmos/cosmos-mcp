/**
 * Which tools need a credential, in one place.
 *
 * `cosmos_whoami` reports these lists so an agent can plan before it starts
 * calling things. They used to live in `account.ts`, duplicating knowledge that
 * belongs to `browse.ts` and `curate.ts` — when a tool was renamed or its auth
 * requirement changed, whoami quietly lied. Keeping the lists here does not make
 * the coupling disappear, but it gives it one obvious home, and
 * `test/catalog.test.ts` asserts these names match what the server registers.
 */

/** Read-only tools that return real data with no credential configured. */
export const SIGNED_OUT_TOOLS = [
  "cosmos_whoami",
  "cosmos_search",
  "cosmos_search_clusters",
  "cosmos_search_users",
  "cosmos_search_all",
  "cosmos_explore",
  "cosmos_similar_elements",
  "cosmos_view_images",
  "cosmos_get_element",
  "cosmos_element_saved_by",
  "cosmos_browse_boards",
  "cosmos_get_cluster",
  "cosmos_get_user",
  "cosmos_list_cluster_elements",
  "cosmos_list_user_clusters",
  "cosmos_categories",
  "cosmos_spotlights",
  "cosmos_suggested_searches",
] as const;

/**
 * Tools that fail with an `unauthenticated` error until a credential is set.
 *
 * `cosmos_cluster_recommendations` belongs here despite reading nothing
 * personal: `clusterRecommendations` rejects anonymous callers outright.
 * `cosmos_list_user_clusters` is deliberately absent — it degrades to a partial
 * public list rather than failing, so it stays usable signed out.
 */
export const SIGNED_IN_ONLY_TOOLS = [
  "cosmos_cluster_recommendations",
  "cosmos_conversational_search",
  "cosmos_list_my_clusters",
  "cosmos_create_cluster",
  "cosmos_save_elements",
  "cosmos_organize_elements",
  "cosmos_find_clusters_for_element",
  "cosmos_my_library",
  "cosmos_following_feed",
  "cosmos_activity",
  "cosmos_quick_connect_suggestion",
  "cosmos_save_url",
  "cosmos_update_cluster",
  "cosmos_delete_cluster",
  "cosmos_nest_cluster",
  "cosmos_follow_cluster",
  "cosmos_follow_user",
  "cosmos_pin_cluster",
] as const;

/**
 * Tools whose results improve once signed in, but which still work without a
 * credential. Worth calling out so an agent does not treat a thin result as
 * the whole truth.
 */
export const BETTER_SIGNED_IN = [
  "cosmos_list_user_clusters",
  "cosmos_suggested_searches",
] as const;
