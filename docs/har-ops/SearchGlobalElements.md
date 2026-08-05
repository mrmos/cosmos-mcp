# SearchGlobalElements

URL: https://api.cosmos.so/graphql?q=SearchGlobalElements

## Query
```graphql
query SearchGlobalElements($userId: UserId, $searchTerm: String!, $contentType: ElementContentTypeFilter, $origin: SearchOrigin, $pageCursor: String, $order: ElementOrder, $color: String) {
  searchElements(
    filters: {color: $color, userId: $userId, contentType: $contentType}
    order: $order
    searchTerm: $searchTerm
    searchOrigin: $origin
    meta: {pageSize: 40, pageCursor: $pageCursor}
  ) {
    items {
      ...ElementTile
      slateId
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
```

## Variables (samples)
```json
[
  {
    "searchTerm": "example search",
    "contentType": "IMAGE",
    "order": "RELEVANT",
    "pageCursor": null
  },
  {
    "searchTerm": "example search",
    "origin": null,
    "contentType": "IMAGE",
    "order": null,
    "color": null,
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "searchElements": {
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
            "text": "string(106)",
            "__typename": "string"
          },
          "source": {
            "url": "string",
            "isEditable": "boolean",
            "isPublicDomain": "boolean",
            "author": "null",
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
          "slateId": "string"
        },
        "…x40"
      ],
      "meta": {
        "nextPageCursor": "string(108)",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
