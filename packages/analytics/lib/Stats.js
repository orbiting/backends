const moment = require('moment')

const STATS_INTERVAL_SECS = 4

const create = (initialData = {}) => {
  const data = initialData
  let interval
  let startTime

  const logStats = () => {
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
    console.log({
      ...data,
      ...queueData,
      runtime: `${Math.round(runtime / 1000)} s`,
      runningSince: startTime.fromNow()
    })
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
