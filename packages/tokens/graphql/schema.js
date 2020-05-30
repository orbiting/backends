module.exports = `
schema {
  query: queries
}

type queries {
  tokens(email: String!, skip: Int, take: Int): [Token!]!
}
`
