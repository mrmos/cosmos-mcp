# GetSimilarElements

URL: https://api.cosmos.so/graphql?q=GetSimilarElements

## Query
```graphql
query GetSimilarElements($userId: UserId, $elementIds: [ElementId!]!, $isLoggedIn: Boolean! = false, $isAdmin: Boolean! = false, $pageCursor: String, $pageSize: Int = 40) {
  similarElementsV2(
    elementIds: $elementIds
    meta: {pageSize: $pageSize, pageCursor: $pageCursor}
  ) {
    items {
      ...ElementTile
      slateId
      isFeatured @include(if: $isAdmin)
      userContext(userId: $userId) @include(if: $isLoggedIn) {
        ...ElementUserContext
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
    "isLoggedIn": true,
    "isAdmin": false,
    "pageSize": 40,
    "userId": 100000001,
    "elementIds": [
      38410868
    ],
    "pageCursor": null
  },
  {
    "isLoggedIn": true,
    "isAdmin": false,
    "pageSize": 40,
    "userId": 100000001,
    "elementIds": [
      38410868
    ],
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "similarElementsV2": {
      "items": [
        {
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
            "username": "string",
            "isVerifiedProfile": "boolean",
            "verifiedProfile": "null",
            "__typename": "string"
          },
          "shareUrl": "string",
          "originalClusterId": "number",
          "generatedCaption": {
            "text": "string(126)",
            "__typename": "string"
          },
          "source": {
            "url": "string(93)",
            "isEditable": "boolean",
            "isPublicDomain": "boolean",
            "author": {
              "username": "…",
              "fullName": "…",
              "profileUrl": "…",
              "avatarUrl": "…",
              "__typename": "…"
            },
            "__typename": "string"
          },
          "hasMoreMedia": "boolean",
          "multipleMedia": [],
          "media": {
            "mediaId": "string",
            "url": "string",
            "width": "number",
            "height": "number",
            "notSafeForWorkStatus": "string",
            "aiGenerated": "boolean",
            "__typename": "string",
            "blurHash": "string"
          },
          "slateId": "null",
          "userContext": {
            "isDisliked": "boolean",
            "isPublicElement": "boolean",
            "connections": {
              "meta": "…",
              "__typename": "…"
            },
            "__typename": "string"
          }
        },
        "…x38"
      ],
      "meta": {
        "nextPageCursor": "string(114)",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
