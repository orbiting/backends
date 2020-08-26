const path = require('path')
const xmlPath = path.join(__dirname, 'mocks/camt.053_T_CH6309000000250097798_000001001_0_2020082616553095.xml')
const { parseCamt053 } = require('../../modules/crowdfundings/lib/parse-camt-053.js')

describe('parse camt.053.xml:', () => {
  beforeEach(() => {

  })

  it('returns a promise that resolves with an array', () => {
    const promise = parseCamt053(xmlPath)
    return promise.then((result) => {
      expect(Array.isArray(result)).toEqual(true)
    })
  })

  it('result contains items', async () => {
    const result = await parseCamt053(xmlPath)
    expect(result.length).toBeGreaterThan(0)
  })
})
