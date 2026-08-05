# EditElementsConnectionsToClusters

URL: https://api.cosmos.so/graphql?q=EditElementsConnectionsToClusters

## Query
```graphql
mutation EditElementsConnectionsToClusters($userId: UserId!, $elementIds: [ElementId!]!, $clusterIdsToConnect: [ClusterId!]!, $clusterIdsToDisconnect: [ClusterId!]!, $userInteractionSource: UserInteractionSource, $actionScreen: ActionScreen, $slateId: String, $elementAnalyticsProperties: [ElementAnalyticsPropertiesInput!]) {
  element {
    editElementsConnectionsToClusters(
      input: {userId: $userId, elementIds: $elementIds, clusterIdsToConnect: $clusterIdsToConnect, clusterIdsToDisconnect: $clusterIdsToDisconnect, userInteractionSource: $userInteractionSource, actionScreen: $actionScreen, slateId: $slateId, elementAnalyticsProperties: $elementAnalyticsProperties}
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
      38410868
    ],
    "clusterIdsToConnect": [
      53787248
    ],
    "clusterIdsToDisconnect": [],
    "slateId": "aed1a81d-3c00-477e-a598-40fea1d62c0d",
    "userInteractionSource": "FOR_YOU",
    "actionScreen": "ELEMENT_VIEW",
    "elementAnalyticsProperties": [
      {
        "elementId": 38410868,
        "properties": [
          {
            "key": "element_type",
            "value": "image"
          }
        ]
      }
    ]
  },
  {
    "userId": 100000001,
    "elementIds": [
      38410868
    ],
    "clusterIdsToConnect": [
      194307119
    ],
    "clusterIdsToDisconnect": [],
    "slateId": "aed1a81d-3c00-477e-a598-40fea1d62c0d",
    "userInteractionSource": "FOR_YOU",
    "actionScreen": "ELEMENT_VIEW",
    "elementAnalyticsProperties": [
      {
        "elementId": 38410868,
        "properties": [
          {
            "key": "element_type",
            "value": "image"
          }
        ]
      }
    ]
  },
  {
    "userId": 100000001,
    "elementIds": [
      38410868
    ],
    "clusterIdsToConnect": [],
    "clusterIdsToDisconnect": [
      194307119
    ]
  }
]
```

## Response shape
```json
{
  "data": {
    "element": {
      "editElementsConnectionsToClusters": {
        "success": "boolean",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
