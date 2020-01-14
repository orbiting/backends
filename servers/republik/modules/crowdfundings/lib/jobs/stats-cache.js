const Promise = require('bluebird')

const surplus = require('../../../../graphql/resolvers/RevenueStats/surplus')
const evolution = require('../../../../graphql/resolvers/MembershipStats/evolution')

module.exports = (args, context) =>
  Promise.all([
    surplus(null, { min: '2019-12-01', forceRecache: true }, context),
    evolution(null, { min: '2019-12', max: '2020-03', forceRecache: true }, context)
  ])
