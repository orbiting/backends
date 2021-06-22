const Promise = require('bluebird')
const visit = require('unist-util-visit')

const {
  document: getDocument,
} = require('@orbiting/backend-modules-publikator/graphql/resolvers/Commit')

const { getDocumentId } = require('../Documents')
const {
  shouldIndexNode,
  getElasticDoc,
  createPublish,
} = require('../DocumentZones')

const loaderBuilders = {
  ...require('@orbiting/backend-modules-publikator/loaders'),
}

const getContext = (payload) => {
  const loaders = {}
  const context = {
    ...payload,
    loaders,
    user: {
      name: 'publikator-pullelasticsearch',
      email: 'ruggedly@republik.ch',
      roles: ['editor'],
    },
  }
  Object.keys(loaderBuilders).forEach((key) => {
    loaders[key] = loaderBuilders[key](context)
  })
  return context
}

module.exports = {
  before: () => {},
  insert: async ({ indexName, type: indexType, elastic, pgdb, redis }) => {
    const stats = { [indexType]: { added: 0, total: 0 } }
    const statsInterval = setInterval(() => {
      console.log(indexName, stats)
    }, 1 * 1000)

    const context = getContext({ pgdb, redis })

    const repos = await pgdb.publikator.repos.find(
      { archivedAt: null },
      { orderBy: { updatedAt: 'desc' } },
    )

    const publish = createPublish(elastic)

    await Promise.map(
      repos,
      async function mapRepo(repo) {
        const { id: repoId } = repo

        const milestones =
          await context.loaders.Milestone.Publication.byRepoId.load(repoId)

        await Promise.each(milestones, async (milestone) => {
          const { commitId, name: versionName } = milestone
          const elasticDocs = []

          const doc = await getDocument(
            { id: milestone.commitId, repoId },
            { publicAssets: true },
            context,
          )
          const documentId = getDocumentId({ repoId, commitId, versionName })

          visit(doc.content, 'zone', (node) => {
            if (shouldIndexNode(node)) {
              elasticDocs.push(
                getElasticDoc(
                  repoId,
                  commitId,
                  documentId,
                  milestone.scheduledAt || milestone.publishedAt,
                  node,
                ),
              )
            }
          })

          await Promise.each(elasticDocs, publish.insert)

          stats[indexType].added += elasticDocs.length
        })
      },
      { concurrency: 10 },
    )

    clearInterval(statsInterval)

    console.log(indexName, stats)
  },
  after: () => {},
  final: () => {},
}
