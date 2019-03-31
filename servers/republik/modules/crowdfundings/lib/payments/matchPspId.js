const debug = require('debug')('crowdfundings:payments:matchPspId')
const Promise = require('bluebird')

module.exports = async ({ pgdb, now = new Date() }) => {
  const unmatchedPayments = await pgdb.public.postfinancePayments.find({
    'pspId !=': null,
    matched: false
  })

  debug(`found ${unmatchedPayments.length} unmatched payments`)

  await Promise.each(unmatchedPayments, async ({ id, buchungsdatum, pspId }) => {
    const hasUpdated = await pgdb.public.payments.update(
      { pspId },
      { receivedAt: buchungsdatum, updatedAt: now }
    )

    debug({ id, pspId, buchungsdatum, hasUpdated })

    if (hasUpdated > 0) {
      await pgdb.public.postfinancePayments.update(
        { id },
        { matched: true, updatedAt: now }
      )
    }
  })
}
