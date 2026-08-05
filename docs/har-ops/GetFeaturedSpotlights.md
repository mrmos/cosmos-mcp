# GetFeaturedSpotlights

URL: https://api.cosmos.so/graphql?q=GetFeaturedSpotlights

## Query
```graphql
query GetFeaturedSpotlights($pageCursor: String, $pageSize: Int = 8) {
  explore {
    featuredSpotlights(meta: {pageSize: $pageSize, pageCursor: $pageCursor}) {
      items {
        cluster {
          ...ClusterTileExplore
          __typename
        }
        user {
          ...UserPublicProfile
          statistics {
            numberOfFollowers
            __typename
          }
          topElements(elementCount: 3) {
            __typename
            id
            ... on MediaElementTile {
              media {
                ...ElementMedia
                __typename
              }
              __typename
            }
          }
          __typename
        }
        __typename
      }
      meta {
        nextPageCursor
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment ClusterTileExplore on Cluster {
  id
  name
  slug
  owner {
    id
    username
    avatarUrl
    isPremium
    isVerifiedProfile
    __typename
  }
  coverImageUrl
  cover {
    notSafeForWorkStatus
    aiGenerated
    url
    blurHash
    ... on AnimatedImage {
      video {
        url
        thumbnailUrl
        __typename
      }
      __typename
    }
    __typename
  }
  numberOfElements
  newestElements(numberOfElements: 2, hasImage: true) {
    id
    image {
      url
      hash
      mp4Url
      __typename
    }
    notSafeForWorkStatus
    aiGenerated
    __typename
  }
  __typename
}

fragment UserPublicProfile on UserPublicProfile {
  id
  fullName
  username
  avatarUrl
  isPremium
  isVerifiedProfile
  publicElementsCluster {
    id
    numberOfElements
    __typename
  }
  verifiedProfile {
    ...VerifiedProfile
    __typename
  }
  __typename
}

fragment VerifiedProfile on VerifiedProfile {
  __typename
  id
  slug
  isPublic
  status
  name
  avatarUrl
  avatarThumbnailCropParameters {
    width
    height
    __typename
  }
  coverImage {
    url
    hash
    thumbnailUrl
    __typename
  }
}

fragment ElementMedia on Media {
  mediaId
  url
  width
  height
  notSafeForWorkStatus
  aiGenerated
  __typename
  ... on StaticImage {
    blurHash
    __typename
  }
  ... on AnimatedImage {
    blurHash
    video {
      url
      thumbnailUrl
      __typename
    }
    __typename
  }
  ... on Video {
    thumbnail {
      hash
      url
      __typename
    }
    duration
    isStored
    mux {
      playbackUrl
      mp4Url(quality: LOW)
      downloadableUrl: mp4Url(quality: HIGH)
      __typename
    }
    width
    height
    __typename
  }
  ... on Media {
    __typename
  }
}
```

## Variables (samples)
```json
[
  {
    "pageSize": 8,
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "explore": {
      "featuredSpotlights": {
        "items": [
          {
            "cluster": {
              "id": "…",
              "name": "…",
              "slug": "…",
              "owner": "…",
              "coverImageUrl": "…",
              "cover": "…",
              "numberOfElements": "…",
              "newestElements": "…",
              "__typename": "…"
            },
            "user": "null",
            "__typename": "string"
          },
          "…x8"
        ],
        "meta": {
          "nextPageCursor": "string",
          "__typename": "string"
        },
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
