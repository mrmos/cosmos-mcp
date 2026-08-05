# GetSubclusters

URL: https://api.cosmos.so/graphql?q=GetSubclusters

## Query
```graphql
query GetSubclusters($clusterId: ClusterId!) {
  cluster(id: $clusterId) {
    id
    subClusters {
      items {
        ...SubclusterPill
        __typename
      }
      meta {
        nextPageCursor
        count
        __typename
      }
      __typename
    }
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
    "clusterId": 1446582283
  }
]
```

## Response shape
```json
{
  "data": {
    "cluster": {
      "id": "number",
      "subClusters": {
        "items": [],
        "meta": {
          "nextPageCursor": "null",
          "count": "number",
          "__typename": "string"
        },
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
