const DEV = process.env.NODE_ENV && process.env.NODE_ENV !== 'production'

const debug = require('debug')('crowdfundings:lib:scheduler')

const {
  intervalScheduler,
  timeScheduler
} = require('@orbiting/backend-modules-schedulers')

const lockTtlSecs = 60 * 5 // 5 mins

const { inform: informGivers } = require('./givers')
const { inform: informCancellers } = require('./winbacks')
const { run: membershipsOwnersHandler } = require('./owners')
const { deactivate } = require('./deactivate')
const { changeover } = require('./changeover')

const init = async (context) => {
  debug('init')

  const schedulers = []

  schedulers.push(
    await timeScheduler.init({
      name: 'memberships-givers',
      context,
      runFunc: informGivers,
      lockTtlSecs,
      runAtTime: '06:00',
      runInitially: DEV
    })
  )

  schedulers.push(
    await intervalScheduler.init({
      name: 'memberships-owners',
      context,
      runFunc: membershipsOwnersHandler,
      lockTtlSecs,
      runIntervalSecs: 60 * 10
    })
  )

  schedulers.push(
    await timeScheduler.init({
      name: 'winback',
      context,
      runFunc: informCancellers,
      lockTtlSecs,
      runAtTime: '18:32',
      runAtDaysOfWeek: [1, 2, 3, 4, 5],
      runInitially: DEV
    })
  )

  schedulers.push(
    await intervalScheduler.init({
      name: 'changeover-deactivate',
      context,
      runFunc: async (args, context) => {
        await changeover(args, context)
        await deactivate(args, context)
      },
      lockTtlSecs,
      runIntervalSecs: 60 * 10
    })
  )

  const close = async () => {
    await Promise.each(schedulers, scheduler => scheduler.close())
  }

  return {
    close
  }
}

module.exports = {
  init
}
