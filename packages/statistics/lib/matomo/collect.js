const debug = require('debug')('statistics:lib:matomo:collect')
const Promise = require('bluebird')
const url = require('url')

const EXCEPTIONAL_PATHNAMES = [
  '/',
  '/feuilleton',
  '/feed',
  '/rubriken',
  '/suche',
  '/verlag',
  '/lesezeichen',
  '/2018',
  '/2019'
]

const getPageUrlDetails = async ({ url }, { idSite, period, date, segment, matomo } = {}) => {
  return matomo.api({
    idSite,
    expanded: 1,
    limitBeforeGrouping: 1000,
    period,
    date,
    segment,

    actionName: url,

    // Not to overwrite (1)
    method: 'Transitions.getTransitionsForAction',
    actionType: 'url'
  })
}

const isPageUrlWanted = ({ url, parsedUrl }) => {
  if (parsedUrl && EXCEPTIONAL_PATHNAMES.includes(parsedUrl.pathname)) {
    return true
  }

  // Include user pages (/~<username>)
  if (url && url.match(/\/~.+/)) {
    return true
  }

  // Include format pages (/format/<format>)
  if (url && url.match(/\/format\/.*/)) {
    return true
  }

  // Include article pages but newsletters (and misspelled versions of it)
  if (url && url.match(/\/\d{4}\/\d{2}\/\d{2}\/.*$/) && !url.match(/-news?lew?tter/)) {
    return true
  }

  debug(`Unwanted page URL: "${url}"`)
  return false
}

const addBucket = (buckets, name, number = 0) => {
  if (!buckets[name]) {
    buckets[name] = 0
  }

  buckets[name] += number
}

const transformPageUrlDetails = ({ pageMetrics, previousPages, referrers }) => {
  const buckets = {}

  previousPages.map(({ referrals }) => {
    addBucket(buckets, 'previousPages.referrals', parseInt(referrals))
  })

  referrers.map(referrer => {
    const { shortName, visits, details = [] } = referrer

    // Matomo will return shortName "Direct Entry" instead of "direct" of there is
    // no visitiational data available.
    // @TODO: Report Bug to https://github.com/matomo-org/matomo
    if (shortName === 'Direct Entry' && visits === 0) {
      return
    }

    addBucket(buckets, `${shortName}.visits`, visits)
    addBucket(buckets, `${shortName}.referrals`)

    // An array with details e.g. Social Media
    details.map(detail => {
      const { label, referrals } = detail

      addBucket(buckets, `${shortName}.referrals`, parseInt(referrals))

      if (shortName === 'campaign' && label.match(/^republik\/news?lew?tter-editorial.+/)) {
        addBucket(buckets, 'campaign.newsletter.referrals', parseInt(referrals))
      }

      if (
        shortName === 'social' &&
        ['twitter', 'facebook', 'instagram', 'linkedin'].includes(label.toLowerCase())
      ) {
        addBucket(buckets, `${shortName}.${label.toLowerCase()}.referrals`, parseInt(referrals))
      }
    })
  })

  return { ...pageMetrics, ...buckets }
}

const getData = async ({ idSite, period, date, segment }, { matomo }) => {
  const data = []

  await matomo.scroll({
    idSite,
    method: 'Actions.getPageUrls',
    period,
    date,
    segment,
    flat: 1,
    enhanced: 1
  }, {
    limit: 10,
    rowCallback: async node => {
      node.parsedUrl = node.url && url.parse(node.url)
      if (!isPageUrlWanted(node)) {
        return false
      }

      const details = await getPageUrlDetails(node, { idSite, period, date, segment, matomo })
      if (!details) {
        return false
      }

      const transformedDetails = await transformPageUrlDetails(details, { period, date })

      const pageUrl = url.format(Object.assign({}, node.parsedUrl, { search: null, hash: null }))
      const result = { idSite, period, date, segment, url: pageUrl, ...transformedDetails }

      const index = data.findIndex(row => row.url === pageUrl)

      if (index > -1) {
        const dupe = Object.assign({}, data[index])

        Object.keys(result).forEach(key => {
          if (dupe[key] && typeof dupe[key] === 'number') {
            dupe[key] += result[key]
          } else {
            dupe[key] = result[key]
          }
        })

        data[index] = dupe

        debug(`merged page URL ${node.url} data into ${pageUrl}`)
      } else {
        // New, no merge required.
        data.push(result)
        debug(`added data for page URL ${pageUrl}`)
      }
    }
  })

  return data
}

const insertRows = async ({ rows = [], pgdb }) =>
  Promise.map(rows, async row => {
    const condition = { url: row.url, period: row.period, date: row.date, segment: row.segment }
    const hasRow = !!(await pgdb.public.statisticsMatomo.count(condition, { skipUndefined: true }))
    if (hasRow) {
      await pgdb.public.statisticsMatomo.update(
        condition,
        { ...row, updatedAt: new Date() },
        { skipUndefined: true }
      )
    } else {
      await pgdb.public.statisticsMatomo.insert(
        row,
        { skipUndefined: true }
      )
    }
  }, { concurrency: 1 })

const collect = async ({ idSite, period, date, segment }, { pgdb, matomo }) => {
  debug('collect %o', { idSite, period, date, segment })
  const rows = await getData({ idSite, period, date, segment }, { matomo })
  await insertRows({ rows, pgdb })
  debug('done with %o', { idSite, period, date, segment, rows: rows.lengt })
}

module.exports = collect
