const debug = require('debug')('preview:lib:preview')
const moment = require('moment')
const Mailchimp = require('mailchimp-api-v3')
const crypto = require('crypto')
const Promise = require('bluebird')

const mailLib = require('./mail')

const expireAfter = moment.duration('48:00:00')

const {
  MAILCHIMP_API_KEY,
  MAILCHIMP_MAIN_LIST_ID,
  MAILCHIMP_INTEREST_PREVIEW,
  MAILCHIMP_INTEREST_NEWSLETTER_PREVIEW
} = process.env

const mailchimp = new Mailchimp(MAILCHIMP_API_KEY)

const md5 = (email) =>
  crypto
    .createHash('md5')
    .update(email.toLowerCase())
    .digest('hex')

const begin = async ({ userId, contexts, pgdb, t }) => {
  debug('beginPreview')

  if (!contexts || !contexts.includes('preview')) {
    debug('no "preview" in contexts found')
    return
  }

  const transaction = await pgdb.transactionBegin()

  try {
    const user = await transaction.public.users.findOne({ id: userId })

    const otherRequests = await findValidByUser(user, pgdb)

    if (otherRequests.length === 0) {
      const request = await transaction.public.previewRequests.insertAndGet({
        userId: user.id
      })

      debug('request', { request })

      const event = await transaction.public.previewEvents.insertAndGet({
        previewRequestId: request.id,
        event: 'added'
      })

      debug('event', { event })

      await mailLib.sendOnboarding({ user, request, pgdb: transaction, t })
    } else {
      debug('request omitted, user has valid requests', { otherRequests })
    }

    await transaction.transactionCommit()
  } catch (e) {
    await transaction.transactionRollback()
    throw e
  }
}

const schedule = async (requests, users, pgdb, mail) => {
  debug('schedule', { requests: requests.length, users: users.length })

  await Promise.map(
    users,
    async (user) => mail.enforceSubscriptions({ userId: user.id, pgdb }),
    { concurrency: 5 }
  )

  // Patch users with PREVIEW related interests on MailChimp, later scheduled
  // to be removed again.
  await setInterestsMailchimp(users, true)

  await Promise.map(
    requests,
    async (request) => {
      const user = users.find(user => user.id === request.userId)
      await setScheduled(request, user, pgdb)
    },
    { concurrency: 5 }
  )
}

const expire = async (requests, users, pgdb, mail) => {
  debug('expire', { requests: requests.length, users: users.length })

  // Patch users, remove PREVIEW related interests on MailChimp which were
  // previously added.
  await setInterestsMailchimp(users, false)

  await Promise.map(
    requests,
    async (request) => {
      const user = users.find(user => user.id === request.userId)
      await setExpired(request, user, pgdb)
    },
    { concurrency: 5 }
  )
}

const findUnscheduled = (pgdb) => {
  debug('findUnscheduled')

  return pgdb.public.previewRequests.find({
    scheduledAt: null,
    expiredAt: null
  })
}

const findVoidable = (pgdb) => {
  const scheduledAtBefore = moment().subtract(expireAfter)

  debug('findVoidable', { scheduledAtBefore })

  return pgdb.public.previewRequests.find({
    'scheduledAt <': scheduledAtBefore,
    expiredAt: null
  })
}

const findValidByUser = (user, pgdb) => {
  return pgdb.public.previewRequests.find({
    userId: user.id,
    expiredAt: null
  })
}

const setScheduled = async (request, user, pgdb) => {
  await Promise.all([
    pgdb.public.previewRequests.update(
      { userId: user.id, scheduledAt: null },
      { scheduledAt: moment(), updatedAt: moment() }
    ),
    pgdb.public.previewEvents.insertAndGet({
      previewRequestId: request.id,
      event: 'scheduled'
    })
  ])
}

const setExpired = async (request, user, pgdb) => {
  await Promise.all([
    pgdb.public.previewRequests.updateAndGet(
      { userId: user.id, 'scheduledAt !=': null },
      { expiredAt: moment(), updatedAt: moment() }
    ),
    pgdb.public.previewEvents.insertAndGet({
      previewRequestId: request.id,
      event: 'expired'
    })
  ])
}

const setInterestsMailchimp = async (users, enable) =>
  mailchimp.batch(
    users.map(user => ({
      method: 'PATCH',
      path: `/lists/${MAILCHIMP_MAIN_LIST_ID}/members/${md5(user.email)}`,
      body: {
        interests: {
          [MAILCHIMP_INTEREST_PREVIEW]: enable,
          [MAILCHIMP_INTEREST_NEWSLETTER_PREVIEW]: enable
        }
      }
    }))
  )

module.exports = {
  begin,
  findUnscheduled,
  schedule,
  findVoidable,
  expire,
  findValidByUser
}
