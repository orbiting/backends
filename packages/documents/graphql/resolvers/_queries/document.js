const getDocuments = require('./documents')

module.exports = async (_, args, context, info) => {
  const { id, path, repoId } = args

  if (!path && !id && !repoId) {
    throw new Error('Please provide a path or repoId')
  }

  return getDocuments(_, { id, path, repoId }, context, info).then(
    (docCon) => docCon.nodes[0],
  )
}
