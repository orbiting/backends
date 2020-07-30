#!/usr/bin/env node
require('@orbiting/backend-modules-env').config()

const Promise = require('bluebird')

const { lib: { ConnectionContext } } = require('@orbiting/backend-modules-base')

const getClients = require('../../modules/crowdfundings/lib/payments/stripe/clients')
const addSource = require('../../modules/crowdfundings/lib/payments/stripe/addSource')
const { suggest } = require('../../modules/crowdfundings/lib/AutoPay')

const applicationName = 'backends republik script prolong stripeSetDefaultSource'

ConnectionContext.create(applicationName).then(async context => {
  const { pgdb } = context
  const { platform } = await getClients(pgdb)

  const memberships = await pgdb.query(`
    SELECT
      m."userId",
      m.id "membershipId",
      sc.id "stripeCustomerId"

    FROM "memberships" m

    JOIN "stripeCustomers" sc
      ON sc."userId" = m."userId"
      AND sc."companyId" = '240ef27d-cf26-48c1-81df-54b2a10732f4' -- Project R

    WHERE
      m.active = TRUE AND
      m.renew = TRUE AND
      m."membershipTypeId" IN (
        SELECT id
        FROM "membershipTypes"
        WHERE name IN ('ABO', 'BENEFACTOR_ABO')
      )

    ORDER BY RANDOM()
  `)

  await Promise.map(memberships, async membership => {
    // Run AutoPay suggestion, which includes card/sourceId we would charge
    const suggestion = await suggest(membership.membershipId, pgdb)

    if (!suggestion) {
      console.log(`userId:${membership.userId}`, 'missing suggestion')
      return
    }

    // Find Stripe customer
    const stripeCustomer = await platform.stripe.customers.retrieve(membership.stripeCustomerId)

    if (!stripeCustomer) {
      console.error(
        `userId:${membership.userId}`,
        `ERROR: stripe customer ${membership.stripeCustomerId} not found`
      )
      return
    }

    if (stripeCustomer.deleted) {
      console.error(
        `userId:${membership.userId}`,
        `ERROR: stripe customer ${membership.stripeCustomerId} deleted`
      )
      return
    }

    // Compare AutoPay suggestion card/sourceId with current default_source on Stripe
    if (suggestion.sourceId === stripeCustomer.default_source) {
      console.log(`userId:${membership.userId}`, 'default_source OK')
      return
    }

    // Check if card/sourceId is available we would like to default to (in case it was deleted)
    if (!stripeCustomer.sources.data.find(s => s.id === suggestion.sourceId)) {
      console.error(`userId:${membership.userId}`, 'ERROR: source.id not available')
    }

    console.log(`userId:${membership.userId}`, `set default_source to ${suggestion.sourceId}`)

    await addSource({
      sourceId: suggestion.sourceId,
      userId: membership.userId,
      pgdb,
      deduplicate: true,
      makeDefault: true
    })
  }, { concurrency: 5 })

  console.log('Done.')

  return context
})
  .then(context => ConnectionContext.close(context))
