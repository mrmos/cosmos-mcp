# GetProfileCounts

URL: https://api.cosmos.so/graphql?q=GetProfileCounts

## Query
```graphql
query GetProfileCounts($userId: UserId!, $filters: UserClusterListFilters) {
  userClusters(userId: $userId, filters: $filters) {
    meta {
      count
      __typename
    }
    __typename
  }
  allElementsV2(userId: $userId) {
    meta {
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
    "userId": 100000001
  },
  {
    "userId": 100000001
  },
  {
    "userId": 100000001
  }
]
```

## Response shape
```json
{
  "data": {
    "userClusters": {
      "meta": {
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    },
    "allElementsV2": {
      "meta": {
        "count": "number",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
