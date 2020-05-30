const { Roles } = require('@orbiting/backend-modules-auth')

module.exports = async (_, { email, skip, take }, { user, pgdb }) => {
  Roles.ensureUserIsInRoles(user, ['supporter', 'admin'])

  const tokens = await pgdb.public.tokens.find({ email })
  return tokens.slice(skip).slice(0, take)
}
