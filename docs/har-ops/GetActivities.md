# GetActivities

URL: https://api.cosmos.so/graphql?q=GetActivities

## Query
```graphql
query GetActivities($ownerId: UserId!, $start: DateTime, $end: DateTime, $onlyFollows: Boolean, $pageCursor: String) {
  activityFeed(
    meta: {pageSize: 16, pageCursor: $pageCursor}
    filters: {ownerId: $ownerId, start: $start, end: $end, onlyFollows: $onlyFollows}
  ) {
    items {
      ...ActivityLogEntry
      __typename
    }
    meta {
      nextPageCursor
      __typename
    }
    __typename
  }
}

fragment ActivityLogEntry on ActivityInterface {
  id
  isRead
  createdAt
  ...ClusterFollowerClusterCreatedActivityLogEntry
  ...CollaborationInviteActivityLogEntry
  ...UserFollowerClusterCreatedActivityLogEntry
  ...ClusterFollowerClusterCreatedActivityLogEntry
  ...UserFollowedActivityLogEntry
  ...UserConnectedYourElementAggregatableActivityLogEntry
  ...UserConnectedElementToCollaborativeClusterAggregatableActivityLogEntry
  ...UsersFollowedYourClusterAggregatableActivityLogEntry
  ...ImportCompleteAtomicActivityLogEntry
  ...ImportFailedAtomicActivityLogEntry
  ...UserAcceptedCollaborationInviteAtomicActivityLogEntry
  __typename
}

fragment ClusterFollowerClusterCreatedActivityLogEntry on ClusterFollowerClusterCreatedActivity {
  id
  ownerId
  isRead
  createdAt
  creator {
    ...UserPublicProfile
    __typename
  }
  cluster {
    id
    name
    slug
    owner {
      id
      username
      __typename
    }
    cover {
      url
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    parentCluster {
      id
      slug
      name
      __typename
    }
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

fragment CollaborationInviteActivityLogEntry on CollaborationInviteActivity {
  id
  ownerId
  isRead
  inviteCode
  createdAt
  inviter {
    ...UserPublicProfile
    __typename
  }
  cluster {
    id
    name
    coverImageUrl
    slug
    shareUrl
    owner {
      id
      username
      __typename
    }
    isCollaborator(userId: $ownerId)
    parentCluster {
      id
      slug
      name
      __typename
    }
    __typename
  }
  __typename
}

fragment UserFollowerClusterCreatedActivityLogEntry on UserFollowerClusterCreatedActivity {
  id
  ownerId
  isRead
  createdAt
  creator {
    ...UserPublicProfile
    __typename
  }
  cluster {
    id
    name
    slug
    owner {
      id
      username
      __typename
    }
    cover {
      url
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    parentCluster {
      id
      slug
      name
      __typename
    }
    __typename
  }
  __typename
}

fragment UserFollowedActivityLogEntry on UserFollowedActivity {
  id
  ownerId
  isRead
  createdAt
  follower {
    ...UserPublicProfile
    isFollowed(followerId: $ownerId)
    __typename
  }
  __typename
}

fragment UserConnectedYourElementAggregatableActivityLogEntry on UserConnectedYourElementAggregatableActivity {
  id
  __typename
  ownerId
  isRead
  createdAt
  aggregationKey
  numberOfConnections
  lastConnectedUser {
    ...UserPublicProfile
    __typename
  }
  secondToLastConnectedUser {
    ...UserPublicProfile
    __typename
  }
  element {
    id
    image {
      url
      hash
      __typename
    }
    notSafeForWorkStatus
    aiGenerated
    __typename
  }
}

fragment UserConnectedElementToCollaborativeClusterAggregatableActivityLogEntry on UserConnectedElementToCollaborativeClusterAggregatableActivity {
  id
  __typename
  ownerId
  isRead
  createdAt
  aggregationKey
  numberOfConnectedElements
  collaborator {
    ...UserPublicProfile
    __typename
  }
  cluster {
    id
    name
    slug
    owner {
      id
      username
      __typename
    }
    cover {
      url
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    parentCluster {
      id
      slug
      name
      __typename
    }
    __typename
  }
}

fragment UsersFollowedYourClusterAggregatableActivityLogEntry on UsersFollowedYourClusterAggregatableActivity {
  id
  __typename
  ownerId
  isRead
  createdAt
  aggregationKey
  numberOfFollows
  lastFollower {
    ...UserPublicProfile
    __typename
  }
  secondToLastFollower {
    ...UserPublicProfile
    __typename
  }
  cluster {
    id
    name
    slug
    owner {
      id
      username
      __typename
    }
    cover {
      url
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    parentCluster {
      id
      slug
      name
      __typename
    }
    __typename
  }
}

fragment ImportCompleteAtomicActivityLogEntry on ImportCompleteAtomicActivity {
  id
  ownerId
  isRead
  createdAt
  numberOfElements
  source
  cluster {
    id
    name
    slug
    isPublicElementsCluster
    owner {
      id
      username
      __typename
    }
    cover {
      url
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    parentCluster {
      id
      slug
      name
      __typename
    }
    __typename
  }
  __typename
}

fragment ImportFailedAtomicActivityLogEntry on ImportFailedAtomicActivity {
  id
  source
  cluster {
    id
    name
    __typename
  }
  __typename
}

fragment UserAcceptedCollaborationInviteAtomicActivityLogEntry on UserAcceptedCollaborationInviteAtomicActivity {
  id
  ownerId
  isRead
  createdAt
  collaborator {
    ...UserPublicProfile
    __typename
  }
  cluster {
    id
    name
    slug
    owner {
      id
      username
      __typename
    }
    cover {
      url
      blurHash
      notSafeForWorkStatus
      aiGenerated
      __typename
    }
    parentCluster {
      id
      slug
      name
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
    "ownerId": 100000001,
    "onlyFollows": true,
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "activityFeed": {
      "items": [
        {
          "id": "number",
          "isRead": "boolean",
          "createdAt": "string",
          "ownerId": "number",
          "follower": {
            "id": "number",
            "fullName": "string",
            "username": "string",
            "avatarUrl": "string",
            "isPremium": "boolean",
            "isVerifiedProfile": "boolean",
            "publicElementsCluster": {
              "id": "…",
              "numberOfElements": "…",
              "__typename": "…"
            },
            "verifiedProfile": "null",
            "__typename": "string",
            "isFollowed": "boolean"
          },
          "__typename": "string"
        },
        "…x1"
      ],
      "meta": {
        "nextPageCursor": "null",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
