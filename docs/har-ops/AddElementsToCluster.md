# AddElementsToCluster

URL: https://api.cosmos.so/graphql?q=AddElementsToCluster

## Query
```graphql
mutation AddElementsToCluster($userId: UserId!, $elementIds: [ElementId!]!, $clusterId: ClusterId!, $elementAnalyticsProperties: [ElementAnalyticsPropertiesInput!]) {
  cluster {
    addElementsToCluster(
      input: {userId: $userId, elementIds: $elementIds, clusterId: $clusterId, elementAnalyticsProperties: $elementAnalyticsProperties}
    ) {
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
    "userId": 100000001,
    "elementIds": [
      181816117,
      1047423993,
      1821610431
    ],
    "clusterId": 1446582283,
    "elementAnalyticsProperties": [
      {
        "elementId": 181816117,
        "properties": [
          {
            "key": "element_type",
            "value": "image"
          }
        ]
      },
      {
        "elementId": 1047423993,
        "properties": [
          {
            "key": "element_type",
            "value": "image"
          }
        ]
      },
      {
        "elementId": 1821610431,
        "properties": [
          {
            "key": "element_type",
            "value": "image"
          }
        ]
      }
    ]
  }
]
```

## Response shape
```json
{
  "data": {
    "cluster": {
      "addElementsToCluster": {
        "success": "boolean",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
