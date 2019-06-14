const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const TimescaleDB = require('./TimescaleDB')
const Mysql = require('./Mysql')
const Promise = require('bluebird')
const Stats = require('./Stats')

const create = async ({ statsData }) => ({
  pgdb: await PgDb.connect(),
  pgdbTs: await TimescaleDB.connect(),
  redis: Redis.connect(),
  mysql: Mysql.connect(),
  stats: Stats.create(statsData)
})

const close = ({ pgdb, pgdbTs, mysql, redis, stats }) =>
  Promise.all([
    stats && stats.stop(),
    pgdb && PgDb.disconnect(pgdb),
    pgdbTs && TimescaleDB.disconnect(pgdbTs),
    redis && Redis.disconnect(redis),
    mysql && mysql.close()
  ])

module.exports = {
  create,
  close
}
