# ViewElement

URL: https://api.cosmos.so/graphql?q=ViewElement

## Query
```graphql
mutation ViewElement($input: ViewElementInput!) {
  element {
    view(input: $input) {
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
    "input": {
      "elementIds": [
        38410868
      ],
      "userId": 100000001,
      "searchTerm": null
    }
  },
  {
    "input": {
      "elementIds": [
        38410868
      ],
      "userId": 100000001,
      "searchTerm": null
    }
  }
]
```

## Response shape
```json
{
  "data": {
    "element": {
      "view": {
        "success": "boolean",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
