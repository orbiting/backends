const debug = require('debug')('access:lib:expireGrants')

const grantsLib = require('./grants')

/**
 * Renders expired grants invalid.
 */
module.exports = async ({ now, dryRun }, { t, pgdb, mail }) => {
  debug('expireGrants...')
  for (const grant of await grantsLib.findInvalid(pgdb)) {
    const transaction = await pgdb.transactionBegin()

    try {
      await grantsLib.invalidate(grant, 'expired', t, transaction, mail)
      await transaction.transactionCommit()
    } catch (e) {
      await transaction.transactionRollback()

      debug('rollback', { grant: grant.id })

      throw e
    }
  }
  debug('expireGrant done')
}
