#!/usr/bin/env node

const yargs = require('yargs')
const moment = require('moment')
const path = require('path')

const availableAnalytics = ['referer_pledges', 'referers']

const argv = yargs
  .command(
    'insert <analytics> <startDate> <intervalCount> <intervalUnit>',
    'e.g. insert referer_pledges 2019-02-15 2 days',
    yargs => yargs
      .positional('analytics', {
        type: 'string',
        choices: availableAnalytics,
        description: 'the analytics to run'
      })
      .positional('startDate', {
        type: 'string',
        description: 'e.g. 2019-02-15'
      })
      .positional('intervalCount', {
        type: 'string',
        description: 'e.g. 2'
      })
      .positional('intervalUnit', {
        type: 'string',
        description: 'e.g. days'
      })
  )
  .command(
    'drop <analytics>',
    'e.g. drop referer_pledges',
    yargs => yargs
      .positional('analytics', {
        type: 'string',
        choices: availableAnalytics,
        description: 'the analytics to run'
      })
  )
  .demandCommand(1)
  .argv

const command = argv._[0]
const { analytics } = argv

if (!['insert', 'drop'].includes(command)) {
  throw new Error(`command ${command} not available`)
}

let startDate, endDate
if (command === 'insert') {
  startDate = moment(argv.startDate)
  endDate = moment(startDate).add(argv.intervalCount, argv.intervalUnit)

  console.log({
    command,
    analytics,
    startDate: startDate.toString(),
    endDate: endDate.toString()
  })

  if (endDate.isBefore(moment(startDate).add(30, 'minutes'))) {
    throw new Error(`interval too short, min 30min!`)
  }
} else {
  console.log({
    command,
    analytics
  })
}

require('@orbiting/backend-modules-env').config(
  path.join(__dirname, '../../../', '.env')
)

const Context = require('../lib/Context')
Context.create()
  .then(async (context) => {
    await require(`../aggregations/${analytics}`)[command](
      ...[startDate, endDate, context].filter(Boolean)
    )
    return context
  })
  .then(context => Context.close(context))
