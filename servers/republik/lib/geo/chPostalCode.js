const postalCodes = require('./data/chPostalCodes/chPostalCodes.json')

// TODO this needs some refinement //
exports.getBFSNr = (postalCode, city) => {
  const postalCodeContent = postalCodes.find(d => d.postalCode === postalCode)
  if (postalCodeContent) {
    const record = postalCodeContent.values.find(d =>
      d.gemeinde.trim().toLowerCase() === city.trim().toLowerCase() ||
      d.ortschaft.trim().toLowerCase() === city.trim().toLowerCase() ||
      d.gemeinde.trim().toLowerCase().indexOf(city.trim().toLowerCase().substring(0, 7)) > -1 ||
      d.ortschaft.trim().toLowerCase().indexOf(city.trim().toLowerCase().substring(0, 7)) > -1
    )
    if (record) {
      return record.bfs
    }
  }
}
