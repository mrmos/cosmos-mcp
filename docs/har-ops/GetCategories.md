# GetCategories

URL: https://api.cosmos.so/graphql?q=GetCategories

## Query
```graphql
query GetCategories {
  categories {
    items {
      id
      name
      slug
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
    "categories": {
      "items": [
        {
          "id": "number",
          "name": "string",
          "slug": "string",
          "__typename": "string"
        },
        "…x17"
      ],
      "__typename": "string"
    }
  }
}
```
