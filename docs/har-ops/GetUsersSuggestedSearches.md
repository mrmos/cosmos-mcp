# GetUsersSuggestedSearches

URL: https://api.cosmos.so/graphql?q=GetUsersSuggestedSearches

## Query
```graphql
query GetUsersSuggestedSearches($searchCategory: String) {
  searches {
    savedSearches(searchCategory: $searchCategory) {
      items {
        searchTerm
        displayName
        searchCategory
        coverImage {
          __typename
          url
          blurHash
          notSafeForWorkStatus
          ... on AnimatedImage {
            staticThumbnailUrl
            __typename
          }
        }
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
  {}
]
```

## Response shape
```json
{
  "data": {
    "searches": {
      "savedSearches": {
        "items": [],
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
