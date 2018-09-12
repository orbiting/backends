//
// This script downloads all countries with details from geonames.org
// and saves them to countries.json
// format
// [ {
//    "code": "CH",
//    "geonameId": 2658434,
//    "names": {
//      "en": "Switzerland"
//    },
//    "searchNames": [],
//    "languages": [
//      "de",
//      "fr",
//      "it",
//      "rm"
//    ],
//    "lat": "47.00016",
//    "lon": "8.01427"
//  } ]
//
//
// usage
// cf_server  node assets/geography/countries/getCountries.js

const fetch = require('isomorphic-unfetch')
const fs = require('fs')

Promise.resolve().then(async () => {
  const countries = (await (await fetch('http://api.geonames.org/countryInfo?type=json&username=projectr')).json()).geonames

  let data = []

  for (let country of countries) {
    const details = (await (await fetch(`http://api.geonames.org/search?country=${country.countryCode}&name=${country.countryName}&maxRows=1&type=json&username=projectr`)).json()).geonames[0] || {lat: 0, lng: 0}

    data.push({
      code: country.countryCode,
      geonameId: country.geonameId,
      names: {
        en: country.countryName
      },
      searchNames: [],
      languages: country.languages.split(',').map(l => l.substring(0, 2)),
      lat: details.lat,
      lon: details.lng
    })
  }

  fs.writeFileSync(`${__dirname}/countries.json`,
    JSON.stringify(data, null, 2),
    'utf8'
  )
}).then(() => {
  process.exit()
}).catch(e => {
  console.error(e)
  process.exit(1)
})
