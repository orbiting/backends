#!/usr/bin/env node

const yargs = require('yargs')
const moment = require('moment')
const path = require('path')

const argv = yargs
  .command(
    'insert <entity> <startDate> <intervalCount> <intervalUnit>',
    'e.g. referers 2019-02-15 2 days',
    yargs => yargs
      .positional('entity', {
        type: 'string',
        description: 'e.g. referers'
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
  .demandCommand(1)
  .argv

const command = argv._[0]
const { entity } = argv

if (!['insert'].includes(command)) {
  throw new Error(`command ${command} not available`)
}
if (!['referers'].includes(entity)) {
  throw new Error(`command ${entity} not available`)
}

const startDate = moment(argv.startDate)
const endDate = moment(startDate).add(argv.intervalCount, argv.intervalUnit)

console.log({
  command,
  entity,
  startDate: startDate.toString(),
  endDate: endDate.toString()
})

if (endDate.isBefore(moment(startDate).add(30, 'minutes'))) {
  throw new Error(`interval too short!`)
}

require('@orbiting/backend-modules-env').config(
  path.join(__dirname, '../../../', '.env')
)

const Context = require('../lib/Context')
Context.create()
  .then(async (context) => {
    if (command === 'insert') {
      await require(`../inserts/${entity}`)(startDate, endDate, context)
    }
    return context
  })
  .then(context => Context.close(context))
