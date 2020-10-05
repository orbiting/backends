module.exports = `

scalar DateTime
scalar JSON

type Series {
  title: String!
  episodes: [Episode!]!
}

type Episode {
  title: String
  label: String
  image: String
  publishDate: DateTime
  document: Document
}

type AudioSource implements PlayableMedia {
  mediaId: ID!
  mp3: String
  aac: String
  ogg: String
  durationMs: Int!
}

type Podcast {
  podigeeSlug: String
  spotifyUrl: String
  googleUrl: String
  appleUrl: String
}

type Newsletter {
  name: String
  free: Boolean
}

type Meta {
  title: String
  shortTitle: String
  slug: String
  path: String
  image: String
  emailSubject: String
  description: String
  subject: String
  facebookTitle: String
  facebookImage: String
  facebookDescription: String
  twitterTitle: String
  twitterImage: String
  twitterDescription: String
  prepublication: Boolean
  publishDate: DateTime
  lastPublishedAt: DateTime
  feed: Boolean
  gallery: Boolean
  kind: String
  color: String
  series: Series
  section: Document
  format: Document
  dossier: Document
  staticPage: Document

  credits: JSON
  audioSource: AudioSource
  podcast: Podcast

  newsletter: Newsletter

  estimatedReadingMinutes: Int
  totalMediaMinutes: Int
  estimatedConsumptionMinutes: Int

  # template of the article
  template: String

  indicateChart: Boolean
  indicateGallery: Boolean
  indicateVideo: Boolean
}

input DocumentInput {
  # AST of /article.md
  content: JSON!
}

type Document {
  id: ID!
  repoId: ID!
  # AST of /article.md
  content: JSON!
  meta: Meta!
  children(
    first: Int
    last: Int
    before: ID
    after: ID
    only: ID
  ): DocumentNodeConnection!
  linkedDocuments(
    first: Int
    last: Int
    before: ID
    after: ID
    feed: Boolean
  ): DocumentConnection!

  embeds(types: [EmbedType!]): [Embed!]!
}

type DocumentNode {
  id: ID!
  body: JSON!
}

type DocumentNodePageInfo {
  endCursor: String
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
}

type DocumentNodeConnection {
  nodes: [DocumentNode!]!
  pageInfo: DocumentNodePageInfo!
  totalCount: Int!
}

type DocumentConnection {
  nodes: [Document!]!
  pageInfo: DocumentPageInfo!
  totalCount: Int!
}

extend type User {
  documents(
    feed: Boolean
    first: Int
    last: Int
    before: String
    after: String
  ): DocumentConnection!
}

type DocumentPageInfo {
  endCursor: String
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
}

interface PlayableMedia {
  mediaId: ID!
  durationMs: Int!
}
`
