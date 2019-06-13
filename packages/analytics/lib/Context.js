const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const TimescaleDB = require('./TimescaleDB')
const Mysql = require('./Mysql')
const Promise = require('bluebird')

const create = async () => ({
  pgdb: await PgDb.connect(),
  pgdbTs: await TimescaleDB.connect(),
  mysql: Mysql.connect()
})

const close = ({ pgdb, pgdbTs, mysql }) =>
  Promise.all([
    pgdb && pgdb.close(),
    pgdbTs && pgdbTs.close(),
    mysql && mysql.close()
  ])

module.exports = {
  create,
  close
}
