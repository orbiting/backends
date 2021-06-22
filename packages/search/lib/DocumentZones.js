const crypto = require('crypto')
const { mdastToString } = require('@orbiting/backend-modules-utils')

const { getIndexAlias, mdastFilter } = require('./utils')
const { termEntry } = require('./schema')
const { rangeAggBuilder } = require('./aggregations')
const { rangeCriteriaBuilder, termCriteriaBuilder } = require('./filters')

const indexType = 'DocumentZone'
const indexRef = {
  index: getIndexAlias(indexType.toLowerCase(), 'write'),
  type: indexType,
}

const schema = {
  // special value to indicate this schemas index type
  __type: indexType,
  id: {
    criteria: termCriteriaBuilder('_id'),
  },
  type: termEntry('__type'),
  documentZoneIdentifier: termEntry('identifier'),
  documentZoneDataType: termEntry('data.type'),
  documentZoneDataSize: termEntry('data.size'),
  documentZoneDataColumns: {
    criteria: rangeCriteriaBuilder('data.columns'),
    agg: rangeAggBuilder('data.columns'),
    options: {
      filter: {
        bool: {
          must: {
            exists: {
              field: 'data.columns',
            },
          },
        },
      },
      ranges: [{ to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4 }],
    },
  },
}

const shouldIndexNode = (node) =>
  node.type === 'zone' &&
  ['CHART', 'DYNAMIC_COMPONENT', 'FIGURE'].includes(node.identifier)
// , 'FIGURE', 'DYNAMIC_COMPONENT'

const getZoneHash = (node) =>
  crypto.createHash('md5').update(JSON.stringify(node)).digest('hex')

const getZoneId = (repoId, hash) =>
  Buffer.from(`${repoId}/${hash}`).toString('base64')

const getElasticDoc = (repoId, commitId, documentId, date, node) => {
  const hash = getZoneHash(node)
  const id = getZoneId(repoId, hash)

  const { identifier } = node

  return {
    __type: indexType,
    __sort: { date },
    id,
    repoId,
    commitId,
    documentId,
    hash,
    identifier,
    node,
    data: node?.data || {},
    text:
      mdastToString(mdastFilter(node, (n) => n.type === 'code')).trim() || '',
  }
}

const createPublish = (elastic) => ({
  insert: async (elasticDoc) =>
    elastic.index({
      ...indexRef,
      id: elasticDoc.id,
      body: {
        ...elasticDoc,
      },
    }),
})

module.exports = {
  schema,
  shouldIndexNode,
  getElasticDoc,
  createPublish,
}
