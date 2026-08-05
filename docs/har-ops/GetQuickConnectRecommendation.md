# GetQuickConnectRecommendation

URL: https://api.cosmos.so/graphql?q=GetQuickConnectRecommendation

## Query
```graphql
query GetQuickConnectRecommendation($userId: UserId!, $elementId: ElementId!, $includeHasConnections: Boolean! = false) {
  quickConnectRecommendation(userId: $userId) {
    clusterId
    cluster {
      id
      name
      slug
      isPublicElementsCluster
      cover {
        url
        blurHash
        __typename
      }
      parentCluster {
        id
        name
        slug
        __typename
      }
      hasConnections(elementIds: [$elementId]) @include(if: $includeHasConnections)
      __typename
    }
    __typename
  }
}
```

## Variables (samples)
```json
[
  {
    "includeHasConnections": true,
    "userId": 100000001,
    "elementId": 38410868
  },
  {
    "includeHasConnections": true,
    "userId": 100000001,
    "elementId": 1039472025
  },
  {
    "includeHasConnections": true,
    "userId": 100000001,
    "elementId": 181816117
  }
]
```

## Response shape
```json
{
  "data": {
    "quickConnectRecommendation": {
      "clusterId": "number",
      "cluster": {
        "id": "number",
        "name": "string",
        "slug": "string",
        "isPublicElementsCluster": "boolean",
        "cover": {
          "url": "string",
          "blurHash": "string",
          "__typename": "string"
        },
        "parentCluster": "null",
        "hasConnections": "boolean",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
