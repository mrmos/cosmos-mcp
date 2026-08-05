# GetClusterBySlug

URL: https://api.cosmos.so/graphql?q=GetClusterBySlug

## Query
```graphql
query GetClusterBySlug($input: ClusterGetInput!, $userId: UserId!, $ownerOrgId: OrganizationId, $isAdmin: Boolean! = false, $isSubcluster: Boolean! = false, $subClusterSlug: String, $isLoggedIn: Boolean!, $includeFollowersCount: Boolean = true) {
  cluster(input: $input) {
    ...ClusterDetails
    ownerOrgIsPinnedToUserProfile: isPinnedToUserProfile(
      userId: $userId
      ownerOrgId: $ownerOrgId
    ) @include(if: $isLoggedIn)
    ...ClusterAdminDetails @include(if: $isAdmin)
    subCluster(slug: $subClusterSlug) @include(if: $isSubcluster) {
      ...ClusterDetails
      __typename
    }
    subClusters {
      items {
        __typename
        id
        ...SubclusterPill
      }
      meta {
        count
        __typename
      }
      __typename
    }
    __typename
  }
  clusterConnections(clusterInput: $input) {
    meta {
      count
      __typename
    }
    __typename
  }
}

fragment ClusterDetails on Cluster {
  ...ClusterBasic
  owner {
    ...UserPublicProfile
    __typename
  }
  collaborators {
    items {
      userId
      isOwner
      status
      collaboratorPublicProfile {
        ...UserPublicProfile
        __typename
      }
      __typename
    }
    __typename
  }
  isFollowed(userId: $userId) @include(if: $isLoggedIn)
  isCollaborator(userId: $userId) @include(if: $isLoggedIn)
  followersCount @include(if: $includeFollowersCount)
  numberOfElements
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

fragment ClusterAdminDetails on Cluster {
  id
  isBanned
  categories {
    id
    name
    __typename
  }
  isAesthetic
  __typename
}

fragment SubclusterPill on Cluster {
  id
  name
  slug
  numberOfElements
  coverImageUrl
  cover {
    url
    width
    height
    blurHash
    notSafeForWorkStatus
    aiGenerated
    __typename
  }
  owner {
    id
    username
    __typename
  }
  isPrivate
  collaboratorsCount
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
```

## Variables (samples)
```json
[
  {
    "isAdmin": false,
    "isSubcluster": false,
    "includeFollowersCount": true,
    "isLoggedIn": true,
    "userId": 100000001,
    "input": {
      "ownerUsername": "example-user",
      "slug": "things-i-like"
    }
  },
  {
    "isAdmin": false,
    "isSubcluster": false,
    "includeFollowersCount": true,
    "userId": 100000001,
    "input": {
      "ownerUsername": "example-user",
      "slug": "example-board"
    },
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
      "coverImageElementId": "number",
      "coverImageUrl": "string",
      "isFollowed": "boolean",
      "isFeatured": "boolean",
      "parentClusterId": "null",
      "isPinnedToUserProfile": "boolean",
      "numberOfElements": "number",
      "cover": {
        "notSafeForWorkStatus": "string",
        "url": "string",
        "blurHash": "string",
        "width": "number",
        "height": "number",
        "aiGenerated": "boolean",
        "video": {
          "url": "string(62)",
          "thumbnailUrl": "string(62)",
          "__typename": "string"
        },
        "__typename": "string"
      },
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
      "isCollaborator": "boolean",
      "followersCount": "number",
      "ownerOrgIsPinnedToUserProfile": "boolean",
      "subClusters": {
        "items": [],
        "meta": {
          "count": "number",
          "__typename": "string"
        },
        "__typename": "string"
      }
    },
    "clusterConnections": {
      "meta": {
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
