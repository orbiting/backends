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

type PackageLabels {
  title: String!
  description: String!
  cta: String!
}

extend type Package {
  labels: PackageLabels
}

`
