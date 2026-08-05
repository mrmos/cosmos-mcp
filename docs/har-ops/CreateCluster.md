# CreateCluster

URL: https://api.cosmos.so/graphql?q=CreateCluster

## Query
```graphql
mutation CreateCluster($userId: UserId!, $name: String!, $description: String, $isPrivate: Boolean!, $isLoggedIn: Boolean!, $ownerOrgId: OrganizationId) {
  cluster {
    create(
      input: {userId: $userId, name: $name, description: $description, isPrivate: $isPrivate, ownerOrgId: $ownerOrgId}
    ) {
      ...ClusterTile
      __typename
    }
    __typename
  }
}

fragment ClusterTile on Cluster {
  ...ClusterBasic
  collaboratorsCount
  numberOfElements
  collaborators {
    items {
      ...ClusterCollaborator
      isOwner
      __typename
    }
    __typename
  }
  subClusters {
    items {
      ...SubclusterPill
      __typename
    }
    meta {
      count
      __typename
    }
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
    "name": "Example Private Board",
    "userId": 100000001,
    "isPrivate": true,
    "isLoggedIn": true
  },
  {
    "name": "Example Public Board",
    "userId": 100000001,
    "isPrivate": false,
    "isLoggedIn": true
  },
  {
    "name": "Example Board",
    "userId": 100000001,
    "isPrivate": false,
    "isLoggedIn": true
  }
]
```

## Response shape
```json
{
  "data": {
    "cluster": {
      "create": {
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
              "userId": "…",
              "collaboratorPublicProfile": "…",
              "__typename": "…",
              "isOwner": "…",
              "status": "…"
            },
            "…x1"
          ],
          "__typename": "string"
        },
        "__typename": "string",
        "collaboratorsCount": "number",
        "subClusters": {
          "items": [],
          "meta": {
            "count": "number",
            "__typename": "string"
          },
          "__typename": "string"
        }
      },
      "__typename": "string"
    }
  }
}
```
