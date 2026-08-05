# GetElementDetails

URL: https://api.cosmos.so/graphql?q=GetElementDetails

## Query
```graphql
query GetElementDetails($elementId: ElementId!, $userId: UserId!, $isLoggedIn: Boolean!) {
  elementView(elementId: $elementId) {
    __typename
    element {
      ...ElementTile
      userContext(userId: $userId) @include(if: $isLoggedIn) {
        ...ElementUserContext
        __typename
      }
      generatedCaption {
        text
        __typename
      }
      __typename
    }
    ... on MultiMediaElementView {
      media {
        ...ElementMedia
        __typename
      }
      __typename
    }
    ... on OembedElementView {
      html
      __typename
    }
    verifiedProfile {
      ...VerifiedProfile
      __typename
    }
    verifiedProfileSourceCluster {
      ...ClusterWithParentCluster
      __typename
    }
  }
  elementQuickConnectRecommendation(userId: $userId, elementId: $elementId) @include(if: $isLoggedIn) {
    isConnected
    cluster {
      id
      name
      cover {
        url
        blurHash
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment ClusterWithParentCluster on Cluster {
  parentCluster {
    ...ClusterBasic
    __typename
  }
  ...ClusterBasic
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
    "elementView": {
      "__typename": "string",
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
          "username": "string",
          "isVerifiedProfile": "boolean",
          "verifiedProfile": "null",
          "__typename": "string"
        },
        "shareUrl": "string",
        "originalClusterId": "number",
        "generatedCaption": "null",
        "source": {
          "url": "string(62)",
          "isEditable": "boolean",
          "isPublicDomain": "boolean",
          "author": {
            "username": "string",
            "fullName": "null",
            "profileUrl": "string",
            "avatarUrl": "null",
            "__typename": "string"
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
        "userContext": {
          "isDisliked": "boolean",
          "isPublicElement": "boolean",
          "connections": {
            "meta": {
              "count": "…",
              "__typename": "…"
            },
            "__typename": "string"
          },
          "__typename": "string"
        }
      },
      "verifiedProfile": "null",
      "verifiedProfileSourceCluster": "null"
    },
    "elementQuickConnectRecommendation": {
      "isConnected": "boolean",
      "cluster": {
        "id": "number",
        "name": "string",
        "cover": {
          "url": "string",
          "blurHash": "string",
          "__typename": "string"
        },
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
