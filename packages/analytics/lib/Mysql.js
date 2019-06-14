const mysql = require('mysql2')
const Promise = require('bluebird')

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

const stream = (queryString, onResult, { mysql }) => new Promise((resolve, reject) => {
  const stats = {
    numResults: 0
  }

  const promises = []
  mysql.query(queryString)
    .on('result', result => {
      stats.numResults++
      promises.push(
        onResult(result)
      )
    })
    .on('end', action => {
      Promise.all(promises)
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
