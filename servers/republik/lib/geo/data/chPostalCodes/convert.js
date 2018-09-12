//
// This script turns PLZO_CSV_WGS84.csv into json
//
// usage
// cf_server  node assets/geography/chPostalCodes/convert.js

const rw = require('rw')
const path = require('path')
const nest = require('d3-collection').nest
const { ascending } = require('d3-array')

const input = rw.readFileSync(
  path.join(__dirname, 'PLZO_CSV_WGS84.csv'),
  'utf8'
)

const chPostalCodes = require('d3-dsv')
  .tsvParse(input)
  .sort((a, b) => ascending(a.PLZ, b.PLZ) || ascending(a.Ortschaftsname, b.Ortschaftsname))
  .map(d => ({
    ortschaft: d.Ortschaftsname,
    gemeinde: d.Gemeindename,
    bfs: d['BFS-Nr'],
    postalCode: d.PLZ,
    stateAbbr: d.Kantonskürzel,
    lat: d.N,
    lon: d.E
  }))

const result = nest()
  .key(d => d.postalCode)
  .entries(chPostalCodes)
  .map(d => ({
    postalCode: d.key,
    values: d.values
  }))

rw.writeFileSync(`${__dirname}/chPostalCodes.json`,
  JSON.stringify(result, null, 2),
  'utf8'
)
