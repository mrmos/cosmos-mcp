# GetUserFollowSuggestions

URL: https://api.cosmos.so/graphql?q=GetUserFollowSuggestions

## Query
```graphql
query GetUserFollowSuggestions($userId: UserId!, $pageCursor: String, $pageSize: Int, $mixed: Boolean) {
  userFollowSuggestions(
    userId: $userId
    mixed: $mixed
    meta: {pageCursor: $pageCursor, pageSize: $pageSize}
  ) {
    items {
      ...UserFollowSuggestion
      __typename
    }
    meta {
      nextPageCursor
      pageSize
      __typename
    }
    __typename
  }
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
```

## Variables (samples)
```json
[
  {
    "userId": 100000001,
    "pageSize": 25,
    "mixed": true
  }
]
```

## Response shape
```json
"null"
```
