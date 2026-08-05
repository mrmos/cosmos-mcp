# UserFollows

URL: https://api.cosmos.so/graphql?q=UserFollows

## Query
```graphql
query UserFollows($followerId: UserId, $followeeId: UserId, $currentUserId: UserId, $followerSearchTerm: String, $followeeSearchTerm: String, $pageSize: Int, $pageCursor: String, $isLoggedIn: Boolean!) {
  userFollows(
    userId: $currentUserId
    filters: {followerId: $followerId, followeeId: $followeeId, followerSearchTerm: $followerSearchTerm, followeeSearchTerm: $followeeSearchTerm}
    meta: {pageSize: $pageSize, pageCursor: $pageCursor}
  ) {
    ...FollowedUsersList
    meta {
      count
      __typename
    }
    __typename
  }
}

fragment FollowedUsersList on UserFollowList {
  items {
    followerId
    followeeId
    followee {
      id
      ...UserPublicProfile
      isFollowed(followerId: $currentUserId) @include(if: $isLoggedIn)
      __typename
    }
    follower {
      id
      ...UserPublicProfile
      isFollowed(followerId: $currentUserId) @include(if: $isLoggedIn)
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
    "followerId": 100000001,
    "currentUserId": 100000001,
    "followeeSearchTerm": "",
    "isLoggedIn": true,
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "userFollows": {
      "items": [
        {
          "followerId": "number",
          "followeeId": "number",
          "followee": {
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
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
