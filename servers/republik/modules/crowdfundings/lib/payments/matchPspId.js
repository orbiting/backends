const debug = require('debug')('crowdfundings:payments:matchPspId')
const Promise = require('bluebird')

module.exports = async ({ pgdb, now = new Date() }) => {
  const unmatchedPayments = await pgdb.public.postfinancePayments.find({
    'pspId !=': null,
    matched: false
  })

  debug(`found ${unmatchedPayments.length} unmatched payments`)

  await Promise.each(unmatchedPayments, async ({ id, buchungsdatum, pspId }) => {
    const wasUpdated = !!(await pgdb.public.payments.update(
      { pspId },
      { receivedAt: buchungsdatum } // Unable to set updatedAt to now, since date is used to indicate storno
    ))

    debug({ id, pspId, buchungsdatum, wasUpdated })

    if (wasUpdated) {
      await pgdb.public.postfinancePayments.update(
        { id },
        { matched: true, updatedAt: now }
      )
    }
  })
}
