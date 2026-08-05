# GetElementTopCounts

URL: https://api.cosmos.so/graphql?q=GetElementTopCounts

## Query
```graphql
query GetElementTopCounts($elementId: ElementId!, $userId: UserId) {
  elementTopConnections(elementId: $elementId, userId: $userId) {
    meta {
      nextPageCursor
      count
      __typename
    }
    __typename
  }
  elementTopUsers(elementId: $elementId, userId: $userId, meta: {pageSize: 3}) {
    items {
      avatarUrl
      __typename
    }
    meta {
      nextPageCursor
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
    "elementId": 38410868,
    "userId": 100000001
  },
  {
    "elementId": 38410868,
    "userId": 100000001
  }
]
```

## Response shape
```json
{
  "data": {
    "elementTopConnections": {
      "meta": {
        "nextPageCursor": "null",
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    },
    "elementTopUsers": {
      "items": [],
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
