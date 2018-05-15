const config = require('config')
const fetch = require('isomorphic-unfetch')
const jwt = require('jsonwebtoken')

const getAppJWT = (githubEnv) => {
  const now = Math.floor(Date.now() / 1000)

  const payload = {
    // issued at time
    iat: now,
    // JWT expiration time (10 minute maximum, 5 for inaccurate times)
    exp: now + (5 * 60),
    // GitHub App's identifier
    iss: config.get(`github.${githubEnv}.appId`)
  }

  const key = Buffer.from(
    config
      .get(`github.${githubEnv}.appKey`)
      .replace(/@/g, '\n')
      .replace(/\\\s/g, ' '),
    'utf-8'
  )

  const token = jwt.sign(payload, key, { algorithm: 'RS256' })

  return token
}

const getInstallationToken = async (githubEnv = 'default') => {
  const response = await fetch(
    `https://api.github.com/installations/${config.get(`github.${githubEnv}.installationId`)}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAppJWT(githubEnv)}`,
        'Accept': 'application/vnd.github.machine-man-preview+json'
      }
    }
  )
    .then(response => response.json())
    .catch(error => {
      console.error('Error getting installation token:', error)
      return error
    })

  if (!response.token) {
    throw new Error('Error getting installation token', response)
  }

  const { token, expires_at } = response
  const expiresAt = new Date(expires_at)

  return {
    token,
    expiresAt
  }
}

module.exports = {
  getInstallationToken
}
