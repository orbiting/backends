#!/usr/bin/env node
/**
 * Script to determine author genders of articles published within
 * a give period.
 *
 * Usage:
 * script/determineAuthorshipGender.js --begin 2019-05-01 --end 2019-07-01
 */

require('@orbiting/backend-modules-env').config()

const yargs = require('yargs')
const moment = require('moment')
const Promise = require('bluebird')

const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Elasticsearch = require('@orbiting/backend-modules-base/lib/Elasticsearch')
const utils = require('@orbiting/backend-modules-search/lib/utils')
const { mdastToString } = require('@orbiting/backend-modules-utils')

const { Analyzer } = require('../lib/credits/analyzer')

const argv = yargs
  .option('begin', {
    alias: 'b',
    coerce: moment,
    default: moment().subtract(1, 'month').startOf('month'),
  })
  .option('end', {
    alias: 'e',
    coerce: moment,
    default: moment().startOf('month'),
  })
  .help()
  .version().argv

const unclassifiedAuthors = []
const articles = []

const elastic = Elasticsearch.connect()
const days = argv.end.diff(argv.begin, 'days')

PgDb.connect()
  .then(async (pgdb) => {
    const classifiedAuthors = await pgdb.public.gsheets.findOneFieldOnly(
      { name: 'authors' },
      'data',
    )

    const { body } = await elastic
      .search({
        index: utils.getIndexAlias('document', 'read'),
        _source: ['meta.path', 'meta.credits', 'meta.publishDate'],
        size: days * 8, // sane maximum amount of articles per day
        body: {
          query: {
            function_score: {
              random_score: {},
              query: {
                bool: {
                  must: [
                    {
                      term: {
                        '__state.published': true,
                      },
                    },
                    /* {
                    term: {
                      'meta.creditsString': 'une recherche',
                    },
                  }, */
                    {
                      range: {
                        'meta.publishDate': {
                          gte: argv.begin.toISOString(),
                          lt: argv.end.toISOString(),
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      })
      .catch((e) => {
        console.error(e.meta.body.error)
        throw new Error('Something broke')
      })

    const hits = body.hits.hits

    await Promise.each(
      hits
        .map(({ _source: { meta } }) => meta)
        .filter(({ credits }) => credits.length > 0),
      async (meta) => {
        const credits = mdastToString({ children: meta.credits })

        const analysis = new Analyzer().getAnalysis(credits)
        // console.log(analysis)

        const { contributors } = analysis

        // Unable to determine an author
        if (!contributors.length) {
          articles.push({ path: meta.path, gender: 'n' })
          return
        }

        // n = unknown, neutral
        // b = both
        // f = female
        // m = male
        const gender = contributors
          .map(({ name: authorName }) => {
            const classifiedAuthor = classifiedAuthors.find(
              (a) => a.name === authorName,
            )
            if (!classifiedAuthor) {
              unclassifiedAuthors.push({ author: authorName, path: meta.path })
            }

            return (classifiedAuthor && classifiedAuthor.gender) || 'n'
          })
          .reduce((previousValue, currentValue = 'n') => {
            if (previousValue === 'n') {
              return currentValue
            }

            if (
              (previousValue === 'f' && currentValue === 'm') ||
              (previousValue === 'm' && currentValue === 'f')
            ) {
              return 'b'
            }

            return previousValue
          })

        articles.push({ path: meta.path, gender })

        /* if (credits.match(/De\b/)) {
          console.log(analysis)
        } */

        /* if (analysis.contributors?.length === 0) {
          console.log(meta.path, analysis)
        } */

        // names
        // analysis.contributors?.map(contributor => console.log(contributor.name)) // flat)

        // kinds
        // analysis.contributors?.map(contributor => console.log(contributor.kind)) // flat)

        /* if (analysis.contributors?.some(contributor => contributor.name.split(' ').length === 3)) {
          console.log(analysis)
        } */

        /* if (analysis.contributors?.some(contributor => contributor.name.match(/Update/))) {
          console.log(analysis)
        } */
      },
    )

    unclassifiedAuthors.map(({ author, path }) => {
      console.warn(author, path)
    })

    const unclassifiedAuthorNames = [
      ...new Set(unclassifiedAuthors.map(({ author }) => author)),
    ].sort()
    unclassifiedAuthorNames.map((authorName) => console.warn(authorName))

    const stats = {
      begin: argv.begin.toISOString(),
      end: argv.end.toISOString(),

      // n = unknown, neutral
      // b = both
      // f = female
      // m = male
      n: articles.filter((a) => a.gender === 'n').length,
      m: articles.filter((a) => a.gender === 'm').length,
      b: articles.filter((a) => a.gender === 'b').length,
      f: articles.filter((a) => a.gender === 'f').length,

      // a = all
      // a-n = all w/o unknown, neutral
      a: articles.length,
      'a-n': articles.length - articles.filter((a) => a.gender === 'n').length,
    }

    // ratios
    Object.assign(stats, {
      // gender ratios over all
      'n%': (1 / stats.a) * stats.n,
      'm%': (1 / stats.a) * stats.m,
      'b%': (1 / stats.a) * stats.b,
      'f%': (1 / stats.a) * stats.f,

      // gender ratios over all w/o unkown, neutral
      '(m-n)%': (1 / stats['a-n']) * stats.m,
      '(b-n)%': (1 / stats['a-n']) * stats.b,
      '(f-n)%': (1 / stats['a-n']) * stats.f,

      // gender ratios over all w/o unkown, neutral including b (both)
      '(m-n)+b%': (1 / stats['a-n']) * (stats.m + stats.b),
      '(f-n)+b%': (1 / stats['a-n']) * (stats.f + stats.b),
    })

    console.log(stats)

    await pgdb.close()
  })
  .catch((e) => {
    throw e
  })
