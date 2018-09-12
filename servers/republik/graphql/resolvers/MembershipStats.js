const { descending } = require('d3-array')
const nest = require('d3-collection').nest

const collator = new Intl.Collator('de')

const {hasPostalCodesForCountry, postalCodeData, postalCodeParsers} = require('../../lib/geo/postalCode')
const countryNameNormalizer = require('../../lib/geo/country').nameNormalizer
const countryDetailsForName = require('../../lib/geo/country').detailsForName

module.exports = {
  async createdAts (_, {interval}, {pgdb}) {
    return pgdb.query(`
      SELECT
        date_trunc('${interval}', "createdAt") AS datetime,
        count(*) AS count
      FROM memberships
      GROUP BY 1
      ORDER BY 1 ASC
    `)
  },
  async ages (_, args, {pgdb}) {
    return pgdb.query(`
      SELECT
        extract(year from age(birthday)) AS age,
        count(distinct u.id) AS count
      FROM users u
      JOIN
        memberships m
        ON m."userId" = u.id
      GROUP BY 1
      ORDER BY 1
    `)
  },
  async countries (_, args, {pgdb, caches: {membershipStatsCountries: cache}}) {
    const result = cache.get('all')
    if (result) {
      return result
    }

    const countries = await pgdb.query(`
      SELECT
        lower(trim(a.country)) as name,
        trim(a."postalCode") as "postalCode",
        count(distinct u.id) AS count
      FROM memberships m
      JOIN users u
        ON m."userId" = u.id
      LEFT JOIN addresses a
        ON u."addressId" = a.id
      GROUP BY a."postalCode", a.country
      ORDER BY count DESC
    `)

    const countriesWithPostalCodes = nest()
      .key(d => countryNameNormalizer(d.name))
      .entries(countries)
      .map(datum => {
        const country = countryDetailsForName(datum.key)
        const hasPostalCodes = country
          ? hasPostalCodesForCountry(country.code)
          : false
        let postalCodes = []
        let unkownCount = 0
        if (!hasPostalCodes) {
          unkownCount = datum.values.reduce(
            (sum, row) => row.count,
            0
          )
        } else {
          const pcParser = country
            ? postalCodeParsers[country.code]
            : null

          datum.values.forEach(row => {
            const postalCode = pcParser
              ? pcParser(row.postalCode)
              : row.postalCode

            const baseData = postalCodeData(country.code, postalCode)
            if (baseData) {
              postalCodes.push({
                postalCode: baseData.code,
                name: baseData.name,
                lat: baseData.lat,
                lon: baseData.lon,
                count: row.count,
                state: baseData.state,
                stateAbbr: baseData.stateAbbr
              })
            } else {
              unkownCount += row.count
            }
          })

          if (pcParser) {
            postalCodes = nest()
              .key(d => d.postalCode)
              .rollup(values => Object.assign({}, values[0], {
                count: values.reduce(
                  (sum, d) => sum + d.count,
                  0
                )
              }))
              .entries(postalCodes)
              .map(d => d.value)
          }
        }
        if (unkownCount) {
          const {lat, lon} = country
            ? {lat: country.lat, lon: country.lon}
            : {lat: 0, lon: 0}
          postalCodes.push({
            postalCode: null,
            name: null,
            lat,
            lon,
            count: unkownCount
          })
        }

        return {
          name: datum.key === 'null'
            ? null
            : datum.key,
          postalCodes,
          states () {
            return nest()
              .key(d => d.stateAbbr || undefined)
              .rollup(values => ({
                name: values[0].state || null,
                abbr: values[0].stateAbbr || null,
                count: values.reduce(
                  (sum, d) => sum + d.count,
                  0
                )
              }))
              .entries(postalCodes)
              .map(d => d.value)
          },
          count: datum.values.reduce((acc, currentValue) => {
            return acc + currentValue.count
          }, 0)
        }
      })
      .sort((a, b) => (
        descending(a.count, b.count) ||
        collator.compare(a.name, b.name)
      ))

    cache.set('all', countriesWithPostalCodes)

    return countriesWithPostalCodes
  }
}
