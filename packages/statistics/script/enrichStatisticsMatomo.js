#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('statistics:script:enrichStatisticsMatomo')
const Promise = require('bluebird')

const PgDb = require('@orbiting/backend-modules-base/lib/pgdb')
const elastic = require('@orbiting/backend-modules-base/lib/elastic').client()

const getMeta = require('../lib/elastic/documents')

PgDb.connect().then(async pgdb => {
  const limit = 1000
  let offset = 0
  let urls = []

  do {
    debug({ limit, offset })
    urls = await pgdb.query(`
      SELECT DISTINCT url
      FROM "statisticsMatomo"
      LIMIT :limit
      OFFSET :offset
    `, { limit, offset })

    const hits = await getMeta({
      paths: urls.map(({ url }) => url.replace('https://www.republik.ch', ''))
    }, { elastic })

    await Promise.map(hits, async ({ repoId, template, publishDate, path }) => {
      debug(`page URLs "${path}", set repo ID "${repoId}", template "${template}"`)
      await pgdb.public.statisticsMatomo.update(
        { 'url like': `%${path}` },
        { repoId, template, publishDate, updatedAt: new Date() }
      )
    }, { concurrency: 10 })

    offset += limit
  } while (urls.length === limit)

  debug('done')

  await pgdb.close()
}).catch(e => console.log(e))
