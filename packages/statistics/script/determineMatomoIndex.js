#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('statistics:script:determineIndex')
const moment = require('moment')
const yargs = require('yargs')

const PgDb = require('@orbiting/backend-modules-base/lib/pgdb')

const IGNORE_FIELDS = ['idSite']

const argv = yargs
  .option('year', {
    alias: 'y',
    default: moment().format('YYYY'),
    coerce: v => moment(`${v}-01-01`)
  })
  .option('segment', {
    alias: 's',
    default: null
  })
  .option('group-by', {
    alias: 'g',
    default: 'url',
    choices: [
      'date',
      'url'
    ]
  })
  .option('dry-run', {
    boolean: true,
    default: true
  })
  .help()
  .version()
  .argv

const getFields = async ({ pgdb }) => (await pgdb.query(`
  SELECT
    column_name
  FROM
    information_schema.columns
  WHERE
    table_name = 'statisticsMatomo'
    AND data_type = 'integer'
`)).filter(field => !IGNORE_FIELDS.includes(field.column_name))

PgDb.connect().then(async pgdb => {
  const { year, segment, groupBy = 'url', dryRun } = argv
  const fields = await getFields({ pgdb })

  const expressions = fields.map(field => ({ expression: `"${field.column_name}"`, outputName: field.column_name }))

  expressions.push({
    expression: 'entries + "previousPages.referrals"',
    outputName: 'relevant'
  })

  const urlFragment = groupBy === 'url'
    ? `AND url LIKE '%' || CONCAT_WS('/', '', to_char(date, 'YYYY'), to_char(date, 'MM'), to_char(date, 'DD')) || '%'`
    : ''

  const segmentFragment = segment
    ? `AND segment = '${segment}'`
    : `AND segment IS NULL`

  const queryResults = await pgdb.query(`
    WITH data AS (
      SELECT
        ${groupBy},
        ${expressions.map(({ expression, outputName }) => `SUM(${expression}) AS "${outputName}"`).join(',\n')}
      
      FROM "statisticsMatomo"
      WHERE
        date BETWEEN '${year}'::date AND '${year.clone().add(1, 'year')}'::date
        ${urlFragment}
        ${segmentFragment}
        AND template = 'article'

      GROUP BY ${groupBy}
    )
    
    SELECT
      COUNT(*) n,
      ${expressions.map(({ outputName }) => `percentile_disc(0.5) WITHIN GROUP (ORDER BY "${outputName}") AS "${outputName}.p50"`).join(',\n')}
    
    FROM data
    LIMIT 1
  `)

  console.log({ queryResults })

  if (!dryRun && queryResults.length > 0) {
    const result = queryResults[0]

    const condition = { type: 'matomo', condition: `date:${year.format('YYYY')},segment:${segment},groupBy:${groupBy}` }
    const hasRow = !!(await pgdb.public.statisticsIndexes.count(condition))
    if (hasRow) {
      debug('update index data for %o', { condition })
      await pgdb.public.statisticsIndexes.update(
        condition,
        { data: result, updatedAt: new Date() }
      )
    } else {
      debug('insert new index data for %o', { condition })
      await pgdb.public.statisticsIndexes.insert(
        { ...condition, data: result }
      )
    }
  } else {
    console.warn('In dry-run mode. Use --no-dry-run to persist results.')
  }

  await pgdb.close()
}).catch(e => console.error(e))
