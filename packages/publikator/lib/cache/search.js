const debug = require('debug')('publikator:cache:search')
const utils = require('@orbiting/backend-modules-search/lib/utils')

/**
 * Determines desired sorting of data when querying ElasticSearch due to
 * passed arguments. Currently relies on {orderBy.field}, {orderBy.direction}
 * @param  {[type]} args [description]
 * @return {[type]}      [description]
 */
const getSort = (args) => {
  // Default sorting
  if (!args.orderBy) {
    return
  }

  // see https://developer.github.com/v4/enum/repositoryorderfield/
  const map = {
    CREATED_AT: 'createdAt',
    NAME: 'name.keyword',
    PUSHED_AT: 'latestCommit.date',
    UPDATED_AT: 'updatedAt',
    // 'STARGAZERS' is not implemented. Keeping in sync is hard.
  }

  const field = map[args.orderBy.field]

  if (!field) {
    throw new Error(
      `Unable to order by "${args.orderBy.field}", probably missing or not implemented.`,
    )
  }

  return {
    sort: {
      [field]: args.orderBy.direction
        ? args.orderBy.direction.toLowerCase()
        : 'asc', // Default direction if not available.
    },
  }
}

/**
 * Fields ElasticSearch shall return. Excludes contentString, contentMeta and
 * other fields as they are not used to created a resolved document but for mere
 * index, query and search purposes.
 *
 * @return {Object} {_source} object for ElasticSearch client body.
 */
const getSourceFilter = () => ({
  _source: {
    excludes: [
      'contentMeta',
      'contentString',
      'contentStrings',
      'createdAt',
      'name',
      'updatedAt',
    ],
  },
})

/**
 * Finds data in ElasticSearch index using passed arguments. Includes
 * pagination and sorting.
 *
 * @param  {[type]}  args [description]
 * @return {Promise}      [description]
 */
const find = async (args, { elastic }) => {
  debug('args: %o', args)
  const { isTemplate } = args

  const fields = [
    'contentMeta.description',
    'contentMeta.facebookDescription',
    'contentMeta.facebookTitle',
    'contentMeta.format',
    'contentMeta.section',
    'contentMeta.staticPage',
    'contentMeta.seriesMaster.episodes.document',
    'contentMeta.seriesMaster.episodes.label',
    'contentMeta.seriesMaster.episodes.title',
    'contentMeta.seriesMaster.title',
    'contentMeta.shortTitle',
    'contentMeta.slug',
    'contentMeta.subject',
    'contentMeta.template',
    'contentMeta.title',
    'contentMeta.twitterDescription',
    'contentMeta.twitterTitle',
    'contentString',
    'contentStrings.credits',
    'contentStrings.lead',
    'contentStrings.subject',
    'contentStrings.text',
    'contentStrings.title',
    'name',
  ]

  const query = {
    bool: {
      must: [{ term: { isArchived: false } }],
      must_not: [],
    },
  }

  if (isTemplate) {
    query.bool.must.push({ term: { isTemplate: true } })
  } else if (isTemplate === false) {
    query.bool.must_not.push({ term: { isTemplate: true } })
  }

  if (args.id) {
    query.bool.must.push({ term: { _id: args.id } })
  }

  if (args.search) {
    query.bool.must.push({
      simple_query_string: {
        query: args.search,
        fields,
        default_operator: 'AND',
      },
    })
  }

  if (args.template) {
    query.bool.must.push({
      term: { 'contentMeta.template': args.template },
    })
  }

  return elastic.search({
    index: utils.getIndexAlias('repo', 'read'),
    from: args.from,
    size: args.first,
    body: {
      ...getSort(args),
      ...getSourceFilter(),
      query,
    },
  })
}

const mapHit = ({ _source }) => {
  _source.latestCommit.repo = {
    id: _source.id,
  }

  return _source
}

module.exports = {
  find,
  mapHit,
}
