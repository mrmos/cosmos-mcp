# FollowingUpdates

URL: https://api.cosmos.so/graphql?q=FollowingUpdates

## Query
```graphql
query FollowingUpdates($userId: UserId!, $pageCursor: String, $pageSize: Int) {
  followingUpdates(
    userId: $userId
    meta: {pageCursor: $pageCursor, pageSize: $pageSize}
  ) {
    items {
      __typename
      createdAt
      ...FolloweeFollowedUserFollowingUpdate
      ...FolloweeFollowedClusterFollowingUpdate
      ...FolloweeCreatedClusterFollowingUpdate
      ...FolloweeReachedElementMilestoneUpdate
      ...FolloweeImportedElementsFollowingUpdate
    }
    meta {
      nextPageCursor
      pageSize
      __typename
    }
    __typename
  }
}

fragment FolloweeFollowedUserFollowingUpdate on FolloweeFollowedUserFollowingUpdate {
  createdAt
  followee {
    ...UserPublicProfile
    isFollowed(followerId: $userId)
    __typename
  }
  followedUser {
    ...UserPublicProfile
    isFollowed(followerId: $userId)
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

fragment FolloweeFollowedClusterFollowingUpdate on FolloweeFollowedClusterFollowingUpdate {
  createdAt
  followee {
    ...UserPublicProfile
    isFollowed(followerId: $userId)
    __typename
  }
  followedCluster {
    name
    id
    slug
    parentCluster {
      id
      slug
      __typename
    }
    cover {
      url
      width
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    owner {
      ...UserPublicProfile
      __typename
    }
    numberOfElements
    isFollowed(userId: $userId)
    __typename
  }
  __typename
}

fragment FolloweeCreatedClusterFollowingUpdate on FolloweeCreatedClusterFollowingUpdate {
  createdAt
  createdCluster {
    id
    name
    slug
    parentCluster {
      id
      slug
      __typename
    }
    cover {
      url
      width
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    owner {
      ...UserPublicProfile
      isFollowed(followerId: $userId)
      __typename
    }
    numberOfElements
    isFollowed(userId: $userId)
    __typename
  }
  __typename
}

fragment FolloweeReachedElementMilestoneUpdate on FolloweeReachedElementMilestoneUpdate {
  createdAt
  milestoneElementNumber
  milestoneElementId
  milestoneElementClusterId
  followee {
    ...UserPublicProfile
    isFollowed(followerId: $userId)
    __typename
  }
  milestoneElementCluster {
    name
    id
    slug
    parentCluster {
      id
      slug
      __typename
    }
    cover {
      url
      width
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    owner {
      ...UserPublicProfile
      __typename
    }
    numberOfElements
    isFollowed(userId: $userId)
    __typename
  }
  milestoneElementTile {
    shareUrl
    __typename
  }
  __typename
}

fragment FolloweeImportedElementsFollowingUpdate on FolloweeImportedElementsFollowingUpdate {
  createdAt
  followee {
    ...UserPublicProfile
    isFollowed(followerId: $userId)
    __typename
  }
  importClusterId
  importSource
  importNumberOfElements
  __typename
}
```

## Variables (samples)
```json
[
  {
    "userId": 100000001,
    "pageSize": 5
  }
]
```

## Response shape
```json
{
  "data": {
    "followingUpdates": {
      "items": [],
      "meta": {
        "nextPageCursor": "null",
        "pageSize": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
