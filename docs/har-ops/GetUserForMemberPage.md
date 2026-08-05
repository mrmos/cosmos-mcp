# GetUserForMemberPage

URL: https://api.cosmos.so/graphql?q=GetUserForMemberPage

## Query
```graphql
query GetUserForMemberPage($username: String!, $userId: UserId!, $isLoggedIn: Boolean!, $isAdmin: Boolean! = false) {
  user(username: $username) {
    ...ProfileUserCard
    isBanned
    isFeatured @include(if: $isAdmin)
    categories @include(if: $isAdmin) {
      id
      name
      __typename
    }
    verifiedProfile {
      id
      __typename
    }
    __typename
  }
}

fragment ProfileUserCard on UserPublicProfile {
  id
  fullName
  username
  bio
  avatarUrl
  isPremium
  isAesthetic
  websiteUrl
  isFollowed(followerId: $userId) @include(if: $isLoggedIn)
  publicElementsCluster {
    id
    numberOfElements
    __typename
  }
  socialLinks {
    spotify
    instagram
    twitter
    tikTok
    instagramUrl
    twitterUrl
    tiktokUrl
    __typename
  }
  __typename
}
```

## Variables (samples)
```json
[
  {
    "isAdmin": false,
    "username": "example-user",
    "userId": 100000001,
    "isLoggedIn": true
  }
]
```

## Response shape
```json
{
  "data": {
    "user": {
      "id": "number",
      "fullName": "string",
      "username": "string",
      "bio": "null",
      "avatarUrl": "string",
      "isPremium": "boolean",
      "isAesthetic": "null",
      "websiteUrl": "null",
      "isFollowed": "boolean",
      "publicElementsCluster": {
        "id": "number",
        "numberOfElements": "number",
        "__typename": "string"
      },
      "socialLinks": "null",
      "__typename": "string",
      "isBanned": "null",
      "verifiedProfile": "null"
    }
  }
}
```
