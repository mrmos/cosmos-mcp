# MarkAllActivitiesAsRead

URL: https://api.cosmos.so/graphql?q=MarkAllActivitiesAsRead

## Query
```graphql
mutation MarkAllActivitiesAsRead($ownerId: UserId!) {
  activity {
    markAllAsRead(input: {ownerId: $ownerId}) {
      success
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
    "ownerId": 100000001
  }
]
```

## Response shape
```json
{
  "data": {
    "activity": {
      "markAllAsRead": {
        "success": "boolean",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
