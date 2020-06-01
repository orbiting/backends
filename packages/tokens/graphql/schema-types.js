module.exports = `

type Token {
  id: ID!
  email: String
  sessionId: String
  createdAt: DateTime
  updatedAt: DateTime
  expiresAt: DateTime
  isActive: Boolean
}
`
