const moment = require('moment')
const columnify = require('columnify')
const util = require('util')

const STATS_INTERVAL_SECS = 4
const REDIS_KEY_PREFIX = `analytics:stats`

const aggregateSnapshots = (snapshots) => {
  return columnify([
    snapshots.reduce(
      (agg, snapshot, i) =>
        ({
          ...agg,
          [`worker-${i}`]: util.inspect(snapshot, { depth: 2, breakLength: 50, colors: true })
        }),
      {}
    )
  ], { preserveNewLines: true })
}

const create = (initialData = {}, context) => {
  const data = initialData
  let interval
  let startTime

  const createSnapshot = () => {
    const now = moment()
    const runtime = now.diff(startTime)
    let queueData = {}
    if (data.queueSize && data.mysqlStreamResults) {
      const tasksTotal = data.mysqlStreamResults
      const tasksRemaining = data.queueSize
      const tasksExecuted = tasksTotal - tasksRemaining
      const tasksPerMs = tasksExecuted / runtime
      const estimate = (runtime / (tasksExecuted || 1)) * tasksTotal
      const remaining = estimate - runtime
      const tasksProgress = 100 / tasksTotal * tasksExecuted
      queueData = {
        tasksPerSecond: Math.round(tasksPerMs * 1000),
        tasksProgress: `${Math.round(tasksProgress)}%`,

        estimate: `${Math.round(estimate / 1000)} s`,
        timeRemaining: moment.duration(remaining).humanize(),
        remaining: `${Math.round(remaining / 1000)} s`,
        timeEstimate: moment.duration(estimate).humanize()
      }
    }
    return {
      ...data,
      ...queueData,
      runtime: `${Math.round(runtime / 1000)} s`,
      runningSince: startTime.fromNow()
    }
  }

  const logStats = () => {
    const { redis } = context
    const { aggregateForWorkers, workerId, numWorkers } = data

    if (!aggregateForWorkers) {
      const snapshot = createSnapshot()
      if (workerId === undefined) {
        console.log(snapshot)
      } else {
        redis.setAsync(`${REDIS_KEY_PREFIX}:${workerId}`, JSON.stringify(snapshot))
      }
    } else {
      Promise.all(
        Array(numWorkers).fill(1).map((_, i) =>
          redis.getAsync(`${REDIS_KEY_PREFIX}:${i}`)
            .then(result => JSON.parse(result))
        )
      )
        .then(snapshots => {
          console.log(aggregateSnapshots(snapshots))
        })
    }
  }

  const start = () => {
    if (interval) {
      console.log('stats already started')
      return
    }
    startTime = moment()
    interval = setInterval(logStats, STATS_INTERVAL_SECS * 1000)
  }

  const stop = () => {
    clearInterval(interval)
    logStats()
    interval = null
  }

  return {
    data,
    start,
    stop
  }
}

module.exports = {
  create
}
