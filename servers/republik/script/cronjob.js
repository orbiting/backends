#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const debug = require('debug')('republik:script:cronjob')
const Promise = require('bluebird')
const Redlock = require('redlock')
const yargs = require('yargs')

const { t } = require('@orbiting/backend-modules-translate')
const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const { expireGrants, followupGrants } = require('@orbiting/backend-modules-access')

const { changeover } = require('../modules/crowdfundings/lib/jobs/changeover')
const { deactivate } = require('../modules/crowdfundings/lib/jobs/deactivate')
const { inform: informGivers } = require('../modules/crowdfundings/lib/jobs/givers')
const { inform: informWinbacks } = require('../modules/crowdfundings/lib/jobs/winbacks')
const { run: owners } = require('../modules/crowdfundings/lib/jobs/owners')
const mail = require('../modules/crowdfundings/lib/Mail')

const jobs = {
  'access-expire': { fn: expireGrants },
  'access-followup': { fn: followupGrants },
  changeover: { fn: changeover },
  deactivate: { fn: deactivate },
  'inform-givers': { fn: informGivers },
  'inform-winbacks': { fn: informWinbacks },
  owners: { fn: owners },
  'dummy-fail': { fn: () => { throw new Error('Dummy Test Error') } },
  'dummy-pass': { fn: () => {} }
}

const LOCK_TTL_IN_SECS = 120

const argv = yargs
  .option('jobs', {
    description: `jobs to run [${Object.keys(jobs).sort().join(', ')}]`,
    alias: ['job', 'j'],
    array: true,
    required: true
  })
  .option('concurrency', {
    description: '# of jobs to run in parallel',
    default: 1,
    type: 'number'
  })
  .option('dry-run', {
    default: true
  })
  .check(argv => {
    if (argv.jobs.length === 0) {
      return 'Check --jobs. No jobs provided.'
    }

    const unknownJobs = argv.jobs.filter(key => !jobs[key])
    if (unknownJobs.length > 0) {
      return `Check --jobs. Unable to recognize some job(s): ${unknownJobs.join(', ')}`
    }

    return true
  })
  .argv

const start = process.hrtime()

Promise.props({ pgdb: PgDb.connect(), redis: Redis.connect() }).then(async (connections) => {
  if (argv.dryRun) {
    console.warn('In dry-run mode. Use --no-dry-run to execute jobs.')
  }

  const { pgdb, redis } = connections

  debug('start run. jobs: %o', argv.jobs)

  const args = { now: new Date(), dryRun: false }
  const context = { t, mail, pgdb, redis }

  await Promise.map(
    argv.jobs,
    async key => {
      const job = jobs[key]

      const start = process.hrtime()
      job._debug = debug.extend(key)
      job._debug('start job')

      try {
        job._lock = await new Redlock([redis])
          .lock(`locks:cronjob:${key}`, 1000 * LOCK_TTL_IN_SECS)
          .then(lock => { job._debug('locking...'); return lock })

        job._relockInterval = setInterval(
          () =>
            job._lock.extend(1000 * LOCK_TTL_IN_SECS)
              .then(() => { job._debug('lock extended...') })
              .catch(e => { job._debug('%o', e) }),
          1000 * LOCK_TTL_IN_SECS * 0.9
        )

        if (argv.dryRun) {
          job._debug('dry-run mode. would run now')
        } else {
          job._debug('executing...')
          await job.fn(args, context)
        }
      } catch (e) {
        job._debug('%o', e)
      }

      job._relockInterval && clearInterval(job._relockInterval)
      job._lock && await job._lock.unlock()
        .then(() => { job._debug('unlocked...') })
        .catch((e) => { job._debug('%o', e) })

      const [durationInSecs] = process.hrtime(start)

      job._debug(
        'job done: %o',
        { durationInSecs }
      )
    },
    { concurrency: argv.concurrency }
  )

  return connections
})
  .then(async ({ pgdb, redis }) => {
    await PgDb.disconnect(pgdb)
    await Redis.disconnect(redis)

    const [durationInSecs] = process.hrtime(start)
    debug('run complete: %o', { durationInSecs })
  }).catch(e => {
    console.error(e)
    process.exit(1)
  })
