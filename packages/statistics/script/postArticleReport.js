#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('statistics:script:postReport')
const moment = require('moment')
const yargs = require('yargs')
const Promise = require('bluebird')
const mdastToString = require('mdast-util-to-string')

const PgDb = require('@orbiting/backend-modules-base/lib/pgdb')
const { publish: { postMessage } } = require('@orbiting/backend-modules-slack')
const elastic = require('@orbiting/backend-modules-base/lib/elastic').client()

const getMeta = require('../lib/elastic/documents')

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
    default: 5
  })
  .option('index-year', {
    describe: 'Use <index-year>\'s median e.g. 2018',
    alias: 'y',
    default: moment().subtract(1, 'year').format('YYYY'),
    coerce: v => moment(`${v}-01-01`)
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
const getMatomoIndex = async ({ year, groupBy = 'url' }, { pgdb }) => {
  const index = await pgdb.public.statisticsIndexes.findOne({
    type: 'matomo',
    condition: `date:${year.format('YYYY')},segment:null,groupBy:${groupBy}`
  })

  return index.data
}

/**
 * Data for a whole day
 */
const getDay = async ({ date, segment = null }, { pgdb }) => {
  const segmentFragment = segment ? `sm.segment = '${segment}'` : 'sm.segment IS NULL'

  return pgdb.query(`
    SELECT
      SUM(sm.entries + sm."previousPages.referrals") AS "relevant"
      
    FROM "statisticsMatomo" sm
    WHERE
      sm.date >= sm."publishDate"::date
      AND sm.date = '${date.format('YYYY-MM-DD')}'
      AND ${segmentFragment}
      AND sm.template = 'article'

    GROUP BY date
  `)
}

/**
 * Data per URL
 */
const getArticles = async ({ date, limit }, { pgdb }) =>
  pgdb.query(`
    SELECT
      sm.*,
      sm.entries + sm."previousPages.referrals" AS "relevant",
      ('${date.format('YYYY-MM-DD')}' - sm."publishDate"::date) + 1 AS "daysPublished"
      
    FROM "statisticsMatomo" sm
    WHERE
      sm.date >= sm."publishDate"::date
      AND sm.date = '${date.format('YYYY-MM-DD')}'
      AND sm.segment IS NULL
      AND sm.template = 'article'
    
    ORDER BY sm.entries + sm."previousPages.referrals" DESC
    LIMIT :limit
  `, { limit })

/**
 * Finds values in {row} and calculates desired percentile usind
 * provided {index}.
 */
const appendPercentiles = ({ row, index, percentile = 'p50', prop = 'p50' }) => {
  const data = {}

  Object.keys(row).map(key => {
    if (index[`${key}.${percentile}`]) {
      data[key] = (1 / index[`${key}.${percentile}`] * row[key])
    }
  })

  return Object.assign({}, row, { [prop]: data })
}

const appendDocumentMeta = async ({ row }, { elastic }) => {
  const document = await getMeta({
    paths: [row.url.replace('https://www.republik.ch', '')]
  }, { elastic })

  return Object.assign({}, row, { document: document[0] })
}

PgDb.connect().then(async pgdb => {
  const { limit, indexYear, dryRun } = argv
  const date = argv.date || argv.relativeDate

  debug('Running query...', { date })

  try {
    /**
     * Articles
     */
    const index = await getMatomoIndex({ year: indexYear }, { pgdb })
    const socialIndex = await getMatomoIndex({ year: moment('2019-01-01') }, { pgdb })

    const articles = await getArticles({ date, limit }, { pgdb })
      .then(articles => articles.map(row => appendPercentiles({ row, index, prop: 'p50' })))
      .then(articles => articles.map(row => appendPercentiles({ row, index: socialIndex, prop: 'socialP50' })))
      .then(articles => Promise.map(
        articles,
        async row => appendDocumentMeta({ row }, { elastic }),
        { concurrency: 1 }
      ))
      .then(articles => articles.filter(({ document }) => !!document))

    const blocks = articles.map(article => {
      const { document, daysPublished, p50, socialP50 } = article

      const score = {
        hits: p50.relevant,
        newsletter: p50['campaign.newsletter.referrals'],
        campaigns: p50['campaign.referrals'],
        facebook: socialP50['social.facebook.referrals'],
        twitter: socialP50['social.twitter.referrals'],
        websites: p50['website.referrals']
      }

      const block = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*<https://ultradashboard.republik.ch/public/dashboard/aa39d4c2-a4bc-4911-8a8d-7b23a1d82425?url=${document.path}|${document.title}>*`,
            `_${mdastToString({ children: document.credits })}_`,
            `*${Math.round(score.hits * 100)} % des täglichen Mittels* (${daysPublished}. Tag)`,
            `via ` + [
              score.newsletter > 0 && `Newsletter: ${Math.round(score.newsletter * 100)} %`,
              score.campaigns > 0 && `Kampagne(n): ${Math.round(score.campaigns * 100)} %`,
              score.facebook > 0 && `Facebook: ${Math.round(score.facebook * 100)} %`,
              score.twitter > 0 && `Twitter: ${Math.round(score.twitter * 100)} %`,
              score.websites > 0 && `Dritte: ${Math.round(score.websites * 100)} %`
            ].filter(Boolean).join(', ')
          ].join('\n')
        }
      }

      if (document.image) {
        block.accessory = {
          type: 'image',
          image_url: document.image,
          alt_text: document.title
        }
      }

      return block
    })

    debug(JSON.stringify(blocks, null, 2))

    /**
     * Today (all article data)
     */
    const todayAllIndex = await getMatomoIndex({ year: indexYear, groupBy: 'date', segment: null }, { pgdb })
    const todayMemberIndex = await getMatomoIndex({ year: indexYear, groupBy: 'date', segment: 'dimension1=@member' }, { pgdb })

    const today = {
      all: await getDay({ date, segment: null }, { pgdb })
        .then(rows => rows.map(row => appendPercentiles({ row, index: todayAllIndex, prop: 'p50' })))
        .then(rows => rows.reduce((acc, curr) => curr)),
      member: await getDay({ date, segment: 'dimension1=@member' }, { pgdb })
        .then(rows => rows.map(row => appendPercentiles({ row, index: todayMemberIndex, prop: 'p50' })))
        .then(rows => rows.reduce((acc, curr) => curr))
    }

    today.memberRatio = 1 / today.all.relevant * today.member.relevant

    const headerMrkdwn = [
      `*Bericht zur Lage der Artikel vom ${date.format('DD.MM.YYYY')}*`,
      `Artikel-Aufrufe *${Math.round(today.all.p50.relevant * 100)} % des täglichen Mittels*`,
      `${Math.round(today.memberRatio * 100)} % angemeldete Nutzer`
    ].join('\n')

    debug({ headerMrkdwn })

    const contextMrkdwn = `Über diese Daten: Falls nicht anders vermerkt, beziehen sich die Zahlen auf das tägliche Mittel der Zugriffszahlen in ${indexYear.format('YYYY')}. Das Mittel der Zahlen aus sozialen Netzwerken basiert auf Daten von Januar bis April 2019. Alle Angaben ohne Gewähr.`

    if (!dryRun) {
      await postMessage({
        channel: '#statistik-dev',
        username: 'Carl Friedrich Gauß',
        icon_emoji: ':male-scientist:',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: headerMrkdwn } },
          { type: 'divider' },
          ...blocks,
          { type: 'context', elements: [ { type: 'mrkdwn', text: contextMrkdwn } ] }
        ]
      })
    }
  } catch (e) {
    console.error(e)
  }

  await pgdb.close()
})
