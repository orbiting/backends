const utils = require('@orbiting/backend-modules-search/lib/utils')

module.exports = async ({ paths = [] }, { elastic }) => {
  const results = await elastic.search({
    index: utils.getIndexAlias('document', 'read'),
    _source: [ 'meta' ],
    size: paths.length * 2,
    body: {
      query: {
        bool: {
          must: [
            { terms: { 'meta.path.keyword': paths } },
            { term: { '__state.published': true } }
          ]
        }
      }
    }
  })

  return results.hits && results.hits.hits && results.hits.hits.map(hit => hit._source.meta)
}
