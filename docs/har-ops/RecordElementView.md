# RecordElementView

URL: https://api.cosmos.so/graphql?q=RecordElementView

## Query
```graphql
mutation RecordElementView($input: RecordElementEventInput!) {
  element {
    recordElementEvent(input: $input) {
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
      "elementId": 38410868,
      "userId": 100000001,
      "eventType": "ELEMENT_VIEWED",
      "viewTime": 1722,
      "slateId": "aed1a81d-3c00-477e-a598-40fea1d62c0d",
      "userInteractionSource": "FOR_YOU",
      "analyticsProperties": [
        {
          "key": "element_type",
          "value": "image"
        }
      ]
    }
  },
  {
    "input": {
      "elementId": 38410868,
      "userId": 100000001,
      "eventType": "ELEMENT_VIEWED",
      "viewTime": 34208,
      "slateId": "aed1a81d-3c00-477e-a598-40fea1d62c0d",
      "userInteractionSource": "FOR_YOU",
      "analyticsProperties": [
        {
          "key": "element_type",
          "value": "image"
        }
      ]
    }
  }
]
```

## Response shape
```json
{
  "data": {
    "element": {
      "recordElementEvent": {
        "success": "boolean",
        "__typename": "string"
      },
      "__typename": "string"
    }
  }
}
```
