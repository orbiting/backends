const Redlock = require('redlock')
const debug = require('debug')('access:lib:accessScheduler')

const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')

const expireGrants = require('./expireGrants')
const followupGrants = require('./followupGrants')

// Interval in which scheduler runs
const intervalSecs = 60 * 10

const LOCK_KEY = 'locks:access-scheduler'
const schedulerLock = (redis) => new Redlock([redis])

/**
 * Function to initialize scheduler. Provides scheduling.
 */
const init = async ({ pgdb, redis, t, mail }) => {
  debug('init')

  let timeout

  /**
   * Default runner, runs every {intervalSecs}.
   * @return {Promise} [description]
   */
  const run = async () => {
    debug('run started')

    try {
      const lock = await schedulerLock(redis).lock(LOCK_KEY, 1000 * intervalSecs)

      await expireGrants({}, { t, pgdb, mail })
      await followupGrants({}, { t, pgdb, mail })

      // Extend lock for a fraction of usual interval to prevent runner to
      // be executed back-to-back to previous run.
      await lock.extend(1000 * (intervalSecs / 10))

      debug('run completed')
    } catch (e) {
      if (e.name === 'LockError') {
        // swallow
        debug('run failed', e.message)
      } else {
        throw e
      }
    } finally {
      // Set timeout slightly off to usual interval
      if (timeout) {
        clearTimeout(timeout)
      }
      timeout = setTimeout(run, 1000 * (intervalSecs + 1)).unref()
    }
  }

  // An initial run
  await run()

  const close = async () => {
    const lock = await schedulerLock(redis).lock(LOCK_KEY, 1000 * intervalSecs * 2)
    clearTimeout(timeout)
    await lock.unlock().catch((err) => { console.error(err) })
  }

  return {
    close
  }
}

module.exports = { init }
