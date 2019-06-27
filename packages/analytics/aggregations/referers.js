const Mysql = require('../lib/Mysql')
const Referer = require('./lib/Referer')
const moment = require('moment')

const TS_TABLE = 'referers'

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
  null,
  async (visit) => {
    const referer = Referer.getForVisit(visit)

    if (![
      'Republik-Newsletter',
      'Webmail',
      'Direkt / Keine Angabe'
    ].includes(referer.name)) {
      return pgdbTs.public[TS_TABLE].insert({
        time: moment(visit.visit_first_action_time),
        refererName: referer.name,
        refererIsCampaign: referer.isCampaign
      })
    }
  },
  context
  )

  console.log(`${TS_TABLE} count`, await pgdbTs.public[TS_TABLE].count())
}

const drop = ({ pgdbTs, redis }) =>
  Promise.all([
    pgdbTs.public[TS_TABLE].delete()
  ])

module.exports = {
  insert,
  drop
}
