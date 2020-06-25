const Promise = require('bluebird')

const surplus = require('../../../../graphql/resolvers/RevenueStats/surplus')
const { populate: membershipStatsPopulate } = require('../../../../lib/MembershipStats/evolution')

module.exports = (args, context) =>
  Promise.all([
    surplus(null, { min: '2019-12-01', forceRecache: true }, context),
    membershipStatsPopulate(context)
  ])
