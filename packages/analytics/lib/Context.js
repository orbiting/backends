const path = require('path')

require('@orbiting/backend-modules-env').config(
  path.join(__dirname, '../../../', '.env')
)

const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const TimescaleDB = require('./TimescaleDB')
const Mysql = require('./Mysql')
const Promise = require('bluebird')
const Stats = require('./Stats')

const create = async ({ statsData } = {}) => {
  const context = {
    pgdb: await PgDb.connect(),
    pgdbTs: await TimescaleDB.connect(),
    redis: Redis.connect(),
    mysql: Mysql.connect()
  }
  return {
    ...context,
    stats: Stats.create(statsData, context)
  }
}

const close = async ({ pgdb, pgdbTs, mysql, redis, stats }) => {
  if (stats) {
    await stats.stop()
  }
  return Promise.all([
    pgdb && PgDb.disconnect(pgdb),
    pgdbTs && TimescaleDB.disconnect(pgdbTs),
    redis && Redis.disconnect(redis),
    mysql && mysql.close()
  ])
}

module.exports = {
  create,
  close
}
