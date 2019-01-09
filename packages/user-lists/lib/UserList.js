const POSITIONS_LIST_NAME = 'positions'

const findForUser = (userId, { pgdb }) =>
  pgdb.public.userLists.find({
    hidden: false
  })
    .then(dls => dls
      .map(dl => Object.assign(dl, { userId }))
    )

const byNameForUser = (name, userId, { loaders }) =>
  loaders.UserList.byKeyObj.load({
    name
  })
    .then(dl => dl
      ? Object.assign(dl, { userId })
      : null
    )

const byIdForUser = (id, userId, { loaders }) =>
  loaders.UserList.byKeyObj.load({ id })
    .then(dl => dl
      ? Object.assign(dl, { userId })
      : null
    )

const findDocumentItems = (query, { pgdb }) => {
  const where = Object.keys(query)
    .map(key => `di."${key}" = :${key}`)
    .join(' AND ')
  return pgdb.public.query(`
    SELECT
      di.*
    FROM
      "userListDocumentItems" di
    WHERE
      ${where} AND
      di."userListId" IN (
        SELECT id
        FROM "userLists" ul
        WHERE ul.hidden = false
      )
  `,
  query
  )
}

const getDocumentPositionItem = (repoId, userId, { pgdb }) =>
  pgdb.public.query(`
    SELECT
      di.*
    FROM
      "userListDocumentItems" di
    WHERE
      di."repoId" = :repoId AND
      di."userId" = :userId AND
      di."userListId" = (
        SELECT id
        FROM "userLists" ul
        WHERE ul."name" = :listName
      )
  `, {
    repoId,
    userId,
    listName: POSITIONS_LIST_NAME
  })
    .then(items => items[0])
    .then(item => item && ({
      ...item.data,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))

const upsertDocumentItem = async (userId, userListId, repoId, data, pgdb) => {
  const query = {
    userId,
    userListId,
    repoId
  }
  const existingItem = await pgdb.public.userListDocumentItems.findOne(query)
  if (!existingItem) {
    return pgdb.public.userListDocumentItems.insert(
      {
        ...query,
        data
      },
      { skipUndefined: true }
    )
  } else {
    return pgdb.public.userListDocumentItems.update(
      {
        id: existingItem.id
      },
      {
        updatedAt: new Date(),
        ...query,
        data
      },
      { skipUndefined: true }
    )
  }
}

const deleteDocumentItem = (userId, userListId, repoId, pgdb) =>
  pgdb.public.userListDocumentItems.delete({
    userId,
    userListId,
    repoId
  })

module.exports = {
  POSITIONS_LIST_NAME,
  findForUser,
  byNameForUser,
  byIdForUser,
  findDocumentItems,
  getDocumentPositionItem,
  upsertDocumentItem,
  deleteDocumentItem
}
