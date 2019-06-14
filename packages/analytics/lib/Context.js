const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const TimescaleDB = require('./TimescaleDB')
const Mysql = require('./Mysql')
const Promise = require('bluebird')

const create = async () => ({
  pgdb: await PgDb.connect(),
  pgdbTs: await TimescaleDB.connect(),
  redis: Redis.connect(),
  mysql: Mysql.connect()
})

const close = ({ pgdb, pgdbTs, mysql, redis }) =>
  Promise.all([
    pgdb && PgDb.disconnect(pgdb),
    pgdbTs && TimescaleDB.disconnect(pgdbTs),
    redis && Redis.disconnect(redis),
    mysql && mysql.close()
  ])

module.exports = {
  create,
  close
}
