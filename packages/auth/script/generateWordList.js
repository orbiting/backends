#!/usr/bin/env node
/**
 * Generates a list of words out of document meta.title words.
 *
 * $ DEBUG=* packages/auth/script/generateWordList.js > packages/auth/lib/words.json
 *
 */
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('auth:script:generatedWordList')
const fetch = require('node-fetch')

const elastic = require('@orbiting/backend-modules-base/lib/Elasticsearch').connect()
const utils = require('@orbiting/backend-modules-search/lib/utils')

const STOP_WORDS_URL = 'https://raw.githubusercontent.com/stopwords-iso/stopwords-de/master/stopwords-de.json'

const run = async () => {
  const stopwords = await fetch(STOP_WORDS_URL).then(body => body.json())

  const results = await elastic.search({
    index: utils.getIndexAlias('document', 'read'),
    _source: ['meta.title'],
    size: 5000,
    body: {
      query: {
        bool: {
          must: [
            { term: { '__state.published': true } }
          ]
        }
      }
    }
  })

  const words =
    results.hits &&
    results.hits.hits &&
    Array.from(new Set(
      results.hits.hits
        .map(hit => hit._source.meta && hit._source.meta.title && hit._source.meta.title)
        .filter(Boolean) // Remove those without a meta or meta.title block
        .join(' ')
        .replace(/[:,.«»?!&]/g, ' ')
        .split(' ')
        .filter(word => {
          if (word.match(/[^\w\d-äüöÄÜÖ]+/)) {
            debug(`${word} contains special chars: Dropping.`)
            return false
          }

          if (word.match(/^\d+$/)) {
            debug(`${word} contains only digits: Dropping.`)
            return false
          }

          if (word.length < 3) {
            debug(`${word} too short: Dropping.`)
            return false
          }

          if (word.length > 6) {
            debug(`${word} too long: Dropping.`)
            return false
          }

          if (stopwords.includes(word.toLowerCase().trim())) {
            debug(`${word} is a stop word: Dropping.`)
            return false
          }

          return true
        })
    ))

  debug(words.length)

  const lowercase = words.filter(word => !word.match(/^[A-ZÄÖÜ]/))
  const uppercase = words.filter(word => word.match(/^[A-ZÄÖÜ]/))

  console.log(JSON.stringify({ lowercase, uppercase }))
}

run()
