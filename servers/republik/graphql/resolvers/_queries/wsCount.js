const { zRangeUnexpiredAndGC } = require('@orbiting/backend-modules-base/lib/Redis')
const Promise = require('bluebird')

module.exports = async (_, args, { redis }) => {
  const serverIds = await zRangeUnexpiredAndGC(redis, 'servers', 1000 * 15)
  const counts = await Promise.map(
    serverIds,
    (id) => redis.scardAsync(`servers:${id}:ws`)
  )
  return counts.reduce(
    (acc, cur) => acc + cur, 0
  )
}
