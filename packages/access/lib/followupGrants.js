const debug = require('debug')('access:lib:followupGrants')

const campaignsLib = require('./campaigns')
const grantsLib = require('./grants')

/**
 * Runs follow-up on invalidated grants.
 */
module.exports = async ({ now, dryRun }, { t, pgdb, mail }) => {
  debug('followupGrants...')
  for (const campaign of await campaignsLib.findAll(pgdb)) {
    for (const grant of await grantsLib.findEmptyFollowup(campaign, pgdb)) {
      const transaction = await pgdb.transactionBegin()

      try {
        await grantsLib.followUp(campaign, grant, t, transaction, mail)
        await transaction.transactionCommit()
      } catch (e) {
        await transaction.transactionRollback()

        debug('rollback', { grant: grant.id })

        throw e
      }
    }
  }
  debug('followupGrants done')
}
