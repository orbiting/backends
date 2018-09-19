const getElections = require('../../../lib/getElections')

const {
  Roles,
  ensureSignedIn
} = require('@orbiting/backend-modules-auth')

module.exports = async (_, { slug }, { pgdb, user: me, req }) => {
  ensureSignedIn(req)
  Roles.ensureUserIsInRoles(me, ['admin', 'support'])

  const elections = await getElections(pgdb, {slug})

  return elections[0]
}
