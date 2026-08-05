# GetClustersForUpload

URL: https://api.cosmos.so/graphql?q=GetClustersForUpload

## Query
```graphql
query GetClustersForUpload($userId: UserId!, $searchTerm: String, $pageCursor: String) {
  clusters(
    filters: {ownerId: $userId, searchTerm: $searchTerm}
    meta: {pageSize: 20, pageCursor: $pageCursor}
  ) {
    items {
      id
      name
      numberOfElements
      isPrivate
      cover {
        blurHash
        url
        __typename
      }
      shareUrl
      subClusters {
        items {
          id
          name
          numberOfElements
          isPrivate
          shareUrl
          cover {
            blurHash
            url
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    meta {
      nextPageCursor
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
    "pageCursor": null
  }
]
```

## Response shape
```json
{
  "data": {
    "clusters": {
      "items": [
        {
          "id": "number",
          "name": "string",
          "numberOfElements": "number",
          "isPrivate": "boolean",
          "cover": "null",
          "shareUrl": "string",
          "subClusters": {
            "items": [],
            "__typename": "string"
          },
          "__typename": "string"
        },
        "…x5"
      ],
      "meta": {
        "nextPageCursor": "null",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
