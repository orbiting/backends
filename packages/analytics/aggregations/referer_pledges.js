const Mysql = require('../lib/Mysql')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const Referer = require('../lib/Referer')
const Promise = require('bluebird')
const { Collector: PledgeCollector } = require('./lib/Pledge')

const TS_TABLE = 'referer_pledges'
const REDIS_KEY_PREFIX = `analytics:${TS_TABLE}:countedPledgeIds`

const insert = async (startDate, endDate, context) => {
  const { pgdbTs, redis } = context

  await PledgeCollector().loadInitialData()

  await Mysql.stream(`
    SELECT
      v.idvisitor,
      v.idvisit,
      v.referer_type,
      v.referer_url,
      v.referer_name,
      v.custom_dimension_1 as roles,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'idvisitor', ci.idvisitor,
          'idorder', ci.idorder,
          'server_time', ci.server_time
        )
      ) as conversion_items,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', a.idlink_va,
          'idvisitor', a.idvisitor,
          'idaction_url', a.idaction_url,
          'idaction_url_ref', a.idaction_url_ref,
          'server_time', a.server_time,
          'time_spent', a.time_spent,
          'time_spent_ref_action', a.time_spent_ref_action
        )
      ) as actions
    FROM piwik_log_visit v
    LEFT JOIN piwik_log_conversion_item ci ON v.idvisit = ci.idvisit
    LEFT JOIN piwik_log_link_visit_action a ON v.idvisit = a.idvisit
    WHERE v.idsite = 5
      AND v.visit_first_action_time >= '${startDate.toISOString()}'
      AND v.visit_first_action_time < '${endDate.toISOString()}'
      AND v.referer_type != 1
      AND v.referer_url IS NOT NULL
    GROUP BY v.idvisit`,
    null,
    async (visit) => {
      // sanitize
      const conversion_items = visit.conversion_items
        .filter(ci => !!ci.server_time) // filter nulls
        .filter((ci, i, cis) => cis.findIndex(ci2 => ci2.idorder === ci.idorder) === i) // unique
        .map(ci => {
          ci.idvisitor = Buffer.from(ci.idvisitor).toString('hex')
          return ci
        })
      const actions = visit.actions
        .filter(a => !!a.server_time) // filter nulls
        .filter((a, i, as) => as.findIndex(a2 => a2.id === a.id) === i) // unique
        .map(a => {
          a.idvisitor = Buffer.from(a.idvisitor).toString('hex')
          return a
        })

      const pledgeCollector = PledgeCollector()
      if (conversion_items.length) {
        await pledgeCollector.collect([conversion_items], true)
      }
      if (actions.length) {
        await pledgeCollector.collect([actions], false)
      }
      const pledges = pledgeCollector.getPledgesArray()

      // console.log(`num ci:${conversion_items.length} num a:${actions.length} pledges:${pledges.length}`)

      if (!pledges || !pledges.length) {
        return
      }

      const referer = Referer.getForVisit(visit)

      return Promise.map(
        pledges,
        async (pledge) => {
          if (!(await redis.setAsync(`${REDIS_KEY_PREFIX}:${pledge.id}`, 1, 'NX'))) {
            return
          }

          return pgdbTs.public[TS_TABLE].insert({
            time: pledge.createdAt,
            total: pledge.total,
            pkgName: pledge.pkgName,
            refererName: referer.name,
            refererIsCampaign: referer.isCampaign
          })
        },
        { concurrency: 10 }
      )
    },
    context
  )

  console.log(`${TS_TABLE} count`, await pgdbTs.public[TS_TABLE].count())
}

const drop = ({ pgdbTs, redis }) =>
  Promise.all([
    pgdbTs.public[TS_TABLE].delete(),
    Redis.deleteKeys(REDIS_KEY_PREFIX, redis)
  ])

module.exports = {
  insert,
  drop
}
