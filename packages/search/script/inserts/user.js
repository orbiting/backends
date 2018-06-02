const _ = require('lodash')

const bulk = require('../../lib/indexPgTable')

const transform = function (row) {
  row.__sort = {
    date: row.createdAt
  }

  row.resolved = {
    credential: ''
  }

  const credential = _.find(
    this.payload.credentials,
    { userId: row.id, isListed: true }
  )

  if (credential) {
    row.resolved.credential = credential.description.trim()
  }

  row.name = `${row.firstName} ${row.lastName}`.trim()

  return row
}

const getDefaultResource = async ({ pgdb }) => {
  return {
    table: pgdb.public.comments,
    payload: {
      table: pgdb.public.users,
      payload: {
        credentials: await pgdb.public.credentials.find(
          {},
          {
            fields: [
              'id',
              'userId',
              'description',
              'isListed'
            ]
          }
        )
      },
      transform
    },
    transform
  }
}

module.exports = {
  before: () => {},
  insert: async ({ resource, ...rest }) => {
    resource = Object.assign(
      await getDefaultResource({ resource, ...rest }),
      resource
    )

    return bulk.index({ resource, ...rest })
  },
  after: () => {}
}
