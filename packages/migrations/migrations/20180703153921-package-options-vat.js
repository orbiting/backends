const run = require('../run.js')

const dir = 'packages/republik/migrations/sqls'
const file = '20180703153921-package-options-vat'

exports.up = (db) => run(db, dir, `${file}-up.sql`)

exports.down = (db) => run(db, dir, `${file}-down.sql`)
