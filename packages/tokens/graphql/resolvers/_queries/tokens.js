const { Roles } = require('@orbiting/backend-modules-auth')
const transformTokens = require('../../../lib/transformTokens')

module.exports = async (_, { email, skip, take }, { user, pgdb }) => {
  Roles.ensureUserIsInRoles(user, ['supporter', 'admin'])

  var tokens = await pgdb.public.tokens.find({ email })
  var relevantTokens = tokens.slice(skip).slice(0, take)

  return transformTokens(relevantTokens)
}
