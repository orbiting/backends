const { PgDb } = require('pogi')

const connect = () =>
  PgDb.connect({ connectionString: process.env.TIMESCALE_DATABASE_URL })

const disconnect = pgdb =>
  pgdb.close()

module.exports = {
  connect,
  disconnect
}
