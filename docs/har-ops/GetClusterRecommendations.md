# GetClusterRecommendations

URL: https://api.cosmos.so/graphql?q=GetClusterRecommendations

## Query
```graphql
query GetClusterRecommendations($userId: UserId, $clusterId: ClusterId!, $isAdmin: Boolean! = false, $isLoggedIn: Boolean! = false) {
  clusterRecommendations(clusterId: $clusterId) {
    elementsV2 {
      items {
        ...ElementTile
        slateId
        isFeatured @include(if: $isAdmin)
        userContext(userId: $userId) {
          ...ElementUserContext
          __typename
        }
        connection(cluster: {id: $clusterId}) @include(if: $isLoggedIn) {
          clusterId
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
    "isAdmin": false,
    "isLoggedIn": true,
    "clusterId": 1446582283,
    "userId": 100000001
  },
  {
    "isAdmin": false,
    "isLoggedIn": true,
    "clusterId": 1446582283,
    "userId": 100000001
  }
]
```

## Response shape
```json
{
  "data": {
    "clusterRecommendations": {
      "elementsV2": {
        "items": [],
        "meta": {
          "nextPageCursor": "null",
          "count": "number",
          "__typename": "string"
        },
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
