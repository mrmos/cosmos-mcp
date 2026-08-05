# GetConnectableClusters

URL: https://api.cosmos.so/graphql?q=GetConnectableClusters

## Query
```graphql
query GetConnectableClusters($userId: UserId!, $elementIds: [ElementId!]!, $searchTerm: String, $pageCursor: String) {
  areSavedToLibrary(userId: $userId, elementIds: $elementIds)
  connectableClusters(
    userId: $userId
    elementIds: $elementIds
    searchTerm: $searchTerm
    meta: {pageSize: 10, pageCursor: $pageCursor}
  ) {
    items {
      ...ConnectableClusterItem
      __typename
    }
    meta {
      pageCursor
      nextPageCursor
      __typename
    }
    __typename
  }
}

fragment ConnectableClusterItem on ConnectableCluster {
  cluster {
    id
    name
    slug
    coverImage {
      url
      notSafeForWorkStatus: isNotSafeForWork
      hash
      __typename
    }
    url
    numberOfElements
    hasSubClusters
    isPrivate
    __typename
  }
  hasConnections
  __typename
}
```

## Variables (samples)
```json
[
  {
    "userId": 100000001,
    "elementIds": [
      1190829869
    ]
  },
  {
    "userId": 100000001,
    "elementIds": [
      38410868
    ]
  },
  {
    "userId": 100000001,
    "elementIds": [
      38410868
    ],
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "areSavedToLibrary": "boolean",
    "connectableClusters": {
      "items": [
        {
          "cluster": {
            "id": "number",
            "name": "string",
            "slug": "string",
            "coverImage": {
              "url": "…",
              "notSafeForWorkStatus": "…",
              "hash": "…",
              "__typename": "…"
            },
            "url": "string",
            "numberOfElements": "number",
            "hasSubClusters": "boolean",
            "isPrivate": "boolean",
            "__typename": "string"
          },
          "hasConnections": "boolean",
          "__typename": "string"
        },
        "…x2"
      ],
      "meta": {
        "pageCursor": "null",
        "nextPageCursor": "string",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
