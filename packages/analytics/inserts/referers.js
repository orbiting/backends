const Mysql = require('../lib/Mysql')
const Referer = require('../lib/Referer')
const Promise = require('bluebird')
const moment = require('moment')

module.exports = async (startDate, endDate, context) => {
  const { pgdb, pgdbTs } = context

  const pledges = await pgdb.query(`
    SELECT
      p.id AS id,
      p."createdAt" AS "createdAt",
      p.total AS total,
      pkg.name AS "pkgName"
    FROM
      pledges p
    JOIN packages pkg
      ON p."packageId" = pkg.id
  `)
  console.log('pledges count:', pledges.length)

  const countedPledgeIds = {}

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
          'idorder', ci.idorder,
          'price', ci.price,
          'quantity', ci.quantity,
          'idaction_name', ci.idaction_name,
          'idaction_sku', ci.idaction_sku,
          'server_time', ci.server_time
        )
      ) as conversion_items
    FROM piwik_log_visit v
    JOIN piwik_log_conversion_item ci ON v.idvisit = ci.idvisit
    WHERE v.idsite = 5
    AND ci.server_time > '${startDate.toISOString()}'
    AND ci.server_time <= '${endDate.toISOString()}'
    GROUP BY v.idvisit`,
  async (visit) => {
    const referer = Referer.getForVisit(visit)

    return Promise.each(
      visit.conversion_items,
      async (ci) => {
        const pledge = pledges.find(p => p.id === ci.idorder)
        if (!pledge) {
          // console.log('pledge not found')
          return
        }
        if (countedPledgeIds[pledge.id]) {
          return
        }

        const minCreatedAt = moment(pledge.createdAt).subtract(24, 'hours')
        const maxCreatedAt = moment(pledge.createdAt).add(24, 'hours')
        const itemCreatedAt = moment(ci.server_time)
        if (!itemCreatedAt.isBetween(minCreatedAt, maxCreatedAt, null, '[]')) {
          // console.log('conversion_items out of timerange', {
          //  diff: moment(pledge.createdAt).from(itemCreatedAt)
          // })
          return
        }

        countedPledgeIds[pledge.id] = 1

        return pgdbTs.public.referer_pledges.insert({
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

  console.log('referer_pledges count', await pgdbTs.public.referer_pledges.count())
}
