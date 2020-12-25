const run = require('../run.js')

const dir = 'packages/republik/migrations/crowdfunding/sqls'
const file = '20201225062700-remove-cash-payments'

exports.up = (db) =>
  run(db, dir, `${file}-up.sql`)

exports.down = (db) =>
  run(db, dir, `${file}-down.sql`)
