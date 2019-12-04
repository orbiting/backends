const run = require('../run.js')

const dir = 'servers/republik/migrations/sqls'
const file = '20191204080833-drop-disabled-package-option-flag'

exports.up = (db) =>
  run(db, dir, `${file}-up.sql`)

exports.down = (db) =>
  run(db, dir, `${file}-down.sql`)
