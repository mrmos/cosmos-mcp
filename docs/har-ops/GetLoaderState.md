# GetLoaderState

URL: https://api.cosmos.so/graphql?q=GetLoaderState

## Query
```graphql
query GetLoaderState($userId: UserId!, $clusterId: ClusterId) {
  loader(userId: $userId, clusterId: $clusterId) {
    numberOfElements
    sources
    timeEstimate
    __typename
  }
}
```

## Variables (samples)
```json
[
  {
    "userId": 100000001,
    "clusterId": 1446582283
  }
]
```

## Response shape
```json
{
  "data": {
    "loader": {
      "numberOfElements": "number",
      "sources": [],
      "timeEstimate": "string",
      "__typename": "string"
    }
  }
}
```
