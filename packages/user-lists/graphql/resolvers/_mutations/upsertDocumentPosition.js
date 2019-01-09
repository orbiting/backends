const addDocumentToList = require('./addDocumentToList')
const UserList = require('../../../lib/UserList')

module.exports = async (_, { documentId, percentage, nodeId }, context) =>
  addDocumentToList(
    null,
    {
      documentId,
      listName: UserList.POSITIONS_LIST_NAME,
      data: {
        percentage,
        nodeId
      }
    },
    context
  )
