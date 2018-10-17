const RateLimit = require('express-rate-limit')
const RedisStore = require('rate-limit-redis')
const redis = require('../lib/redis')

const windowMs = 10 * 60 * 1000 // 10 minutes

const generateKey = (req) =>
  (req.user ? `${req.user.id}-${req.ip}` : req.ip)

module.exports = new RateLimit({
  store: new RedisStore({
    client: redis,
    expiry: windowMs / 1000 // https://github.com/wyattjoh/rate-limit-redis/issues/12
  }),
  windowMs,
  max: 1000, // 1.66 rps max over 10mins
  onLimitReached (req, res, options) {
    const user = req.user && req.user.id
    const ip = req.ip
    console.warn(`ratelimit reached for user: ${user} IP: ${ip}`, {
      user,
      ip,
      limit: req.rateLimit
    })
  },
  keyGenerator (req) {
    return generateKey(req)
  }
})
