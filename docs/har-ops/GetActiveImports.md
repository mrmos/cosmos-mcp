# GetActiveImports

URL: https://api.cosmos.so/graphql?q=GetActiveImports

## Query
```graphql
query GetActiveImports($userId: UserId!, $clusterId: ClusterId) {
  activeImports(userId: $userId, clusterId: $clusterId) {
    items {
      userId
      sourceUrl
      sourceType
      numberOfElements
      clusterId
      status
      __typename
    }
    importProgressTracker {
      totalElementsInImport
      elementsImported
      __typename
    }
    meta {
      pageSize
      count
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
    "userId": 100000001,
    "clusterId": null
  }
]
```

## Response shape
```json
{
  "data": {
    "activeImports": {
      "items": [],
      "importProgressTracker": {
        "totalElementsInImport": "number",
        "elementsImported": "number",
        "__typename": "string"
      },
      "meta": {
        "pageSize": "number",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
