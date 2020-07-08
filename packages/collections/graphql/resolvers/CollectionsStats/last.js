const { createCache } = require('../../../lib/stats/last')

module.exports = async (_, args, context) => {
  const { name, interval } = args

  const collection = await context.loaders.Collection.byKeyObj.load({ name })

  if (!collection) {
    throw new Error(`Collection "${name}" not found`)
  }

  // Fetch pre-populated data
  const data = await createCache({ key: interval }, context).get()

  // In case pre-populated data is not available...
  if (!data) {
    throw new Error('Unable to retrieve pre-populated data for Collection.CollectionsStats.last')
  }

  // Retrieve pre-populated data.
  const { result = [], updatedAt = new Date() } = data

  const collectionResult = result.find(({ collectionId }) => collectionId === collection.id)

  if (!collectionResult) {
    throw new Error('Unable to retrieve collection in pre-populated data for Collection.CollectionsStats.last')
  }

  return {
    ...collectionResult,
    updatedAt
  }
}