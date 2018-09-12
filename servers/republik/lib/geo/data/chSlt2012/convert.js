//
// This script turns PLZO_CSV_WGS84.csv into json
//
// usage
// cf_server  node assets/geography/chPostalCodes/convert.js

const rw = require('rw')
const path = require('path')

const input = rw.readFileSync(
  path.join(__dirname, 'data.csv'),
  'utf8'
).split('\n')

const cleanedInput = input.slice(31, input.length).join('\n')

const slts = require('d3-dsv')
  .dsvFormat(',').parseRows(cleanedInput)
  .map(d => ({
    bfs: d[0],
    slt: d[25]
  }))

rw.writeFileSync(`${__dirname}/slts.json`,
  JSON.stringify(slts, null, 2),
  'utf8'
)
