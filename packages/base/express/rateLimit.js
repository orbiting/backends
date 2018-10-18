const RateLimit = require('express-rate-limit')
const RedisStore = require('rate-limit-redis')
const redis = require('../lib/redis')
const { publish } = require('@orbiting/backend-modules-slack')
const crypto = require('crypto')

const {
  SLACK_CHANNEL_IT_ALERTS,
  IP_HMAC_KEY
} = process.env

if (!IP_HMAC_KEY) {
  console.warn('missing IP_HMAC_KEY, X-SSR-FOR header will not be honoured!')
}

const windowMs = 10 * 60 * 1000 // 10 minutes

const authenticateIP = IP_HMAC_KEY
  ? ip =>
    crypto
      .createHmac('sha256', IP_HMAC_KEY)
      .update(ip)
      .digest('hex')
  : null

const generateKey = (req) => {
  let ip
  const ssrFor = req.headers['X-SSR-FOR'] || req.headers['x-ssr-for']
  if (ssrFor && authenticateIP) {
    try {
      const [_ip, hmac] = ssrFor.split(',')
      if (_ip && hmac && authenticateIP(_ip) === hmac) {
        ip = _ip
      }
    } catch (e) {
      console.log(e)
    }
  }
  ip = ip || req.ip
  return (req.user ? `${req.user.id}_${ip}` : ip)
}

module.exports = new RateLimit({
  store: new RedisStore({
    client: redis,
    expiry: windowMs / 1000 // https://github.com/wyattjoh/rate-limit-redis/issues/12
  }),
  windowMs,
  max: 1200, // 2rps max over 10mins
  keyGenerator (req) {
    const asf = generateKey(req)
    return asf
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
