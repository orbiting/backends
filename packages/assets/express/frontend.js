const fetch = require('isomorphic-unfetch')
const debug = require('debug')('assets:frontend')
const { returnImage } = require('../lib')
const {
  FRONTEND_BASE_URL,
  FRONTEND_AUTHORIZATION_HEADER
} = process.env

if (!FRONTEND_BASE_URL) {
  console.warn('missing env FRONTEND_BASE_URL, the /frontend endpoint will not work')
}

module.exports = (server) => {
  server.get('/frontend/:path(*)', async (req, res) => {
    const {
      path
    } = req.params

    if (!FRONTEND_BASE_URL) {
      console.warn('FRONTEND_BASE_URL not set unable to handle request')
      return res.status(403).end()
    }

    const [_, sanitizedPath, webp] = new RegExp(/(.*?)(\.webp)?$/, 'g').exec(path)

    const frontendUrl = `${FRONTEND_BASE_URL}/${sanitizedPath}`
    const result = await fetch(frontendUrl, {
      method: 'GET',
      headers: {
        Authorization: FRONTEND_AUTHORIZATION_HEADER
      }
    })
      .catch(error => {
        console.error('frontend fetch failed', { error })
        return res.status(404).end()
      })
    if (!result.ok) {
      console.error('frontend fetch failed', result.url, result.status)
      return res.status(result.status).end()
    }
    result.headers.set('Link', `<${frontendUrl}>; rel="canonical"`)

    return returnImage({
      response: res,
      stream: result.body,
      headers: result.headers,
      options: {
        ...req.query,
        webp: !!webp
      }
    })
  })
}
