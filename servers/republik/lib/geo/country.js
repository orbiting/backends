const countriesWithNames = require('./data/countries/countriesWithNames.json')

exports.nameNormalizer = (name) => {
  const country = countriesWithNames.find(country => {
    return country.searchNames.indexOf(name) > -1
  })
  return country ? country.name : null
}

exports.detailsForName = (name) =>
  countriesWithNames.find(country =>
    country.name === name
  )
