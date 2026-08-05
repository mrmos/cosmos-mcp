# GetAllRecentActivity

URL: https://api.cosmos.so/graphql?q=GetAllRecentActivity

## Query
```graphql
query GetAllRecentActivity($ownerId: UserId!, $username: String!, $userId: UserId!, $pageSize: Int = 5, $sortDefinitions: [SortDefinitionInput!], $isLoggedIn: Boolean!) {
  globalSearchHistory(ownerId: $ownerId) {
    ownerId
    entries {
      ...GlobalRecentSearchListItem
      __typename
    }
    __typename
  }
  cluster(input: {slug: "recently-viewed", ownerUsername: $username}) {
    id
    topElements(elementCount: 24) {
      id
      ...ElementTile
      __typename
    }
    __typename
  }
  clusters(
    meta: {pageSize: $pageSize}
    filters: {ownerId: $ownerId}
    sortDefinitions: $sortDefinitions
  ) {
    items {
      ...ClusterTile
      __typename
    }
    meta {
      nextPageCursor
      count
      __typename
    }
    __typename
  }
  searches {
    trendingSearches {
      items {
        ...TrendingSearch
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment GlobalRecentSearchListItem on GlobalSearchHistoryEntry {
  ...GlobalClusterRecentSearchListItem
  ...GlobalSearchTermRecentSearchListItem
  ...GlobalUserRecentSearchListItem
  __typename
}

fragment GlobalClusterRecentSearchListItem on VisitedClusterGlobalSearchHistoryEntry {
  clusterId
  cluster {
    id
    coverImageUrl
    name
    slug
    owner {
      username
      __typename
    }
    cover {
      url
      notSafeForWorkStatus
      __typename
    }
    __typename
  }
  __typename
}

fragment GlobalSearchTermRecentSearchListItem on SearchTermGlobalSearchHistoryEntry {
  searchTerm
  __typename
}

fragment GlobalUserRecentSearchListItem on VisitedUserGlobalSearchHistoryEntry {
  userId
  user {
    ...UserPublicProfile
    __typename
  }
  __typename
}

fragment UserPublicProfile on UserPublicProfile {
  id
  fullName
  username
  avatarUrl
  isPremium
  isVerifiedProfile
  publicElementsCluster {
    id
    numberOfElements
    __typename
  }
  verifiedProfile {
    ...VerifiedProfile
    __typename
  }
  __typename
}

fragment VerifiedProfile on VerifiedProfile {
  __typename
  id
  slug
  isPublic
  status
  name
  avatarUrl
  avatarThumbnailCropParameters {
    width
    height
    __typename
  }
  coverImage {
    url
    hash
    thumbnailUrl
    __typename
  }
}

fragment ElementTile on ElementTile {
  __typename
  id
  processingState
  contentAccessibility
  createdAt
  isFeatured
  isReadyToShow
  hasIllegalReports
  ownerId
  owner {
    username
    isVerifiedProfile
    verifiedProfile {
      slug
      avatarUrl
      avatarThumbnailCropParameters {
        width
        height
        __typename
      }
      __typename
    }
    __typename
  }
  shareUrl
  originalClusterId
  generatedCaption {
    text
    __typename
  }
  source {
    ...ElementSource
    __typename
  }
  ... on MediaElementTile {
    hasMoreMedia
    multipleMedia {
      ...ElementMedia
      __typename
    }
    media {
      ...ElementMedia
      __typename
    }
    __typename
  }
  ... on ProductElementTile {
    media {
      ...ElementMedia
      __typename
    }
    productPrice: price {
      value
      currency
      __typename
    }
    productBrand: brand
    productTitle: name
    productDescription: description
    __typename
  }
  ... on WebsiteElementTile {
    media {
      ...ElementMedia
      __typename
    }
    websiteTitle: title
    websiteDescription: description
    __typename
  }
  ... on TextElementTile {
    text
    __typename
  }
}

fragment ElementMedia on Media {
  mediaId
  url
  width
  height
  notSafeForWorkStatus
  aiGenerated
  __typename
  ... on StaticImage {
    blurHash
    __typename
  }
  ... on AnimatedImage {
    blurHash
    video {
      url
      thumbnailUrl
      __typename
    }
    __typename
  }
  ... on Video {
    thumbnail {
      hash
      url
      __typename
    }
    duration
    isStored
    mux {
      playbackUrl
      mp4Url(quality: LOW)
      downloadableUrl: mp4Url(quality: HIGH)
      __typename
    }
    width
    height
    __typename
  }
  ... on Media {
    __typename
  }
}

fragment ElementSource on ElementSource {
  url
  isEditable
  isPublicDomain
  author {
    username
    fullName
    profileUrl
    avatarUrl
    __typename
  }
  __typename
}

fragment ClusterTile on Cluster {
  ...ClusterBasic
  collaboratorsCount
  numberOfElements
  collaborators {
    items {
      ...ClusterCollaborator
      isOwner
      __typename
    }
    __typename
  }
  subClusters {
    items {
      ...SubclusterPill
      __typename
    }
    meta {
      count
      __typename
    }
    __typename
  }
  __typename
}

fragment ClusterBasic on Cluster {
  id
  name
  isPublicElementsCluster
  description
  slug
  isPrivate
  ownerId
  owner {
    ...UserPublicProfile
    isFollowed(followerId: $userId) @include(if: $isLoggedIn)
    __typename
  }
  coverImageElementId
  coverImageUrl
  isFollowed(userId: $userId) @include(if: $isLoggedIn)
  isFeatured
  parentClusterId
  isPinnedToUserProfile(userId: $userId) @include(if: $isLoggedIn)
  numberOfElements
  cover {
    notSafeForWorkStatus
    url
    blurHash
    width
    height
    aiGenerated
    ... on AnimatedImage {
      video {
        url
        thumbnailUrl
        __typename
      }
      __typename
    }
    __typename
  }
  collaborators {
    items {
      ...ClusterCollaborator
      isOwner
      status
      __typename
    }
    __typename
  }
  __typename
}

fragment ClusterCollaborator on Collaborator {
  userId
  collaboratorPublicProfile {
    ...UserPublicProfile
    __typename
  }
  __typename
}

fragment SubclusterPill on Cluster {
  id
  name
  slug
  numberOfElements
  coverImageUrl
  cover {
    url
    width
    height
    blurHash
    notSafeForWorkStatus
    aiGenerated
    __typename
  }
  owner {
    id
    username
    __typename
  }
  isPrivate
  collaboratorsCount
  collaborators {
    items {
      ...ClusterCollaborator
      isOwner
      status
      __typename
    }
    __typename
  }
  __typename
}

fragment TrendingSearch on SavedSearch {
  searchTerm
  searchCategory
  coverImage {
    url
    blurHash
    notSafeForWorkStatus
    width
    height
    aiGenerated
    __typename
  }
  displayName
  __typename
}
```

## Variables (samples)
```json
[
  {
    "pageSize": 5,
    "ownerId": 100000001,
    "username": "example-user",
    "userId": 100000001,
    "sortDefinitions": [
      {
        "sortDirection": "DESC",
        "sortField": "UPDATED_AT"
      }
    ],
    "isLoggedIn": true
  },
  {
    "pageSize": 5,
    "ownerId": 100000001,
    "username": "example-user",
    "userId": 100000001,
    "sortDefinitions": [
      {
        "sortDirection": "DESC",
        "sortField": "UPDATED_AT"
      }
    ],
    "isLoggedIn": true
  },
  {
    "pageSize": 5,
    "ownerId": 100000001,
    "username": "example-user",
    "userId": 100000001,
    "sortDefinitions": [
      {
        "sortDirection": "DESC",
        "sortField": "UPDATED_AT"
      }
    ],
    "isLoggedIn": true
  }
]
```

## Response shape
```json
"null"
```
