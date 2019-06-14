const Mysql = require('../lib/Mysql')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const Referer = require('../lib/Referer')
const moment = require('moment')

const TS_TABLE = 'referers'
const REDIS_KEY_PREFIX = `analytics:${TS_TABLE}:countedVisitIds`

const insert = async (startDate, endDate, context) => {
  const { pgdbTs } = context

  await Mysql.stream(`
    SELECT
      v.idvisitor,
      v.idvisit,
      v.referer_type,
      v.referer_url,
      v.referer_name,
      v.custom_dimension_1 as roles,
      v.visit_first_action_time
    FROM piwik_log_visit v
    WHERE v.idsite = 5
    AND v.visit_first_action_time >= '${startDate.toISOString()}'
    AND v.visit_first_action_time < '${endDate.toISOString()}'
    AND v.referer_type != 1
    AND v.referer_url IS NOT NULL
    GROUP BY v.idvisit`,
  async (visit) => {
    const referer = Referer.getForVisit(visit)

    if (['Republik-Newsletter', 'Webmail', 'Direkt / Keine Angabe'].includes(referer.name)) {
      return
    }

    // if (!(await redis.setAsync(`${REDIS_KEY_PREFIX}:${visit.idvisit}`, 1, 'NX'))) {
    //  return
    // }

    return pgdbTs.public[TS_TABLE].insert({
      time: moment(visit.visit_first_action_time),
      refererName: referer.name,
      refererIsCampaign: referer.isCampaign
      // visitorId: visit.idvisitor
    })
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
