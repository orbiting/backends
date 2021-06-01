#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()
const {
  lib: { ConnectionContext },
} = require('@orbiting/backend-modules-base')

const debug = require('debug')('documents:script:countWords')
const Promise = require('bluebird')

const Elasticsearch = require('@orbiting/backend-modules-base/lib/Elasticsearch')
const utils = require('@orbiting/backend-modules-search/lib/utils')

const applicationName = 'backends documents script countWords'

ConnectionContext.create(applicationName)
  .then(async (context) => {
    const { elastic, pgdb, redis } = context

    let hits = 0

    const params = {
      index: utils.getIndexAlias('document', 'read'),
      scroll: '30s',
      size: 100,
      _source: ['meta', 'contentString'],
      body: {
        query: { term: { '__state.published': true } },
      },
    }

    console.log(['URL', 'Publikator-URL'].join('\t'))

    debug('clear cache …')
    await redis
      .scanMap({
        pattern: `t:*`,
        mapFn: (key, client) => client.delAsync(key),
      })
      .catch(() => {})
    debug('cleared cache')

    for await (const hit of Elasticsearch.scroll(elastic, params)) {
      hits++

      const tokens = hit._source.meta.title
        ?.replace(/[^\p{L}\p{N}]+/giu, ' ')
        .split(' ')
        .filter(Boolean)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean) || []

      const uniqTokens = new Set()
      tokens.forEach((t) => uniqTokens.add(t))

      if (uniqTokens.size > 0) {
        /* const records = await Promise.map(tokens, async (token) => {
          const count = await redis.getAsync(`t:${token}`)
          return count !== null && token
        }).filter(Boolean)

        const missing = Array.from(uniqTokens).filter(
          (ut) => !records.includes(ut),
        ) */

        debug('hit data %o', {
          hit: hits,
          tokens: tokens.length,
          uniqTokens: uniqTokens.size,
        })

        /* await Promise.map(missing, async (token) => {
          const count = tokens.filter((t) => t === token).length
          await redis.setAsync(`t:${token}`, count)
        })
        debug('set done') */

        await Promise.map(uniqTokens, async (token) => {
          const increment = tokens.filter((t) => t === token).length
          await redis.incrbyAsync(`t:${token}`, increment)
        })
        debug('hit cached')
      }
    }

    await pgdb.public.title.truncate()
    debug('title truncated')

    await redis
      .scanMap({
        pattern: 't:*',
        mapFn: async (key, client) => {
          const count = await client.getAsync(key)
          await pgdb.public.title.insert({ token: key, count })
        },
      })
      .catch((e) => console.error(e))
    debug('title persisted')

    return context
  })
  .then((context) => ConnectionContext.close(context))
