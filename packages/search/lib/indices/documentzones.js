const type = 'DocumentZone'

module.exports = {
  type,
  name: type.toLowerCase(),
  search: {
    termFields: {
      text: {
        highlight: {
          number_of_fragments: 0,
        },
      },
    },
    filter: {
      default: () => ({
        bool: {
          must: [{ term: { __type: type } }],
        },
      }),
    },
  },
  analysis: {
    filter: {
      german_stemmer: {
        type: 'stemmer',
        language: 'light_german',
      },
    },
    analyzer: {
      german_with_stopwords: {
        // @see https://www.elastic.co/guide/en/elasticsearch/reference/6.8/analysis-lang-analyzer.html#german-analyzer
        tokenizer: 'standard',
        filter: ['lowercase', 'german_normalization', 'german_stemmer'],
      },
    },
  },
  mapping: {
    [type]: {
      dynamic: false,
      properties: {
        __type: {
          type: 'keyword',
        },
        __sort: {
          properties: {
            date: {
              type: 'date',
            },
          },
        },
        identifier: {
          type: 'keyword',
        },
        text: {
          type: 'text',
          analyzer: 'german_with_stopwords',
        },
        data: {
          properties: {
            // CHART data.type
            type: {
              type: 'keyword',
            },
            size: {
              type: 'keyword',
            },
            // CHART data.columns
            columns: {
              type: 'integer',
            },
          },
        },
      },
    },
  },
}
