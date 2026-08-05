# GetElementSocialGraph

URL: https://api.cosmos.so/graphql?q=GetElementSocialGraph

## Query
```graphql
query GetElementSocialGraph($elementId: ElementId!, $userId: UserId!, $isLoggedIn: Boolean!) {
  elementTopConnections(
    elementId: $elementId
    userId: $userId
    meta: {pageSize: 3}
  ) {
    items {
      ...Connection
      __typename
    }
    meta {
      nextPageCursor
      count
      __typename
    }
    __typename
  }
  elementTopUsers(elementId: $elementId, userId: $userId, meta: {pageSize: 3}) {
    items {
      ...UserPublicProfile
      isFollowed(followerId: $userId) @include(if: $isLoggedIn)
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

fragment Connection on Connection {
  clusterId
  elementId
  userId
  createdAt
  cluster {
    ...ClusterWithTopElements
    __typename
  }
  collaborator {
    id
    username
    avatarUrl
    isPremium
    __typename
  }
  __typename
}

fragment ClusterWithTopElements on Cluster {
  ...ClusterBasic
  topElements(elementCount: 4) {
    ...ElementTile
    __typename
  }
  parentCluster {
    id
    name
    slug
    __typename
  }
  __typename
}

fragment ClusterBasic on Cluster {
  id
  name
  isPublicElementsCluster
  description
  slug
  isPrivate
  ownerId
  owner {
    ...UserPublicProfile
    isFollowed(followerId: $userId) @include(if: $isLoggedIn)
    __typename
  }
  coverImageElementId
  coverImageUrl
  isFollowed(userId: $userId) @include(if: $isLoggedIn)
  isFeatured
  parentClusterId
  isPinnedToUserProfile(userId: $userId) @include(if: $isLoggedIn)
  numberOfElements
  cover {
    notSafeForWorkStatus
    url
    blurHash
    width
    height
    aiGenerated
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
  collaborators {
    items {
      ...ClusterCollaborator
      isOwner
      status
      __typename
    }
    __typename
  }
  __typename
}

fragment ClusterCollaborator on Collaborator {
  userId
  collaboratorPublicProfile {
    ...UserPublicProfile
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
    "elementId": 38410868,
    "userId": 100000001,
    "isLoggedIn": true
  },
  {
    "elementId": 38410868,
    "userId": 100000001,
    "isLoggedIn": true
  },
  {
    "elementId": 38410868,
    "userId": 100000001,
    "isLoggedIn": true
  }
]
```

## Response shape
```json
{
  "data": {
    "elementTopConnections": {
      "items": [],
      "meta": {
        "nextPageCursor": "null",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    },
    "elementTopUsers": {
      "items": [],
      "meta": {
        "nextPageCursor": "null",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
