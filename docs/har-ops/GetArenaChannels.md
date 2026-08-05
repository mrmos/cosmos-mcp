# GetArenaChannels

URL: https://api.cosmos.so/graphql?q=GetArenaChannels

## Query
```graphql
query GetArenaChannels($username: String!) {
  arenaChannels(username: $username) {
    items {
      id
      title
      url
      coverImageUrl
      blockCount
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
    "username": "example-arena-user"
  }
]
```

## Response shape
```json
{
  "data": {
    "arenaChannels": {
      "items": [],
      "__typename": "string"
    }
  }
}
```
