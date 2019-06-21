const mysql = require('mysql2')
const Promise = require('bluebird')
const { default: PQueue } = require('p-queue')
const crypto = require('crypto')

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

const stream = async (queryString, onResult, { mysql, stats, redis }, {
  doQueue = false,
  doBatch = false,
  batchSize = 1000,
  doCache = false,
  queueConcurrency = 100
} = {}) => {
  stats.data.mysqlStreamResults = 0

  let queue
  if (doQueue) {
    queue = new PQueue({ concurrency: queueConcurrency })
    setInterval(
      () => {
        stats.data.queueSize = queue.size
      },
      1000
    ).unref()
  }

  let batch
  if (doBatch) {
    batch = []
  }

  const cacheResults = []
  let redisKey
  if (doCache) {
    const sha = crypto.createHash('sha256')
      .update(queryString)
      .digest('hex')

    redisKey = `analytics:cache:mysql:${sha}`
    const cachedResult = await redis.getAsync(redisKey)
    if (cachedResult) {
      console.log('cached result')
      const parsedCacheResult = JSON.parse(cachedResult)
      parsedCacheResult.forEach(result =>
        queue.add(
          () => onResult(result).catch(e => { console.log(e) })
        )
      )
      stats.data.mysqlStreamResults = parsedCacheResult.length
      await queue.onIdle()
      stats.data.queueSize = queue.size
      return
    }
  }

  const sendResult = (result) => {
    if (doQueue) {
      queue.add(
        () => onResult(result).catch(e => { console.log(e) })
      )
    } else {
      onResult(result).catch(e => { console.log(e) })
    }
    if (doCache) {
      cacheResults.push(result)
    }
  }

  await new Promise((resolve, reject) => {
    mysql.query(queryString)
      .on('result', result => {
        stats.data.mysqlStreamResults++

        if (doBatch) {
          batch.push(result)
          if (batch.length >= batchSize) {
            const batchResult = batch
            batch = []
            sendResult(batchResult)
          }
        } else {
          sendResult(result)
        }

      })
      .on('end', async (action) => {
        if (doBatch) {
          sendResult(batch)
          batch = []
        }

        if (doCache) {
          await redis.setAsync(redisKey, JSON.stringify(cacheResults))
        }
        if (doQueue) {
          await queue.onIdle()
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
