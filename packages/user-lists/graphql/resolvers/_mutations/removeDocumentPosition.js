const removeDocumentFromList = require('./removeDocumentFromList')
const UserList = require('../../../lib/UserList')

module.exports = async (_, { documentId }, context) =>
  removeDocumentFromList(
    null,
    {
      documentId,
      listName: UserList.POSITIONS_LIST_NAME
    },
    context
  )
