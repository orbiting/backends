const Mysql = require('../lib/Mysql')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const Referer = require('../lib/Referer')
const Promise = require('bluebird')
const moment = require('moment')
const { descending } = require('d3-array')

const TS_TABLE = 'document_revenue'
const REDIS_KEY_PREFIX = `analytics:${TS_TABLE}:countedPledgeIds`

// https://api.republik.ch/graphiql/?query=%7B%0A%20%20documents(first%3A%204000)%20%7B%0A%20%20%20%20totalCount%0A%20%20%20%20pageInfo%20%7B%0A%20%20%20%20%20%20hasNextPage%0A%20%20%20%20%7D%0A%20%20%20%20nodes%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20path%0A%20%20%20%20%20%20%20%20template%0A%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20publishDate%0A%20%20%20%20%20%20%20%20feed%0A%20%20%20%20%20%20%20%20credits%0A%20%20%20%20%20%20%20%20series%20%7B%0A%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20format%20%7B%0A%20%20%20%20%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D%0A

const documents = require('./prefetched_data/documents.json').data.documents.nodes
// .filter(doc => doc.meta.template === 'article')

const insert = async (startDate, endDate, context) => {
  const { pgdb, pgdbTs, redis, mysql } = context

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

  const [ urlActions ] = await mysql.promise().query(`
    SELECT
      idaction,
      name
    FROM
      piwik_log_action
    WHERE
      type = 1
      -- AND name LIKE 'republik.ch/konto%'
  `)
  console.log('urlActions count:', urlActions.length)

  const redirections = await pgdb.query(`
    SELECT
      source,
      target
    FROM
      redirections
    WHERE
      "deletedAt" is null
    ORDER BY
      "createdAt" ASC
  `)
  console.log('redirections count:', redirections.length)

  // https://github.com/orbiting/backends/pull/243/files#diff-335c7871f7372e6ad6cdfc13f0a993b7
  const getCurrentPath = path => {
    let currentPath = path
    let redirection
    while (redirection = redirections.find(r => r.source === currentPath)) {
      currentPath = redirection.target
    }
    return currentPath
  }

  const actionUrlDocumentMap = urlActions.reduce((agg, d) => {
    if (d.name.startsWith('republik.ch')) {
      let path = getCurrentPath(
        d.name
          .replace('republik.ch', '')
          .split('?')[0]
      )
      const doc = documents.find(d => d.meta.path === path)
      if (doc) {
        agg[d.idaction] = doc
      }
    }
    return agg
  }, {})
  console.log('doc actions', Object.keys(actionUrlDocumentMap).length)

  await Mysql.stream(`
    WITH
      visitor_ids AS (
        SELECT
          v.idvisitor as idvisitor
        FROM piwik_log_visit v
        WHERE v.idsite = 5
        AND v.referer_type != 1
        AND v.referer_url IS NOT NULL
        GROUP BY v.idvisitor
        HAVING
          MIN(v.visit_first_action_time) >= '${startDate.toISOString()}'
          AND MIN(v.visit_first_action_time) < '${endDate.toISOString()}'
      ),
      visitor_conversion_items AS (
        SELECT
          ci.idvisitor,
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
        FROM piwik_log_conversion_item ci
        WHERE ci.idvisitor = ANY(SELECT idvisitor FROM visitor_ids)
        GROUP BY ci.idvisitor
      ),
      visitor_actions AS (
        SELECT
          va.idvisitor,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'idaction_url', va.idaction_url,
              'idaction_url_ref', va.idaction_url_ref,
              'server_time', va.server_time,
              'time_spent', va.time_spent,
              'time_spent_ref_action', va.time_spent_ref_action
            )
          ) as actions
        FROM piwik_log_link_visit_action va
        WHERE va.idvisitor = ANY(SELECT idvisitor FROM visitor_ids)
        GROUP BY va.idvisitor
      )
    SELECT
      vids.idvisitor,
      ci.conversion_items,
      va.actions
    FROM visitor_ids vids
    JOIN visitor_conversion_items ci ON vids.idvisitor = ci.idvisitor
    JOIN visitor_actions va ON vids.idvisitor = va.idvisitor
    `,
  async (visitor) => {
    let visitorPledges = []
    await Promise.each(
      visitor.conversion_items,
      async (ci) => {
        const pledge = pledges.find(p => p.id === ci.idorder)
        if (!pledge) {
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

        visitorPledges.push(pledge)
      },
      { concurrency: 10 }
    )

    if (visitorPledges.length > 0) {
      await Promise.each(
        visitorPledges,
        async (pledge) => {
          const pledgeCreatedAt = moment(pledge.createdAt)

          // let minDateDiffMs = Number.MAX_SAFE_INTEGER
          // let maxDateDiffMs = Number.MIN_SAFE_INTEGER
          const actions = visitor.actions
            .filter(action => moment(action.server_time).isBefore(pledgeCreatedAt))
            .map(action => ({
              ...action,
              doc: actionUrlDocumentMap[action.idaction_url],
              createdAt: moment(action.server_time)
            }))
            .filter(
              action =>
                !!action.doc &&
                  action.doc.meta.path !== '/' &&
                  action.doc.meta.path !== '/feuilleton' &&
                  action.doc.meta.path !== '/verlag'
            )
            .sort((a, b) => descending(a.createdAt, b.createdAt))
          // .forEach( action => {
          //  const diff = pledgeCreatedAt.diff(moment(action.server_time))
          //  minDateDiffMs = Math.min(minDateDiffMs, diff)
          //  maxDateDiffMs = Math.max(maxDateDiffMs, diff)
          // })

          if (actions.length > 0) {
            await addToDocumentsField(
              actions[0].doc.meta,
              'revenue_closest',
              pledge.total,
              context
            )

            let checkSum = 0
            const numMaxActions = 100
            const hopActions = actions.slice(0, numMaxActions)
            const numActions = hopActions.length
            const scoreTotal = (numActions * (numActions + 1) / 2)
            await Promise.each(
              hopActions,
              (action, index) => {
                const revenue_hops = Math.round(pledge.total * ((numActions - index)/scoreTotal))
                //console.log({ index, revenue_hops, total: pledge.total})
                checkSum += revenue_hops
                return addToDocumentsField(
                  action.doc.meta,
                  'revenue_hops',
                  revenue_hops,
                  context
                )
              }
            )
            //if (pledge.total !== checkSum) {
            //  console.log(`sum invalid total:${pledge.total} checkSum:${checkSum} diff:${checkSum-pledge.total}`)
            //}
          }
        },
        { concurrency: 10 }
      )
    }
  },
  context,
  true
  )

  // console.log(`${TS_TABLE} count`, await pgdbTs.public[TS_TABLE].count())
}

const addToDocumentsField = ({ title, path }, fieldName, value, { pgdbTs }) =>
  pgdbTs.query(`
    INSERT INTO documents (title, path, ${fieldName})
    VALUES (:title, :path, :value)
    ON CONFLICT (path) DO UPDATE
      SET ${fieldName} = documents.${fieldName} + EXCLUDED.${fieldName}
  `, {
    title: title || path,
    path,
    value
  })

const drop = ({ pgdbTs, redis }) =>
  Promise.all([
    // pgdbTs.public[TS_TABLE].delete(),
    pgdbTs.public.documents.delete(),
    Redis.deleteKeys(REDIS_KEY_PREFIX, redis)
  ])

module.exports = {
  insert,
  drop
}
