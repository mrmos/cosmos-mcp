# GetClusterBasic

URL: https://api.cosmos.so/graphql?q=GetClusterBasic

## Query
```graphql
query GetClusterBasic($slug: String!, $subclusterSlug: String, $ownerUsername: String!, $userId: UserId!, $fetchSubCluster: Boolean!, $isLoggedIn: Boolean!) {
  cluster(input: {slug: $slug, ownerUsername: $ownerUsername}) {
    ...ClusterBasic
    isCollaborator(userId: $userId)
    subCluster(slug: $subclusterSlug) @include(if: $fetchSubCluster) {
      ...ClusterBasic
      isCollaborator(userId: $userId)
      __typename
    }
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
    "slug": "example-board",
    "ownerUsername": "example-user",
    "userId": 100000001,
    "fetchSubCluster": false,
    "isLoggedIn": true
  }
]
```

## Response shape
```json
{
  "data": {
    "cluster": {
      "id": "number",
      "name": "string",
      "isPublicElementsCluster": "boolean",
      "description": "null",
      "slug": "string",
      "isPrivate": "boolean",
      "ownerId": "number",
      "owner": {
        "id": "number",
        "fullName": "string",
        "username": "string",
        "avatarUrl": "string",
        "isPremium": "boolean",
        "isVerifiedProfile": "boolean",
        "publicElementsCluster": {
          "id": "number",
          "numberOfElements": "number",
          "__typename": "string"
        },
        "verifiedProfile": "null",
        "__typename": "string",
        "isFollowed": "boolean"
      },
      "coverImageElementId": "null",
      "coverImageUrl": "null",
      "isFollowed": "boolean",
      "isFeatured": "boolean",
      "parentClusterId": "null",
      "isPinnedToUserProfile": "boolean",
      "numberOfElements": "number",
      "cover": "null",
      "collaborators": {
        "items": [
          {
            "userId": "number",
            "collaboratorPublicProfile": {
              "id": "…",
              "fullName": "…",
              "username": "…",
              "avatarUrl": "…",
              "isPremium": "…",
              "isVerifiedProfile": "…",
              "publicElementsCluster": "…",
              "verifiedProfile": "…",
              "__typename": "…"
            },
            "__typename": "string",
            "isOwner": "boolean",
            "status": "string"
          },
          "…x1"
        ],
        "__typename": "string"
      },
      "__typename": "string",
      "isCollaborator": "boolean"
    }
  }
}
```
