const debug = require('debug')('base:lib:redis')
const redis = require('redis')
const bluebird = require('bluebird')

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

const connect = () => {
  const url = process.env.REDIS_URL

  debug('connecting client', { url })
  const client = redis.createClient(url)

  client.__defaultExpireSeconds = 3 * 7 * 24 * 60 * 60 // 3 weeks
  client.__shortExpireSeconds = 3 * 24 * 60 * 60 // 3 days

  return client
}

const disconnect = client =>
  client.quit()

const zipArray = (array) => {
  let newArray = []
  for (let i = 0; i < array.length; i += 2) {
    newArray.push({
      value: array[i],
      score: parseInt(array[i + 1])
    })
  }
  return newArray
}

const zRangeUnexpiredAndGC = async (redis, key, ttl) => {
  const minScore = new Date().getTime() - ttl
  const result = await redis.zrangeAsync(key, 0, -1, 'WITHSCORES')
    .then(objs => zipArray(objs))
  let objs = []
  let expiredObjs = []
  for (let r of result) {
    if (r.score > minScore) {
      objs.push(r.value)
    } else {
      expiredObjs.push(r.value)
    }
  }
  await Promise.all(expiredObjs.map(expiredKey =>
    redis.zremAsync(key, expiredKey)
  ))
  return objs
}

module.exports = {
  connect,
  disconnect,
  zRangeUnexpiredAndGC
}
