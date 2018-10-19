const server = require('express').Router()

module.exports = server.use(function (req, res, next) {
  req._log = function () {
    const log = {
      body: this.body,
      headers: this.headers,
      url: this.url,
      method: this.method,
      query: this.query,
      userId: this.user && this.user.id,
      ip: (this._ip && this._ip()) || this.ip
    }
    if (log.headers.cookie) { log.headers.cookie = 'REMOVED' }
    if (log.headers.authorization) { log.headers.authorization = 'REMOVED' }
    return log
  }
  next()
})
