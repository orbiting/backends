#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('statistics:script:collectMatomo')
const moment = require('moment')
const Promise = require('bluebird')
const yargs = require('yargs')

const PgDb = require('@orbiting/backend-modules-base/lib/pgdb')
const { getInstance } = require('@orbiting/backend-modules-matomo')
const elastic = require('@orbiting/backend-modules-base/lib/elastic').client()

const collect = require('../lib/matomo/collect')

const argv = yargs
  .option('relativeDate', {
    describe: 'ISO 8601 Time Interval e.g. P14D',
    alias: 'r',
    coerce: input => {
      return moment().subtract(moment.duration(input))
    },
    conclicts: ['firstDate', 'lastDate']
  })
  .option('firstDate', {
    alias: 'f',
    describe: 'e.g. 2019-02-15',
    coerce: moment,
    implies: 'lastDate'
  })
  .option('lastDate', {
    alias: 'l',
    describe: 'e.g. 2019-02-18',
    coerce: moment,
    implies: 'firstDate'
  })
  .option('rowConcurrency', {
    alias: 'c',
    describe: 'max oncurrent queries to API',
    number: true,
    default: 2
  })
  .check(argv => {
    if (argv.firstDate > argv.lastDate) {
      return `Check --firstDate, --lastDate. Date in --firstDate must be before date in --lastDate.`
    }

    if (!(argv.firstDate && argv.lastDate) && !argv.relativeDate) {
      return `Check options. Either provide relative date, or first and last date.`
    }

    return true
  })
  .help()
  .version()
  .argv

const { MATOMO_URL_BASE, MATOMO_API_TOKEN_AUTH, MATOMO_SITE_ID } = process.env

PgDb.connect().then(async pgdb => {
  const dates = []

  for (
    let date = argv.firstDate;
    date <= argv.lastDate;
    date = date.clone().add(1, 'day')
  ) {
    dates.push(date.format('YYYY-MM-DD'))
  }

  if (argv.relativeDate) {
    dates.push(argv.relativeDate.format('YYYY-MM-DD'))
  }

  debug({ dates: dates.length })

  const matomo = getInstance({
    endpoint: MATOMO_URL_BASE,
    tokenAuth: MATOMO_API_TOKEN_AUTH,
    rowConcurrency: argv.rowConcurrency
  })

  await Promise.each(
    dates,
    async (date) => {
      debug({ idSite: MATOMO_SITE_ID, date })

      // Unsegmented
      await collect(
        { idSite: MATOMO_SITE_ID, period: 'day', date },
        { pgdb, matomo, elastic }
      )
      // "Members" segment
      await collect(
        { idSite: MATOMO_SITE_ID, period: 'day', date, segment: 'dimension1=@member' },
        { pgdb, matomo, elastic }
      )
    }
  ).catch(err => {
    debug('error', err)
    console.log(err)
  })

  await pgdb.close()
})
