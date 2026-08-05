/**
 * Trimmed versions of the fragments cosmos-web sends.
 *
 * The originals pull ~120 fields per element, most of them layout state the web
 * client needs and an agent does not. These keep only what `normalize.ts` reads,
 * which cuts a 40-item search response from roughly 200 KB to 15 KB.
 *
 * The `product*` aliases are deliberate: `price`, `name` and `description` exist
 * on both ProductElementTile and sibling types, and the API rejects the merged
 * selection unless they are aliased apart — cosmos-web does the same.
 */

export const MEDIA_CORE = /* GraphQL */ `
  fragment MediaCore on Media {
    __typename
    mediaId
    url
    width
    height
    notSafeForWorkStatus
    aiGenerated
    ... on StaticImage {
      blurHash
    }
    ... on AnimatedImage {
      blurHash
      video {
        url
        thumbnailUrl
      }
    }
    ... on Video {
      duration
      thumbnail {
        url
      }
      mux {
        playbackUrl
        mp4Url(quality: LOW)
      }
    }
  }
`;

export const ELEMENT_CORE = /* GraphQL */ `
  fragment ElementCore on ElementTile {
    __typename
    id
    createdAt
    processingState
    contentAccessibility
    isFeatured
    isReadyToShow
    ownerId
    owner {
      username
      isVerifiedProfile
    }
    shareUrl
    originalClusterId
    generatedCaption {
      text
    }
    source {
      url
      isPublicDomain
      author {
        username
        fullName
        profileUrl
      }
    }
    ... on MediaElementTile {
      hasMoreMedia
      media {
        ...MediaCore
      }
      multipleMedia {
        ...MediaCore
      }
    }
    ... on ProductElementTile {
      media {
        ...MediaCore
      }
      productPrice: price {
        value
        currency
      }
      productBrand: brand
      productTitle: name
      productDescription: description
    }
  }
  ${MEDIA_CORE}
`;

export const CLUSTER_CORE = /* GraphQL */ `
  fragment ClusterCore on Cluster {
    id
    name
    description
    slug
    isPrivate
    isFeatured
    isPublicElementsCluster
    ownerId
    owner {
      username
    }
    parentClusterId
    numberOfElements
    coverImageUrl
    cover {
      url
      width
      height
      blurHash
    }
  }
`;

/**
 * `user(username:)` resolves to UserPublicProfile, not User — only `me` returns
 * User. Spreading a `User` fragment onto it is a hard validation error.
 */
export const USER_CORE = /* GraphQL */ `
  fragment UserCore on UserPublicProfile {
    id
    username
    fullName
    bio
    avatarUrl
    websiteUrl
    isPremium
    isBanned
    publicElementsCluster {
      id
      numberOfElements
    }
    socialLinks {
      instagramUrl
      twitterUrl
      tiktokUrl
      spotify
    }
  }
`;
