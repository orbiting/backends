const debug = require('debug')('crowdfundings:lib:scheduler')
const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const { intervalScheduler } = require('@orbiting/backend-modules-schedulers')

const surplus = require('../../../../graphql/resolvers/RevenueStats/surplus')
const { populate: populateMembershipStatsEvolution } = require('../../../../lib/MembershipStats/evolution')
const countRange = require('../../../../graphql/resolvers/MembershipStats/countRange')

const init = async (context) => {
  debug('init')

  const pgdb = await PgDb.connect()
  const redis = Redis.connect()
  const context = {
    ..._context,
    pgdb,
    redis
  }

  const schedulers = [
    // stats-cache scheduler
    // @TODO: Keep or move elsewhere
    intervalScheduler.init({
      name: 'stats-cache',
      context,
      runFunc: (args, context) =>
        Promise.all([
          surplus(null, { min: '2019-12-01', forceRecache: true }, context),
          populateMembershipStatsEvolution(context),
          countRange(null, { min: '2020-02-29T23:00:00Z', max: '2020-03-31T23:00:00Z', forceRecache: true }, context)
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
