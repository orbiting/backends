const postalCodesByCountries = require('./data/postalCodes/postalCodesByCountries.json')

exports.hasPostalCodesForCountry = countryCode =>
  !!postalCodesByCountries.find(d => d.country === countryCode)

exports.postalCodeData = (countryCode, postalCode) => {
  const country = postalCodesByCountries.find(d => d.country === countryCode)
  if (country) { return country.postalCodes.find(d => d.code === postalCode) }
}

exports.postalCodeParsers = {
  CH: code => parseInt(code
    .replace(/^CH[\s-]*/i, '')
  ).toString(),
  DE: code => code
    .replace(/^D[\s-]*/i, '')
    .split(' ')[0],
  AT: code => code
    .replace(/^A[\s-]*/i, '')
    .split(' ')[0],
  BE: code => code
    .replace(/^B[\s-]*/i, '')
    .split(' ')[0],
  DK: code => code
    .replace(/^DK[\s-]*/i, '')
    .split(' ')[0],
  IT: code => code
    .replace(/^I[\s-]*/i, '')
    .split(' ')[0],
  NL: code => parseInt(code)
}
