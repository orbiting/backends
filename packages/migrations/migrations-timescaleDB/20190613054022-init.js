const run = require('../run.js')

const dir = 'packages/analytics/migrations-timescaleDB/'
const file = '20190613054022-init'

exports.up = (db) =>
  run(db, dir, `${file}-up.sql`)

exports.down = (db) =>
  run(db, dir, `${file}-down.sql`)
