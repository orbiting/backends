const debug = require('debug')('republik:lib:scheduler')
const Promise = require('bluebird')

const { intervalScheduler } = require('@orbiting/backend-modules-schedulers')

const { stats: { evolution: { populate: poplateCollectionsStatsEvolution } } } = require('@orbiting/backend-modules-collections')
const { stats: { evolution: { populate: populateDiscussionsStatsEvolution } } } = require('@orbiting/backend-modules-discussions')

const { populate: populateMembershipStatsEvolution } = require('./MembershipStats/evolution')
const { populate: populateMembershipStatsLastSeen } = require('./MembershipStats/lastSeen')

const countRange = require('../graphql/resolvers/MembershipStats/countRange')
const surplus = require('../graphql/resolvers/RevenueStats/surplus')

const DEFAULT_LOCK_TTL_SECS = 60 * 10 // 10 minutes

const init = async (context) => {
  debug('init')

  const schedulers = [
    await intervalScheduler.init({
      name: 'republik-scheduler-cache-collection-stats',
      context,
      runFunc: (args, context) => poplateCollectionsStatsEvolution(context),
      lockTtlSecs: DEFAULT_LOCK_TTL_SECS,
      runIntervalSecs: 60 * 60 * 8 // each 8 hours
    }),
    await intervalScheduler.init({
      name: 'republik-scheduler-cache-discussion-stats',
      context,
      runFunc: (args, context) => populateDiscussionsStatsEvolution(context),
      lockTtlSecs: DEFAULT_LOCK_TTL_SECS,
      runIntervalSecs: 60 * 60 * 8 // each 8 hours
    }),
    await intervalScheduler.init({
      name: 'republik-scheduler-cache-membership-stats',
      context,
      runFunc: (args, context) => Promise.all([
        populateMembershipStatsEvolution(context),
        populateMembershipStatsLastSeen(context)
      ]),
      lockTtlSecs: DEFAULT_LOCK_TTL_SECS,
      runIntervalSecs: 60 * 60 // each hour
    }),
    await intervalScheduler.init({
      name: 'republik-scheduler-cache-misc',
      context,
      runFunc: (args, context) => Promise.all([
        countRange(null, { min: '2020-02-29T23:00:00Z', max: '2020-03-31T23:00:00Z', forceRecache: true }, context),
        surplus(null, { min: '2019-12-01', forceRecache: true }, context)
      ]),
      lockTtlSecs: 10,
      runIntervalSecs: 60
    })
  ]

  const close = async () => {
    await Promise.each(schedulers, scheduler => scheduler.close())
  }

  return {
    close
  }
}

module.exports = {
  init
}
