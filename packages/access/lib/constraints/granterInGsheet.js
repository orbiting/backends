const debug = require('debug')('access:lib:constraints:granterInGsheet')

/**
 * Constraint checks if granter's user ID is to be found in a gsheet {settings.name}.
 * If not found, constraint will fail. Contraint will hinder display of campaign.
 *
 * Story: Campaign should only be visible to users listed in a spreadsheet.
 *
 * @example: {
 *  "recipientInGsheet": {
 *    "name": "accessCampaignSomeGsheet",
 *    "idenfitifer": "userId",
 *    "flag": "enabled"
 *  }
 * }
 */

const isGrantable = async (args, context) => {
  const { granter, settings } = args
  const { pgdb } = context

  const {
    name, // gsheets.name field
    identifier, // row which contains a user ID
    flag // (optional) row which all enables or disables campaign ("TRUE", "FALSE")
  } = settings

  if (!name) {
    debug('settings.name property is falsy')
  }

  if (!identifier) {
    debug('settings.identifier property is falsy')
  }

  const users = await pgdb.public.gsheets.findOneFieldOnly({ name }, 'data')

  if (!users) {
    debug(`Specified gsheet "${name}" is either missing or emmpty`)
    return false
  }

  const isGrantable = !!users.find(user => user[identifier] === granter.id && (!flag || user[flag] === 'TRUE'))

  debug(
    'isGrantable',
    {
      granter: granter.id,
      settings,
      isGrantable
    }
  )

  return isGrantable
}

const getMeta = async (args, context) => {
  const isGrantableFlag = await isGrantable(args, context)

  const meta = {
    visible: isGrantableFlag,
    grantable: isGrantableFlag,
    payload: {}
  }

  return meta
}

module.exports = {
  isGrantable,
  getMeta
}
