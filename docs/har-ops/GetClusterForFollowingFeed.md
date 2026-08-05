# GetClusterForFollowingFeed

URL: https://api.cosmos.so/graphql?q=GetClusterForFollowingFeed

## Query
```graphql
query GetClusterForFollowingFeed($clusterId: ClusterId, $userId: UserId) {
  clusterConnections(clusterId: $clusterId, meta: {pageSize: 8}) {
    items {
      element {
        ...ElementTile
        userContext(userId: $userId) {
          ...ElementUserContext
          __typename
        }
        __typename
      }
      __typename
    }
    meta {
      nextPageCursor
      count
      __typename
    }
    __typename
  }
}

fragment ElementTile on ElementTile {
  __typename
  id
  processingState
  contentAccessibility
  createdAt
  isFeatured
  isReadyToShow
  hasIllegalReports
  ownerId
  owner {
    username
    isVerifiedProfile
    verifiedProfile {
      slug
      avatarUrl
      avatarThumbnailCropParameters {
        width
        height
        __typename
      }
      __typename
    }
    __typename
  }
  shareUrl
  originalClusterId
  generatedCaption {
    text
    __typename
  }
  source {
    ...ElementSource
    __typename
  }
  ... on MediaElementTile {
    hasMoreMedia
    multipleMedia {
      ...ElementMedia
      __typename
    }
    media {
      ...ElementMedia
      __typename
    }
    __typename
  }
  ... on ProductElementTile {
    media {
      ...ElementMedia
      __typename
    }
    productPrice: price {
      value
      currency
      __typename
    }
    productBrand: brand
    productTitle: name
    productDescription: description
    __typename
  }
  ... on WebsiteElementTile {
    media {
      ...ElementMedia
      __typename
    }
    websiteTitle: title
    websiteDescription: description
    __typename
  }
  ... on TextElementTile {
    text
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

fragment ElementSource on ElementSource {
  url
  isEditable
  isPublicDomain
  author {
    username
    fullName
    profileUrl
    avatarUrl
    __typename
  }
  __typename
}

fragment ElementUserContext on ElementUserContext {
  isDisliked
  isPublicElement
  connections {
    meta {
      count
      __typename
    }
    __typename
  }
  __typename
}
```

## Variables (samples)
```json
[
  {
    "clusterId": 53787248
  }
]
```

## Response shape
```json
{
  "data": {
    "clusterConnections": {
      "items": [
        {
          "element": {
            "__typename": "string",
            "id": "number",
            "processingState": "string",
            "contentAccessibility": "string",
            "createdAt": "string",
            "isFeatured": "boolean",
            "isReadyToShow": "boolean",
            "hasIllegalReports": "boolean",
            "ownerId": "number",
            "owner": {
              "username": "…",
              "isVerifiedProfile": "…",
              "verifiedProfile": "…",
              "__typename": "…"
            },
            "shareUrl": "string",
            "originalClusterId": "number",
            "generatedCaption": "null",
            "source": {
              "url": "…",
              "isEditable": "…",
              "isPublicDomain": "…",
              "author": "…",
              "__typename": "…"
            },
            "hasMoreMedia": "boolean",
            "multipleMedia": [],
            "media": {
              "mediaId": "…",
              "url": "…",
              "width": "…",
              "height": "…",
              "notSafeForWorkStatus": "…",
              "aiGenerated": "…",
              "__typename": "…",
              "blurHash": "…"
            },
            "userContext": "null"
          },
          "__typename": "string"
        },
        "…x8"
      ],
      "meta": {
        "nextPageCursor": "string",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
