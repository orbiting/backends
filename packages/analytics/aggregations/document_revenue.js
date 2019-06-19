const Mysql = require('../lib/Mysql')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const Referer = require('../lib/Referer')
const Promise = require('bluebird')
const moment = require('moment')
const { descending } = require('d3-array')
const uniqBy = require('lodash/uniqBy')
const { parse } = require('url')

const TS_TABLE = 'document_revenue'
const REDIS_KEY_PREFIX = `analytics:${TS_TABLE}:countedPledgeIds`

// https://api.republik.ch/graphiql/?query=%7B%0A%20%20documents(first%3A%204000)%20%7B%0A%20%20%20%20totalCount%0A%20%20%20%20pageInfo%20%7B%0A%20%20%20%20%20%20hasNextPage%0A%20%20%20%20%7D%0A%20%20%20%20nodes%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20path%0A%20%20%20%20%20%20%20%20template%0A%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20publishDate%0A%20%20%20%20%20%20%20%20feed%0A%20%20%20%20%20%20%20%20credits%0A%20%20%20%20%20%20%20%20series%20%7B%0A%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20format%20%7B%0A%20%20%20%20%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D%0A

const documents = require('./prefetched_data/documents.json').data.documents.nodes
// .filter(doc => doc.meta.template === 'article')

const actionTimeWithinPledgeTime = (actionTime, pledgeCreatedAt) => {
  const minCreatedAt = moment(pledgeCreatedAt).subtract(24, 'hours')
  const maxCreatedAt = moment(pledgeCreatedAt).add(24, 'hours')
  const itemCreatedAt = moment(actionTime)
  if (itemCreatedAt.isBetween(minCreatedAt, maxCreatedAt, null, '[]')) {
    return true
  }
  // console.log('conversion_items out of timerange', {
  //  diff: moment(pledgeCreatedAt).from(itemCreatedAt)
  // })
  return false
}

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

  const actionUrlPledgeMap = urlActions.reduce((agg, { idaction, name: url }) => {
    const parsedUrl = parse(url.replace('republik.ch', ''), true)
    if (parsedUrl.query.id) {
      const pledgeId = parsedUrl.query.id
      const pledge = pledges.find(p => p.id === pledgeId)
      agg[idaction] = pledge
    }
    return agg
  }, {})
  console.log('actionUrlPledgeMap:', Object.keys(actionUrlPledgeMap).length)

  // type = action or conversion_item
  const getPledgesForLog = (type, array) => Promise.map(
    array,
    async (item) => {
      const pledge = type === 'action'
        ? actionUrlPledgeMap[item.idaction_url]
        : pledges.find(p => p.id === item.idorder)

      if (!pledge) {
        return
      }

      // server_time for action and conversion_item
      if (!actionTimeWithinPledgeTime(item.server_time, pledge.createdAt)) {
        return
      }

      if (!(await redis.setAsync(`${REDIS_KEY_PREFIX}:${type}:${pledge.id}`, 1, 'NX'))) {
        return
      }

      return pledge
    },
    { concurrency: 10 }
  ).then(arr => arr.filter(Boolean))

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
    LEFT JOIN visitor_conversion_items ci ON vids.idvisitor = ci.idvisitor
    JOIN visitor_actions va ON vids.idvisitor = va.idvisitor
    `,
  async (visitor) => {
    const conversionItemsPledges = visitor.conversion_items && visitor.conversion_items.length
      ? await getPledgesForLog('conversion_item', visitor.conversion_items)
      : []
    const actionPledges = visitor.actions && visitor.actions.length
      ? await getPledgesForLog('action', visitor.actions)
      : []

    const visitorPledges = uniqBy([...conversionItemsPledges, ...actionPledges], (p) => p.id)

    /*
    if (visitorPledges.length) {
      console.log({
        numCIPledges: conversionItemsPledges.length,
        numAPledges: actionPledges.length,
        numVisitorPledges: visitorPledges.length
      })
    }
    */

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
              pledge.pkgName,
              pledge.total,
              'revenue_closest',
              context
            )

            let checkSum = 0
            const numMaxActions = 100
            const hopActions = actions.slice(0, numMaxActions)
            const numActions = hopActions.length
            // const scoreTotal = (numActions * (numActions + 1) / 2)
            // https://www.wolframalpha.com/input/?i=sum+k+%C2%B2
            const scoreTotal = (1 / 6) * numActions * (numActions + 1) * (2 * numActions + 1)
            await Promise.each(
              hopActions,
              (action, index) => {
                // const revenue_hops = Math.round(pledge.total * ((numActions - index)/scoreTotal))
                const revenue_hops = pledge.total * (Math.pow(numActions - index, 2) / scoreTotal)
                // console.log({ index, revenue_hops, total: pledge.total})
                checkSum += revenue_hops
                return addToDocumentsField(
                  action.doc.meta,
                  pledge.pkgName,
                  Math.round(revenue_hops),
                  'revenue_hops',
                  context
                )
              }
            )
            // if (pledge.total !== checkSum) {
            //  console.log(`sum invalid total:${pledge.total} checkSum:${checkSum} diff:${checkSum-pledge.total}`)
            // }
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

const addToDocumentsField = ({ title, path }, pkgName, value, fieldName, { pgdbTs }) =>
  pgdbTs.query(`
    INSERT INTO documents (title, path, pkg_name, ${fieldName})
    VALUES (:title, :path, :pkgName, :value)
    ON CONFLICT (path, pkg_name) DO UPDATE
      SET ${fieldName} = documents.${fieldName} + EXCLUDED.${fieldName}
  `, {
    title: title || path,
    path,
    pkgName,
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
