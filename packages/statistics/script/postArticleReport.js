#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('statistics:script:postReport')
const moment = require('moment')
const yargs = require('yargs')
const Promise = require('bluebird')
const mdastToString = require('mdast-util-to-string')
const { descending } = require('d3-array')

const PgDb = require('@orbiting/backend-modules-base/lib/pgdb')
const { publish: { postMessage } } = require('@orbiting/backend-modules-slack')
const elastic = require('@orbiting/backend-modules-base/lib/elastic').client()

const getMeta = require('../lib/elastic/documents')

moment.locale('de-CH')

const argv = yargs
  .option('date', {
    alias: 'd',
    coerce: moment
  })
  .option('relativeDate', {
    describe: 'ISO 8601 Time Interval e.g. P14D',
    alias: 'r',
    coerce: input => {
      return moment().subtract(moment.duration(input))
    },
    conclicts: ['date']
  })
  .option('limit', {
    alias: 'l',
    number: true,
    default: 8
  })
  .option('index-year', {
    describe: 'Use <index-year>\'s median e.g. 2018',
    alias: 'y',
    default: moment().subtract(1, 'year').format('YYYY'),
    coerce: v => moment(`${v}-01-01`)
  })
  .option('channel', {
    describe: 'Slack-Channel or user to post report to',
    alias: 'c',
    default: '#statistik'
  })
  .option('dry-run', {
    describe: 'Disable dry run to post to Slack',
    boolean: true,
    default: true
  })
  .check(argv => {
    if (!argv.date && !argv.relativeDate) {
      return `Check options. Either provide date, or relative date.`
    }

    return true
  })
  .help()
  .version()
  .argv

/**
 * Fetches index for a particular year.
 */
const getMatomoIndex = async ({ year, segment = 'null', groupBy = 'url' }, { pgdb }) => {
  const index = await pgdb.public.statisticsIndexes.findOne({
    type: 'matomo',
    condition: `date:${year.format('YYYY')},segment:${segment},groupBy:${groupBy}`
  })

  return index.data
}

/**
 * Data per URL
 */

const getUrls = async ({ date, limit }, { pgdb }) => {
  const urlsOnDate = await pgdb.query(`
    SELECT
      sm.url,
      sm.date,
      sm."publishDate",
      ('${date.format('YYYY-MM-DD')}' - sm."publishDate"::date) + 1 AS "daysPublished"

    FROM "statisticsMatomo" sm
    WHERE
      sm."publishDate" BETWEEN '${date.format('YYYY-MM-DD')}' AND '${date.clone().add(1, 'day').format('YYYY-MM-DD')}'
      AND sm.date = '${date.format('YYYY-MM-DD')}'
      AND sm.segment IS NULL
      AND sm.template = 'article'

    ORDER BY sm."publishDate" DESC
    LIMIT :limit
  `, { limit })

  const left = limit - urlsOnDate.length

  const urlsBeforeDate = await pgdb.query(`
    SELECT
      sm.url,
      sm.date,
      sm."publishDate",
      ('${date.format('YYYY-MM-DD')}' - sm."publishDate"::date) + 1 AS "daysPublished"

    FROM "statisticsMatomo" sm
    WHERE
      sm."publishDate" < '${date.format('YYYY-MM-DD')}'
      AND sm.date = '${date.format('YYYY-MM-DD')}'
      AND sm.segment IS NULL
      AND sm.template = 'article'

    ORDER BY sm.nb_uniq_visitors DESC
    LIMIT :limit
  `, { limit: left > 0 ? left : 0 })

  return [ ...urlsOnDate, ...urlsBeforeDate ]
    .sort((a, b) => descending(a.publishDate, b.publishDate))
}

const appendStatistics = async ({ row, prop = 'unsegmented', segment = null }, { pgdb }) => {
  const url = row.url
  const date = moment(row.date)

  const fragmentSegment = segment
    ? `AND sm.segment = '${segment}'`
    : 'AND sm.segment IS NULL'

  const rows = await pgdb.query(`
    SELECT
      sm.*

    FROM "statisticsMatomo" sm
    WHERE
      url = '${url}'
      AND sm.date = '${date.format('YYYY-MM-DD')}'
      ${fragmentSegment}

    LIMIT 1
  `)

  return Object.assign({}, row, { [prop]: Object.assign({}, rows[0]) })
}

/**
 * Finds values in {row} and calculates desired percentile usind
 * provided {index}.
 */
const appendPercentiles = ({ data, index, percentile = 'p50', prop = 'p50' }) => {
  const percentiles = {}

  Object.keys(data).map(key => {
    if (index[`${key}.${percentile}`]) {
      percentiles[key] = (1 / index[`${key}.${percentile}`] * data[key])
    }
  })

  return Object.assign({}, data, { [prop]: percentiles })
}

const appendDocumentMeta = async ({ row }, { elastic }) => {
  const document = await getMeta({
    paths: [row.url.replace('https://www.republik.ch', '')]
  }, { elastic })

  return Object.assign({}, row, { document: document[0] })
}

const getBlock = ({ url, daysPublished, document, indexes, distributions }, { date }) => {
  const block = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        `*<${getUltradashboardUrlReportLink(url)}|${document.title}>*`,
        `_${mdastToString({ children: document.credits }).replace(`, ${date.format('DD.MM.YYYY')}`, '')}_` + (daysPublished > 1 ? ` (${daysPublished}. Tag)` : ''),
        `*Index ${Math.round(indexes.visitors * 100)}* ⋅ Abonnenten-Index ${Math.round(indexes.memberVisitors * 100)}`,
        'Via ' + distributions
          .sort((a, b) => descending(a.percentage, b.percentage))
          .map(({ source, percentage }) => `${source}: ${percentage}%`)
          .join(' ⋅ ')
      ].join('\n')
    }
  }

  if (document.image || document.twitterImage || document.facebookImage) {
    block.accessory = {
      type: 'image',
      image_url: document.image || document.twitterImage || document.facebookImage,
      alt_text: document.title
    }
  }

  return block
}

const getRandomQuote = async ({ pgdb }) => {
  const results = await pgdb.query(`SELECT * FROM "statisticsQuotes" ORDER BY RANDOM() LIMIT 1`)

  if (results.length !== 1) {
    return {}
  }
  const { quote, author } = results[0]
  return { quote, author }
}

const getUltradashboardDailyReportLink = (date) =>
  `https://ultradashboard.republik.ch/public/dashboard/fe40beaf-f7bb-49f1-900e-257785478f1d?datum=${date.format('YYYY-MM-DD')}`

const getUltradashboardUrlReportLink = (url) =>
  `https://ultradashboard.republik.ch/public/dashboard/aa39d4c2-a4bc-4911-8a8d-7b23a1d82425?url=${url}`

PgDb.connect().then(async pgdb => {
  const { limit, indexYear, channel, dryRun } = argv
  const date = argv.date || argv.relativeDate

  debug('Generate and post report %o', { date, limit, indexYear, dryRun })

  try {
    const index = await getMatomoIndex({ year: indexYear }, { pgdb })
    const memberIndex = await getMatomoIndex({ year: indexYear, segment: 'dimension1=@member' }, { pgdb })

    const articles = await getUrls({ date, limit }, { pgdb })
      .then(articles => Promise.map(
        articles,
        async row => appendStatistics({ row, prop: 'unsegmented' }, { pgdb })
      ))
      .then(articles => Promise.map(
        articles,
        async row => appendStatistics({ row, prop: 'segmentMember', segment: 'dimension1=@member' }, { pgdb })
      ))
      .then(articles => articles.map(row => ({
        ...row,
        unsegmented: appendPercentiles({ data: row.unsegmented, index }),
        segmentMember: appendPercentiles({ data: row.segmentMember, index: memberIndex })
      })))
      .then(articles => Promise.map(
        articles,
        async row => appendDocumentMeta({ row }, { elastic })
      ))
      .then(articles => articles.filter(({ document }) => !!document))
      .then(articles => articles.map(row => {
        const { unsegmented, segmentMember } = row

        const indexes = {
          _visitors: unsegmented.nb_uniq_visitors,
          visitors: unsegmented.p50.nb_uniq_visitors,
          _memberVisitors: segmentMember.nb_uniq_visitors,
          memberVisitors: segmentMember.p50.nb_uniq_visitors
        }

        const sources = {
          'Newsletter': unsegmented['campaign.newsletter.referrals'],
          'Kampagnen': unsegmented['campaign.referrals'] - unsegmented['campaign.newsletter.referrals'],

          'Twitter': unsegmented['social.twitter.referrals'],
          'Facebook': unsegmented['social.facebook.referrals'],
          'Instagram': unsegmented['social.instagram.referrals'],
          'LinkedIn': unsegmented['social.linkedin.referrals'],
          'andere sozialen Netwerke': unsegmented['social.referrals'] - unsegmented['social.twitter.referrals'] - unsegmented['social.facebook.referrals'] - unsegmented['social.instagram.referrals'] - unsegmented['social.linkedin.referrals'],

          'Suchmaschinen': unsegmented['search.visits'],
          'Dritt-Webseiten': unsegmented['website.referrals'],
          'Republik-Webseite': unsegmented['previousPages.referrals'],

          'Direkt': unsegmented['direct.visits']
        }

        const allSources = Object.keys(sources).reduce((acc, curr) => acc + sources[curr], 0)

        /**
         * [ { source: 'Foobar', percentage: 99.9 }, ... ]
         */
        const distributions = Object.keys(sources).map(key => {
          const ratio = 1 / allSources * sources[key]
          const percentage = Math.round(ratio * 1000) / 10

          if (percentage === 0) {
            return false
          }

          return { source: key, percentage }
        }).filter(Boolean)

        debug({ ...row, indexes, sources, distributions })

        return { ...row, indexes, sources, distributions }
      }))

    // Daily quote for amusement
    const { quote, author } = await getRandomQuote({ pgdb })

    if (!dryRun) {
      // Header
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${getUltradashboardDailyReportLink(date)}|Besucher-Tagesrapport>*\n${date.format('dddd, DD.MM.YYYY')}`
          }
        }
      ]

      if (quote && author) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `«${quote}»\n– ${author}`
          }
        })
      }

      // Articles published on <date>
      const recent = articles.filter(b => b.daysPublished === 1)
      if (recent.length > 0) {
        blocks.push({ type: 'divider' })
        blocks.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `*Beiträge von ${date.format('dddd, DD.MM.YYYY')}*`,
                `Alle Beiträge, die veröffentlicht wurden.`
              ].join('\n')
            }
          }
        )
        recent.forEach(article => blocks.push(getBlock(article, { date })))
      }

      // Earlier articles
      const earlier = articles.filter(b => b.daysPublished !== 1)
      if (earlier.length > 0) {
        blocks.push({ type: 'divider' })
        blocks.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `*Frühere Beiträge*`,
                `Einige Beiträge, die auch am ${date.format('DD.MM.')} aufgerufen, aber früher veröffentlicht wurden.`
              ].join('\n')
            }
          }
        )
        earlier.forEach(article => blocks.push(getBlock(article, { date })))
      }

      // Footer
      blocks.push({ type: 'divider' })
      blocks.push(
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Über diese Daten: Ein Index von 100 Punkten entspricht dem Median aus der Anzahl von Besuchern eines Beitrags am Veröffentlichungstag in ${indexYear.format('YYYY')}. Quellen: <https://piwik.project-r.construction|Matomo> und <https://api.republik.ch/graphiql|api.republik.ch>.`
            }
          ]
        }
      )

      await postMessage({
        channel,
        username: 'Carl Friedrich Gauß',
        icon_emoji: ':male-scientist:',
        blocks
      })
    }
  } catch (e) {
    console.error(e)
  }

  await pgdb.close()
})
