const mysql = require('mysql2')
const Promise = require('bluebird')
const { default: PQueue } = require('p-queue')

const {
  PIWIK_MYSQL_HOST,
  PIWIK_MYSQL_USER,
  PIWIK_MYSQL_PASSWORD,
  PIWIK_MYSQL_DATABASE
} = process.env

const connect = () => {
  const con = mysql.createConnection({
    host: PIWIK_MYSQL_HOST,
    user: PIWIK_MYSQL_USER,
    database: PIWIK_MYSQL_DATABASE,
    password: PIWIK_MYSQL_PASSWORD,
    ssl: 'Amazon RDS',
    supportBigNumbers: true,
    bigNumberStrings: true
  })

  return con
}

const stream = async (queryString, transformRow, onResult, { mysql, stats, redis }, {
  doQueue = true,
  queueConcurrency = 1000,
  groupBy,
  batch
} = {}) => {
  stats.data.mysqlStreamResults = 0

  let queue
  let queueInterval
  if (doQueue) {
    queue = new PQueue({ concurrency: queueConcurrency })
    queueInterval = setInterval(
      () => {
        stats.data.queueSize = queue.size
      },
      1000
    ).unref()
  }

  const returnResult = (result) => {
    if (doQueue) {
      return queue.add(
        () => onResult(result).catch(e => { console.log(e) })
      )
    }
    // no await possible here, if you need to await the promises
    // use the queue
    return onResult(result, queue).catch(e => { console.log(e) })
  }

  await new Promise((resolve, reject) => {
    mysql.query(queryString)
      .on('result', row => {
        stats.data.mysqlStreamResults++

        if (transformRow) {
          Object.assign(row, transformRow(row))
        }

        let result = row
        if (groupBy) {
          result = groupBy.push(row)
        }
        if (result && batch) {
          result = batch.push(result)
        }
        if (result) {
          return returnResult(result)
        }
      })
      .on('end', async () => {
        let result
        if (groupBy) {
          result = groupBy.flush()
        }
        if (batch) {
          batch.push(result)
          result = batch.flush()
        }
        if (result) {
          await returnResult(result)
        }

        if (queue) {
          await queue.onIdle()
          clearInterval(queueInterval)
          stats.data.queueSize = queue.size
        }
        resolve()
      })
      .on('error', err => {
        reject(err)
      })
  })
}

module.exports = {
  connect,
  stream
}
