//
// This script takes allCountries.txt from http://download.geonames.org/export/zip/
// and converts it into separate json files for each country
//
// usage
// download allCountries.txt and place it beside this script
// cf_server  node assets/geography/postalCodes
// this can take some time (7s on 3.2 GHz) enjoy an espresso...

const rw = require('rw')
const path = require('path')
const nest = require('d3-collection').nest
const { ascending } = require('d3-array')

// EU + CH
const countriesOfInterest = [
  'BE', 'EL', 'LT', 'PT',
  'BG', 'ES', 'LU', 'RO',
  'CZ', 'FR', 'HU', 'SI',
  'DK', 'HR', 'MT', 'SK',
  'DE', 'IT', 'NL', 'FI',
  'EE', 'CY', 'AT', 'SE',
  'IE', 'LV', 'PL', 'UK', 'CH'
]

// source
const input = rw.readFileSync(
  path.join(__dirname, 'allCountries.txt'),
  'utf8'
)

const countries = require('d3-dsv')
  .tsvParse('country\tcode\tname\tstate\tstateAbbr\tname2\tcode2\tname3\tcode3\tlat\tlon\n' + input)
  .filter(d => countriesOfInterest.indexOf(d.country) > -1)
  .map(d => ({
    country: d.country,
    code: d.code,
    name: d.country === 'CH'
      ? d.name3 || d.name
      : d.name,
    state: d.state,
    stateAbbr: d.stateAbbr,
    lat: d.lat,
    lon: d.lon
  }))

const result = nest()
  .key(d => d.country)
  .key(d => d.code) // TODO: separate by stateAbbr too, handle multiple zips
  .entries(countries)
  .map(n => ({
    country: n.key,
    postalCodes: n.values.map(d => {
      const values = d.values.sort((a, b) => ascending(a.name, b.name))
      return {
        code: d.key,
        name: values
          .map(x => x.name)
          .filter((x, i, array) => array.indexOf(x) === i)
          .join(' / '),
        state: values[0].state,
        stateAbbr: values[0].stateAbbr,
        lat: values[0].lat,
        lon: values[0].lon
        // values: values.map( v => ({
        //  name: v.name,
        //  state: v.state,
        //  stateAbbr: v.stateAbbr,
        //  lat: v.lat,
        //  lon: v.lon
        // }))
      }
    })
  }))

rw.writeFileSync(`${__dirname}/postalCodesByCountries.json`,
  JSON.stringify(result, null, 2),
  'utf8'
)
