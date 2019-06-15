const moment = require('moment')
const Table = require('cli-table')
const util = require('util')
const omit = require('lodash/omit')
const logUpdate = require('log-update')
const progress = require('progress-string')

const STATS_INTERVAL_SECS = 4
const REDIS_KEY_PREFIX = `analytics:stats`

const logSnapshots = (snapshots) => {
  const formattedSnapshots = snapshots.map(snapshot =>
    util.inspect(
      omit(snapshot, ['command', 'analytics', 'workerId', 'numWorkers']),
      { depth: 2, breakLength: 50, colors: true }
    )
      .split('\n')
      .filter((e, i, a) => i > 0 && i < a.length - 1)
      .map(e => e.trim())
      .join('\n')
  )
  const snapshotsPerLine = 4
  const numLines = Math.ceil(formattedSnapshots.length / snapshotsPerLine)
  const lines = Array(numLines).fill(1).map((_, i) => {
    const line = [
      ...formattedSnapshots.slice(i * snapshotsPerLine, (i * snapshotsPerLine) + snapshotsPerLine)
    ]
    if (i > 0 && line.length < snapshotsPerLine) {
      line.push(...Array(snapshotsPerLine - line.length).fill('n/a'))
    }
    return line
  })

  const table = new Table({
    head: snapshots
      .slice(0, snapshotsPerLine)
      .map(snapshot => `worker: ${snapshot.workerId || 0}`)
  })
  table.push(...lines)

  logUpdate(
    table.toString()
  )
}

const create = (initialData = {}, context) => {
  const data = initialData
  let interval
  let startTime

  const createSnapshot = () => {
    const now = moment()
    const runtime = now.diff(startTime)
    const bar = progress({ width: 30, total: 100 })
    let queueData = {}
    if (data.mysqlStreamResults && data.mysqlStreamResults > 0) {
      const tasksTotal = data.mysqlStreamResults
      const tasksRemaining = data.queueSize
      const tasksExecuted = tasksTotal - tasksRemaining
      const tasksPerMs = tasksExecuted / runtime
      const estimate = (runtime / (tasksExecuted || 1)) * tasksTotal
      const remaining = estimate - runtime
      const tasksProgress = 100 / tasksTotal * tasksExecuted
      queueData = {
        progress: bar(tasksProgress),
        tasksProgress: `${Math.round(tasksProgress)}%`,
        tasksPerSecond: Math.round(tasksPerMs * 1000),

        estimate: `${Math.round(estimate / 1000)} s`,
        timeEstimate: moment.duration(estimate).humanize(),
        remaining: `${Math.round(remaining / 1000)} s`,
        timeRemaining: moment.duration(remaining).humanize()
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
        logSnapshots([snapshot])
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
          logSnapshots(snapshots)
        })
    }
  }

  const start = () => {
    if (interval) {
      console.log('stats already started')
      return
    }
    startTime = moment()
    if (!data.aggregateForWorkers) {
      logStats()
    }
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
