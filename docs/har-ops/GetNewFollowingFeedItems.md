# GetNewFollowingFeedItems

URL: https://api.cosmos.so/graphql?q=GetNewFollowingFeedItems

## Query
```graphql
query GetNewFollowingFeedItems($userId: UserId!) {
  followingFeed(filters: {userId: $userId}, meta: {pageSize: 5}) {
    items {
      finishedAt
      collaborator {
        id
        __typename
      }
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
    "followingFeed": {
      "items": [
        {
          "finishedAt": "string",
          "collaborator": {
            "id": "number",
            "__typename": "string"
          },
          "__typename": "string"
        },
        "…x5"
      ],
      "__typename": "string"
    }
  }
}
```
