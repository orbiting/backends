const {
  AccessToken: { getUserByAccessToken },
} = require('@orbiting/backend-modules-auth')

const { getOffer } = require('../../../lib/offer')

module.exports = async (_, args, context, info) => {
  const { accessToken } = args

  if (accessToken) {
    const overrideUser = await getUserByAccessToken(args.accessToken, context)

    if (overrideUser) {
      return getOffer(context, overrideUser)
    }
  }

  return getOffer(context)
}
