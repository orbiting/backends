module.exports = `
schema {
  mutation: mutations
}

type mutations {
  addDocumentToList(
    documentId: ID!
    listName: ID!
  ): Document!

  removeDocumentFromList(
    documentId: ID!
    listName: ID!
  ): Document


  upsertDocumentPosition(
    documentId: ID!
    percentage: Int!
    nodeId: ID!
  ): Document!

  removeDocumentPosition(
    documentId: ID!
  ): Document!


  upsertMediaPosition(
    id: ID!
    msecs: Int!
  ): MediaPosition!

  removeMediaPosition(
    id: ID!
  ): MediaPosition!
}
`
