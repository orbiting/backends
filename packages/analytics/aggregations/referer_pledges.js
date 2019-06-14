const Mysql = require('../lib/Mysql')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const Referer = require('../lib/Referer')
const Promise = require('bluebird')
const moment = require('moment')

const TS_TABLE = 'referer_pledges'
const REDIS_KEY_PREFIX = `analytics:${TS_TABLE}:countedPledgeIds`

const insert = async (startDate, endDate, context) => {
  const { pgdb, pgdbTs, redis } = context

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
    AND ci.server_time >= '${startDate.toISOString()}'
    AND ci.server_time < '${endDate.toISOString()}'
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

        const minCreatedAt = moment(pledge.createdAt).subtract(24, 'hours')
        const maxCreatedAt = moment(pledge.createdAt).add(24, 'hours')
        const itemCreatedAt = moment(ci.server_time)
        if (!itemCreatedAt.isBetween(minCreatedAt, maxCreatedAt, null, '[]')) {
          // console.log('conversion_items out of timerange', {
          //  diff: moment(pledge.createdAt).from(itemCreatedAt)
          // })
          return
        }

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
