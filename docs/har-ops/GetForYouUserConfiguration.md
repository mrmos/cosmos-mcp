# GetForYouUserConfiguration

URL: https://api.cosmos.so/graphql?q=GetForYouUserConfiguration

## Query
```graphql
query GetForYouUserConfiguration($userId: UserId!) {
  forYouUserConfiguration(userId: $userId) {
    userId
    isFeedPrepared
    selectedTopicCount
    libraryElementCount
    canSkipTopicSelection
    healthReport {
      feedGenerationRequirements
      mitigationStatus
      seedBucket {
        cursorAction
        __typename
      }
      forYouFeed {
        cursorAction
        __typename
      }
      __typename
    }
    selectedTopicClusters {
      items {
        id
        __typename
      }
      __typename
    }
    currentForYouVersion
    desiredForYouVersion
    __typename
  }
}
```

## Variables (samples)
```json
[
  {
    "userId": 100000001
  }
]
```

## Response shape
```json
{
  "data": {
    "forYouUserConfiguration": {
      "userId": "number",
      "isFeedPrepared": "boolean",
      "selectedTopicCount": "number",
      "libraryElementCount": "number",
      "canSkipTopicSelection": "boolean",
      "healthReport": {
        "feedGenerationRequirements": "string",
        "mitigationStatus": "string",
        "seedBucket": {
          "cursorAction": "string",
          "__typename": "string"
        },
        "forYouFeed": {
          "cursorAction": "string",
          "__typename": "string"
        },
        "__typename": "string"
      },
      "selectedTopicClusters": {
        "items": [
          {
            "id": "number",
            "__typename": "string"
          },
          "…x27"
        ],
        "__typename": "string"
      },
      "currentForYouVersion": "string",
      "desiredForYouVersion": "string",
      "__typename": "string"
    }
  }
}
```
