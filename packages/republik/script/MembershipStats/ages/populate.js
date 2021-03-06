#!/usr/bin/env node
/**
 * Script will populate underlying data for MembershipStats.ages
 *
 * No options or arguments available.
 */
require('@orbiting/backend-modules-env').config()
const {
  lib: { ConnectionContext },
} = require('@orbiting/backend-modules-base')

const { populate } = require('../../../lib/MembershipStats/ages')

const applicationName = 'backends republik script MembershipStats ages populate'

ConnectionContext.create(applicationName)
  .then(async (context) => {
    console.log('Begin...')
    await populate(context)
    console.log('Done.')

    return context
  })
  .then((context) => ConnectionContext.close(context))
