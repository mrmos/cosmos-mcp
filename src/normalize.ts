/**
 * Converts Cosmos GraphQL payloads into the compact shapes tools return.
 *
 * Two goals: keep responses small enough that an agent can hold a 40-item board
 * in context, and give every item a stable `url` a human can click.
 */

export interface NormalizedMedia {
  kind: "image" | "animated" | "video" | "unknown";
  id: string | null;
  url: string | null;
  /** CDN-resized preview, cheap to fetch and safe to hand to a vision model. */
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  nsfw: boolean;
  aiGenerated: boolean;
  /** Video only. */
  durationSeconds?: number | null;
  playbackUrl?: string | null;
}

export interface NormalizedElement {
  id: number;
  type: "media" | "product" | "unknown";
  /** Permalink on cosmos.so. */
  url: string;
  /** Cosmos' own generated description, with its `<n>` entity markers stripped. */
  caption: string | null;
  owner: { id: number; username: string | null };
  createdAt: string | null;
  isFeatured: boolean;
  /** Where the element was originally scraped from, when known. */
  source: { url: string | null; author: string | null; isPublicDomain: boolean } | null;
  media: NormalizedMedia | null;
  /** Populated only for carousel elements. */
  additionalMedia?: NormalizedMedia[];
  product?: { title: string | null; brand: string | null; description: string | null; price: string | null };
}

export interface NormalizedCluster {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  url: string | null;
  isPrivate: boolean;
  isFeatured: boolean;
  owner: { id: number; username: string | null };
  parentClusterId: number | null;
  elementCount: number | null;
  coverUrl: string | null;
}

export interface NormalizedUser {
  id: number;
  username: string;
  fullName: string | null;
  bio: string | null;
  url: string;
  avatarUrl: string | null;
  websiteUrl: string | null;
  isPremium: boolean;
  socialLinks?: Record<string, string> | null;
}

const SITE = "https://www.cosmos.so";

/**
 * Builds a resized CDN URL. cdn.cosmos.so accepts `format`, `w` and an optional
 * `rect` crop; a 400px webp is roughly 20 KB against 120 KB for the original.
 */
export function cdnPreview(url: string | null | undefined, width = 400, format = "webp"): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== "cdn.cosmos.so") return url;
    u.searchParams.set("format", format);
    u.searchParams.set("w", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** Cosmos wraps recognised entities in `<n>…</n>`; readers want the plain text. */
export function stripCaptionMarkup(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text.replace(/<\/?n>/g, "").trim();
  return plain === "" ? null : plain;
}

function mediaKind(typename: string | undefined): NormalizedMedia["kind"] {
  switch (typename) {
    case "StaticImage":
      return "image";
    case "AnimatedImage":
      return "animated";
    case "Video":
      return "video";
    default:
      return "unknown";
  }
}

export function normalizeMedia(m: any, previewWidth = 400): NormalizedMedia | null {
  if (!m) return null;
  const kind = mediaKind(m.__typename);
  const width = m.width ?? null;
  const height = m.height ?? null;
  const base = kind === "video" ? (m.thumbnail?.url ?? m.url ?? null) : (m.url ?? null);
  return {
    kind,
    id: m.mediaId ?? null,
    url: m.url ?? null,
    thumbnailUrl: cdnPreview(base, previewWidth),
    width,
    height,
    aspectRatio: width && height ? Number((width / height).toFixed(3)) : null,
    nsfw: m.notSafeForWorkStatus != null && m.notSafeForWorkStatus !== "SAFE",
    aiGenerated: Boolean(m.aiGenerated),
    ...(kind === "video"
      ? { durationSeconds: m.duration ?? null, playbackUrl: m.mux?.playbackUrl ?? m.mux?.mp4Url ?? null }
      : kind === "animated"
        ? { playbackUrl: m.video?.url ?? null }
        : {}),
  };
}

function formatPrice(p: any): string | null {
  if (!p || p.value == null) return null;
  return p.currency ? `${p.value} ${p.currency}` : String(p.value);
}

export function normalizeElement(e: any, previewWidth = 400): NormalizedElement | null {
  if (!e?.id) return null;
  const isProduct = e.__typename === "ProductElementTile";
  const extra = Array.isArray(e.multipleMedia)
    ? e.multipleMedia.map((m: any) => normalizeMedia(m, previewWidth)).filter(Boolean)
    : [];

  return {
    id: e.id,
    type: isProduct ? "product" : e.__typename === "MediaElementTile" ? "media" : "unknown",
    url: e.shareUrl ?? `${SITE}/e/${e.id}`,
    caption: stripCaptionMarkup(e.generatedCaption?.text),
    owner: { id: e.ownerId, username: e.owner?.username ?? null },
    createdAt: e.createdAt ?? null,
    isFeatured: Boolean(e.isFeatured),
    source: e.source
      ? {
          url: e.source.url ?? null,
          author: e.source.author?.username ?? e.source.author?.fullName ?? null,
          isPublicDomain: Boolean(e.source.isPublicDomain),
        }
      : null,
    media: normalizeMedia(e.media, previewWidth),
    ...(extra.length > 0 ? { additionalMedia: extra as NormalizedMedia[] } : {}),
    ...(isProduct
      ? {
          product: {
            title: e.productTitle ?? null,
            brand: e.productBrand ?? null,
            description: e.productDescription ?? null,
            price: formatPrice(e.productPrice),
          },
        }
      : {}),
  };
}

export function normalizeCluster(c: any, previewWidth = 400): NormalizedCluster | null {
  if (!c?.id) return null;
  const username = c.owner?.username ?? null;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug ?? null,
    description: c.description ?? null,
    url: username && c.slug ? `${SITE}/${username}/${c.slug}` : null,
    isPrivate: Boolean(c.isPrivate),
    isFeatured: Boolean(c.isFeatured),
    owner: { id: c.ownerId, username },
    parentClusterId: c.parentClusterId ?? null,
    elementCount: c.numberOfElements ?? null,
    coverUrl: cdnPreview(c.cover?.url ?? c.coverImageUrl, previewWidth),
  };
}

export function normalizeUser(u: any, previewWidth = 200): NormalizedUser | null {
  if (!u?.id) return null;
  const links = u.socialLinks
    ? Object.fromEntries(
        Object.entries(u.socialLinks).filter(([k, v]) => k !== "__typename" && typeof v === "string" && v !== ""),
      )
    : null;
  const fullName = typeof u.fullName === "string" ? u.fullName.trim() : null;
  return {
    id: u.id,
    username: u.username,
    fullName: fullName || null,
    bio: u.bio ?? null,
    url: `${SITE}/${u.username}`,
    avatarUrl: cdnPreview(u.avatarUrl, previewWidth),
    websiteUrl: u.websiteUrl ?? null,
    isPremium: Boolean(u.isPremium),
    ...(links && Object.keys(links).length > 0 ? { socialLinks: links as Record<string, string> } : {}),
  };
}

/** Shared pagination envelope. `nextCursor` is passed straight back as `cursor`. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  totalCount: number | null;
}

export function normalizePage<T>(
  connection: any,
  map: (node: any) => T | null,
): Page<T> {
  const rawItems: any[] = connection?.items ?? [];
  return {
    items: rawItems.map(map).filter((x): x is T => x !== null),
    nextCursor: connection?.meta?.nextPageCursor ?? null,
    totalCount: connection?.meta?.count ?? null,
  };
}
