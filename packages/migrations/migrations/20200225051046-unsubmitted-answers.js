const run = require('../run.js')

const dir = 'packages/voting/migrations/sqls/'
const file = '20200225051046-unsubmitted-answers'

exports.up = (db) =>
  run(db, dir, `${file}-up.sql`)

exports.down = (db) =>
  run(db, dir, `${file}-down.sql`)
