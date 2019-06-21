#!/usr/bin/env node

const yargs = require('yargs')
const moment = require('moment')
const devideDuration = require('../lib/devideDuration')
const run = require('../lib/run')
const path = require('path')

const availableAnalytics = ['referer_pledges', 'referers', 'document_revenue']

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
  .option('workers', {
    describe: 'parallelize work'
  })
  .demandCommand(1)
  .argv

const command = argv._[0]
const { analytics } = argv

if (!['insert', 'drop'].includes(command)) {
  throw new Error(`command ${command} not available`)
}

const numWorkers = command === 'drop'
  ? 1
  : argv.workers || 1

let startDate, endDate
let statsData = {
  command,
  analytics,
  numWorkers
}
if (command === 'insert') {
  startDate = moment(argv.startDate)
  endDate = moment(startDate).add(argv.intervalCount, argv.intervalUnit)

  statsData = {
    ...statsData,
    startDate: startDate.toString(),
    endDate: endDate.toString()
  }
  console.log(statsData)

  if (endDate.isBefore(moment(startDate).add(30, 'minutes'))) {
    throw new Error(`interval too short, min 30min!`)
  }
} else {
  console.log(statsData)
}

const options = {
  command,
  analytics,
  startDate,
  endDate,
  statsData
}

if (numWorkers === 1) {
  run(options)
} else {
  const workerpool = require('workerpool')
  const pool = workerpool.pool(path.join(__dirname, '../lib/runWorker.js'), {
    maxWorkers: numWorkers,
    minWorkers: numWorkers,
    //nodeWorker: 'process'
    nodeWorker: 'thread'
  })

  const Context = require('../lib/Context')
  const contextPromise = Context.create({ statsData: { aggregateForWorkers: true, numWorkers } })
    .then((context) => {
      context.stats.start()
      return context
    })

  devideDuration(startDate, endDate, numWorkers)
    .map((dates, i) => ({
      ...options,
      statsData: {
        workerId: i,
        ...options.statsData
      },
      ...dates
    }))
    .forEach(input =>
      pool.exec('run2', [input])
        .catch(err => {
          console.error(err)
        })
        .then(() => {
          pool.terminate()
            .then(() =>
              contextPromise.then((context) =>
                Context.close(context)
              )
            )
        })
    )

  /*
  setInterval(
    () => {
      console.log('pool stats', pool.stats())
    },
    1000
  ).unref()
  */
}
