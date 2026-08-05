# GetCompositeFollowingFeed

URL: https://api.cosmos.so/graphql?q=GetCompositeFollowingFeed

## Query
```graphql
query GetCompositeFollowingFeed($userId: UserId!, $pageCursor: String, $pageSize: Int = 20, $isLoggedIn: Boolean!) {
  compositeFollowingFeed(
    userId: $userId
    meta: {pageSize: $pageSize, pageCursor: $pageCursor}
  ) {
    items {
      feedSession {
        ...FollowingFeedItem
        __typename
      }
      userFollowSuggestions {
        ...CompositeFollowSuggestion
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

fragment FollowingFeedItem on FeedSession {
  id
  clusterId
  elementCount
  startedAt
  finishedAt
  collaborator {
    id
    ...UserPublicProfile
    isFollowed(followerId: $userId)
    __typename
  }
  elementTiles {
    ...ElementTile
    __typename
  }
  cluster {
    ...ClusterBasic
    isFollowed(userId: $userId)
    isPublicElementsCluster
    parentCluster {
      id
      name
      slug
      cover {
        notSafeForWorkStatus
        aiGenerated
        __typename
      }
      __typename
    }
    __typename
  }
  elementIds
  __typename
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

fragment CompositeFollowSuggestion on UserFollowSuggestion {
  ...UserFollowSuggestion
  suggestedUser {
    topElements(elementCount: 3) {
      ...ElementTile
      __typename
    }
    __typename
  }
  __typename
}

fragment UserFollowSuggestion on UserFollowSuggestion {
  suggestedUserId
  exampleMutualUserId
  mutualConnectionsCount
  score
  suggestedUser {
    ...UserPublicProfile
    isFollowed(followerId: $userId)
    __typename
  }
  exampleMutualUser {
    ...UserPublicProfile
    __typename
  }
  reason
  mostPopularClusterName
  mostPopularCluster {
    name
    slug
    __typename
    id
  }
  topicCluster {
    __typename
    id
    name
    slug
  }
  followedClusterCount
  __typename
}
```

## Variables (samples)
```json
[
  {
    "pageSize": 20,
    "userId": 100000001,
    "isLoggedIn": true,
    "pageCursor": null
  }
]
```

## Response shape
```json
"null"
```
