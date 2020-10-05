module.exports = `

schema {
  query: queries
}

type queries {
  # (pre)published documents
  documents(
    feed: Boolean
    # not used
    dossier: String
    format: String
    formats: [String!]
    repoIds: [ID!]
    section: String
    template: String
    staticPage: String
    hasDossier: Boolean
    hasFormat: Boolean
    hasSection: Boolean
    hasStaticPage: Boolean
    first: Int
    last: Int
    before: String
    after: String
  ): DocumentConnection!
  # (pre)published document
  document(path: String!): Document
}
`
