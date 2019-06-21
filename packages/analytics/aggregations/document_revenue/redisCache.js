const Redlock = require('redlock')
const { deleteKeys } = require('@orbiting/backend-modules-base/lib/Redis')

const MAX_LOADER_TTL_MIN = 20
const LOCK_RETRY_DELAY_MS = 1000 * 2 // 2s
const LOCK_TTL_MS = 1000 * 60 * MAX_LOADER_TTL_MIN

const redlock = (redis) => {
  const _redlock = new Redlock(
    [redis],
    {
      retryDelay: LOCK_RETRY_DELAY_MS,
      retryCount: LOCK_TTL_MS / LOCK_RETRY_DELAY_MS,
      retryJitter: LOCK_RETRY_DELAY_MS / 10,
      driftFactor: 0.01,
    }
  )
  _redlock.on('clientError', (err) => {
    console.error('A redis error has occurred:', err);
  })
  return _redlock
}

const LOCK_KEY_PREFIX = 'analytics:cache:lock'
const REDIS_KEY_PREFIX = 'analytics:cache:data'

const cache = (key, loaderFunc) => {
  const redisKey = `${REDIS_KEY_PREFIX}:${key}`
  const lockKey = `${LOCK_KEY_PREFIX}:${key}`

  const getCached = async (redis) => {
    const cachedResult = await redis.getAsync(redisKey)
    if (cachedResult) {
      //console.log(`cached result for ${redisKey}`)
      return JSON.parse(cachedResult)
    }
  }
  const get = async (context, ...rest) => {
    const { redis } = context
    const cachedResult = await getCached(redis)
    if (cachedResult) {
      return cachedResult
    } else {
      const lock = await redlock(redis).lock(lockKey, LOCK_TTL_MS)

      const cachedResult2 = await getCached(redis)
      if (cachedResult2) {
        //console.log('cachedResult2 present')
        await lock.unlock()
        return cachedResult2
      }
      const result = await loaderFunc(context, ...rest)
      await redis.setAsync(redisKey, JSON.stringify(result))
      await lock.unlock()
      return result
    }
  }

  const invalidate = ({ redis }) => {
    return redis.delAsync(redisKey)
  }

  return {
    get,
    invalidate
  }
}

const clearLocks = (redis) =>
  deleteKeys(LOCK_KEY_PREFIX, redis)


module.exports = {
  cache,
  clearLocks
}
