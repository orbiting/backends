const { Roles } = require('@orbiting/backend-modules-auth')

module.exports = async (_, args, { pgdb, user: me }) => {
  Roles.ensureUserIsInRoles(me, [
    'member',
    'editor',
    'moderator',
    'supporter',
    'admin',
  ])

  return pgdb.public.discussions.find({ hidden: false })
}
