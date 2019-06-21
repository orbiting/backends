const { cache } = require('./redisCache')

const pledgesCache = cache('pledges', async ({ pgdb }) => {
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
  return pledges
})

const urlActionsCache = cache('urlActions', async ({ mysql }) => {
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
  return urlActions
})

const redirectionsCache = cache('redirections', async ({ pgdb }) => {
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
  return redirections
})

const actionUrlDocumentMapCache = cache('actionUrlDocumentMap', async (context) => {
  const urlActions = await urlActionsCache.get(context)
  const redirections = await redirectionsCache.get(context)

  // https://api.republik.ch/graphiql/?query=%7B%0A%20%20documents(first%3A%204000)%20%7B%0A%20%20%20%20totalCount%0A%20%20%20%20pageInfo%20%7B%0A%20%20%20%20%20%20hasNextPage%0A%20%20%20%20%7D%0A%20%20%20%20nodes%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20path%0A%20%20%20%20%20%20%20%20template%0A%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20publishDate%0A%20%20%20%20%20%20%20%20feed%0A%20%20%20%20%20%20%20%20credits%0A%20%20%20%20%20%20%20%20series%20%7B%0A%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20format%20%7B%0A%20%20%20%20%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D%0A
  const documents = require('./prefetched_data/documents.json').data.documents.nodes
  //.filter(doc => doc.meta.template === 'article')

  // https://github.com/orbiting/backends/pull/243/files#diff-335c7871f7372e6ad6cdfc13f0a993b7
  const getCurrentPath = path => {
    let currentPath = path
    let redirection
    while (redirection = redirections.find(r => r.source === currentPath)) {
      currentPath = redirection.target
    }
    return currentPath
  }

  const result = urlActions.reduce((agg, d) => {
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
  console.log('doc actions', Object.keys(result).length)

  return result
})

const { parse } = require('url')
const actionUrlPledgeMapCache = cache('actionUrlPledgeMap', async (context) => {
  const urlActions = await urlActionsCache.get(context)
  const pledges = await pledgesCache.get(context)

  const actionUrlPledgeMap = urlActions.reduce((agg, { idaction, name: url }) => {
    const parsedUrl = parse(url.replace('republik.ch', ''), true)
    if (parsedUrl.query.id) {
      const pledgeId = parsedUrl.query.id
      const pledge = pledges.find(p => p.id === pledgeId)
      agg[idaction] = pledge
    }
    return agg
  }, {})
  console.log('actionUrlPledgeMap:', Object.keys(actionUrlPledgeMap).length)
  return actionUrlPledgeMap
})

module.exports = {
  pledges: pledgesCache,
  actionUrlDocumentMap: actionUrlDocumentMapCache,
  actionUrlPledgeMap: actionUrlPledgeMapCache
}
