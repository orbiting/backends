#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const Promise = require('bluebird')
const moment = require('moment')
const debug = require('debug')('republik:script:prolong:generateMembershipSegments')

const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const { AccessToken } = require('@orbiting/backend-modules-auth')

const {
  findEligableMemberships,
  hasDormantMembership: hasDormantMembership_,
  resolveMemberships
} = require('../../modules/crowdfundings/lib/CustomPackages')

const { getLastEndDate } = require('../../modules/crowdfundings/lib/utils')

Promise.props({ pgdb: PgDb.connect(), redis: Redis.connect() }).then(async (connections) => {
  const { pgdb } = connections

  const users = await pgdb.public.query(`
    SELECT u.*
    FROM users u
    JOIN memberships m ON m."userId" = u.id
    WHERE
      email != 'jefferson@project-r.construction'
      AND "deletedAt" IS NULL
      AND email NOT LIKE '%_deleted@republik.ch'
      /* AND email IN (
        'christian.andiel@republik.ch',
        'verena.rothen@korrektorat-lektorat.net'
      ) */
      /* AND u.id IN (
        'bd4ede65-d858-4f7a-98c8-b5a4cb687464',
        'b1625c68-5d00-4eb9-abb6-7844a25b84e9',
        '6e196a46-b1f4-4a3c-8917-bee3937bfe97',
        '67a511fd-4c96-4c90-9fc1-3568d487dbb8'
      ) OR email IN (
        'christian.andiel@republik.ch',
        'verena.rothen@korrektorat-lektorat.net'
      ) */
      -- AND u.id = 'ceb21d95-d318-4c24-abe1-129e6ab335fc'
      -- AND u.roles @> '"gen201912"'
      -- AND m.active = TRUE
    GROUP BY u.id
    ORDER BY RANDOM()
    -- LIMIT 100
  `)

  debug({ users: users.length })

  const memberships = await resolveMemberships({
    memberships: await pgdb.public.memberships.find({
      userId: users.map(user => user.id)
    }),
    pgdb
  })

  debug({ memberships: memberships.length })

  await Promise.map(
    users,
    async (user, index) => {
      users[index].memberships = memberships.filter(m => m.userId === user.id)
      users[index].accessToken = await AccessToken.generateForUser(user, 'CUSTOM_PLEDGE_EXTENDED')
    }
  )

  // console.log(users[0].memberships)

  debug('data gathered. segmenting...')

  const segments = {
    'prolong-before-feb': [], // Dez to Januar
    'prolong-between-feb-mar': [], // Februar to Mar
    'prolong-after-mar-autopay-monthly': [], // active
    'cancelled-active': [], // cancelled, but still active
    alumni: [],
    others: []
  }

  const stats = {
    users: users.length,
    evaluated: 0
  }

  await Promise.map(
    users,
    async (user, index) => {
      const activeMembership = user.memberships.find(m => m.active)

      // memberships which could be prolonged
      const eligableMemberships = findEligableMemberships({
        memberships: user.memberships,
        user,
        ignoreClaimedMemberships: true
      })

      // check if there is a dormant membership
      const hasDormantMembership = hasDormantMembership_({
        user,
        memberships: eligableMemberships
      })

      // return last end date of all eligable memberships
      const lastEndDate = moment(getLastEndDate(
        eligableMemberships
          .reduce((acc, cur) => acc.concat(cur.periods), [])
          .filter(Boolean))
      )

      const hadSomePeriods = user.memberships
        .reduce((acc, cur) => acc.concat(cur.periods), [])
        .filter(Boolean)
        .length > 0

      const mostRecentPackageOption =
        activeMembership &&
        activeMembership.periodEndingLast.pledgeOption &&
        activeMembership.periodEndingLast.pledgeOption.packageOption

      const pledgePackageOption =
        activeMembership &&
        activeMembership.pledgeOption &&
        activeMembership.pledgeOption.packageOption

      const membershipTypeName = (mostRecentPackageOption && mostRecentPackageOption.membershipType.name) ||
        (pledgePackageOption && pledgePackageOption.membershipType.name)

      const price = (mostRecentPackageOption && mostRecentPackageOption.price) ||
        (pledgePackageOption && pledgePackageOption.price)

      const row = {
        ...user,
        membershipTypeName: ['ABO', 'BENEFACTOR_ABO'].includes(membershipTypeName) ? membershipTypeName : 'ABO',
        price: price >= 24000 ? price : 24000
      }

      if (
        !!activeMembership &&
        activeMembership.renew === false
      ) {
        segments['cancelled-active'].push(row)
      } else if (
        !!activeMembership &&
        activeMembership.membershipType.name !== 'MONTHLY_ABO' &&
        lastEndDate.isBefore('2020-02-01') &&
        activeMembership.autoPay === false &&
        !hasDormantMembership
      ) {
        segments['prolong-before-feb'].push(row)
      } else if (
        !!activeMembership &&
        activeMembership.membershipType.name !== 'MONTHLY_ABO' &&
        lastEndDate.isBetween('2020-02-01', '2020-04-01') &&
        activeMembership.autoPay === false &&
        !hasDormantMembership
      ) {
        segments['prolong-between-feb-mar'].push(row)
      } else if (
        !!activeMembership && (
          lastEndDate.isAfter('2020-04-01') ||
          activeMembership.membershipType.name === 'MONTHLY_ABO' ||
          activeMembership.autoPay === true ||
          hasDormantMembership
        )
      ) {
        segments['prolong-after-mar-autopay-monthly'].push(row)
      } else if (
        !activeMembership &&
        user.memberships.length > 0 &&
        hadSomePeriods
      ) {
        segments.alumni.push(row)
      } else {
        segments.others.push(row)
      }

      stats.evaluated++

      if (index % Math.round(users.length * 0.05) === 0) {
        debug({ stats })
      }
    }
  )

  debug({ stats })

  console.log(['userId', 'userEmail', 'kampaSegment,accessToken,membershipType,price,price2'].join(','))

  await Promise.each(Object.keys(segments), async label => {
    const segmentedUser = segments[label]
    debug('segment %o', { label, segmentedUser: segmentedUser.length })

    segments[label].forEach(user => {
      console.log([
        user.id,
        user.email,
        label,
        user.accessToken,
        user.membershipTypeName,
        user.price,
        user.price && user.price * 2
      ].join(','))
    })

    /* await pgdb.public.paeKampaSegments.insert(segmentedUser.map(um => ({
      userId: um.id,
      segment: label,
      membershipTypeName: um.membershipTypeName,
      price: um.price
    }))) */
  })

  return connections
})
  .then(async ({ pgdb, redis }) => {
    await PgDb.disconnect(pgdb)
    await Redis.disconnect(redis)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
