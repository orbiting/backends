// get the requesting IP from one of these sources:
//  - our server-side-renderers forward the requesting ip in the X-SSR-FOR header
//  - our hosting provider proxies requests and adds the requesting IP to the right of X-FORWARDED-FOR
//  - fall back to connection.remoteAddress (the other end of the TCP socket)

const crypto = require('crypto')

const {
  X_SSR_FOR_HMAC_KEY
} = process.env

if (!X_SSR_FOR_HMAC_KEY) {
  console.warn('missing X_SSR_FOR_HMAC_KEY, X-SSR-FOR header will not be honoured!')
}

const authenticateIP = X_SSR_FOR_HMAC_KEY
  ? ip =>
    crypto
      .createHmac('sha256', X_SSR_FOR_HMAC_KEY)
      .update(ip)
      .digest('hex')
  : null

module.exports = (req, res, next) => {
  req._ip = function () {
    const ssrFor = this.headers['X-SSR-FOR'] || this.headers['x-ssr-for']
    if (ssrFor) {
      if (authenticateIP) {
        try {
          const [_ip, hmac] = ssrFor.split(',')
          if (_ip && hmac && authenticateIP(_ip) === hmac) {
            return _ip
          }
        } catch (e) {
          console.log(e)
        }
      } else {
        console.error('received X-SSR-FOR but could not evaluate: X_SSR_FOR_HMAC_KEY missing!!')
      }
    }
    if (this.ip) {
      return this.ip
    }
    return this.connection.remoteAddress
  }
  next()
}
