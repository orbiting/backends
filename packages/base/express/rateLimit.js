const RateLimit = require('express-rate-limit')
const RedisStore = require('rate-limit-redis')
const redis = require('../lib/redis')
const { publish } = require('@orbiting/backend-modules-slack')

const {
  SLACK_CHANNEL_IT_ALERTS
} = process.env

const windowMs = 10 * 60 * 1000 // 10min

const generateKey = (req) => {
  const ip = req._ip()
  return (req.user ? `${req.user.id}_${ip}` : ip)
}

module.exports = new RateLimit({
  store: new RedisStore({
    client: redis,
    expiry: windowMs / 1000 // https://github.com/wyattjoh/rate-limit-redis/issues/12
  }),
  windowMs,
  max: 2 * (windowMs / 1000), // 2rps over 10mins = 1200req over 10min
  keyGenerator (req) {
    return generateKey(req)
  },
  onLimitReached (req, res, options) {
    const user = req.user && req.user.id
    const ip = req.ip
    const message = `ratelimit reached for user: \`${user}\` IP: \`${ip}\` (key: \`${generateKey(req)}\`)`
    console.warn(message)
    publish(SLACK_CHANNEL_IT_ALERTS, message)
  },
  handler (req, res, next) {
    // send a graphql error
    // apollo client needs a 200 to display the error correctly
    res.status(200).json({
      data: null,
      errors: [{
        message: 'Sie haben das Kontingent an Anfragen überschritten. Bitte versuchen Sie es in 10 Minuten noch einmal.',
        statusCode: 429
      }]
    })
  }
})
