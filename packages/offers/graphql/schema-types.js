module.exports = `

type Offer {
  id: ID!
  status: OfferStatus
  packages: [Package!]!
}

type OfferStatus {
  id: ID!
  label: String!
  description: String!
}

extend type User {
  offer: Offer!
}

`
