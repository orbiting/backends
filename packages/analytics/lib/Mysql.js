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

const stream = (queryString, onResult, { mysql, stats }) => new Promise((resolve, reject) => {
  stats.data.mysqlStreamResults = 0

  const queue = new PQueue({ concurrency: 100 })
  setInterval(
    () => {
      stats.data.queueSize = queue.size
    },
    1000
  ).unref()
  mysql.query(queryString)
    .on('result', result => {
      stats.data.mysqlStreamResults++
      queue.add(
        () => onResult(result).catch(e => { console.log(e) })
      )
    })
    .on('end', action => {
      queue.onEmpty()
        .then(() => resolve())
    })
    .on('error', err => {
      reject(err)
    })
})

module.exports = {
  connect,
  stream
}
