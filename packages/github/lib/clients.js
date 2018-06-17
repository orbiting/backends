const { createApolloFetch } = require('apollo-fetch')
const config = require('config')

const GitHubApi = require('@octokit/rest')

const appAuth = require('./appAuth')

const DEV = process.env.NODE_ENV && process.env.NODE_ENV !== 'production'

let installationToken
let nextRateLimitCheck

module.exports = async (githubEnv = 'default') => {
  const now = Date.now()
  const later = now + (15 * 60 * 1000) // Add 15 minutes

  if (!installationToken || installationToken.expiresAt < later) {
    installationToken = await appAuth.getInstallationToken(githubEnv)
  }

  const githubApolloFetch = createApolloFetch({
    uri: 'https://api.github.com/graphql'
  })
    .use(({ options }, next) => {
      if (!options.headers) {
        options.headers = {}
      }
      options.headers['Authorization'] = `Bearer ${installationToken.token}`
      options.headers['Accept'] = 'application/vnd.github.machine-man-preview+json'
      next()
    })
    .useAfter(({ response }, next) => {
      if (response && response.parsed && response.parsed.errors) {
        const errors = response.parsed.errors
        throw new Error(JSON.stringify(errors))
      }
      next()
    })

  const githubRest = new GitHubApi({
    headers: {
      'Accept': 'application/vnd.github.machine-man-preview+json, application/vnd.github.mercy-preview+json'
    }
  })
  githubRest.authenticate({
    type: 'app',
    token: installationToken.token
  })

  if (config.get(`github.${githubEnv}.rateLimit`)) {
    if (!nextRateLimitCheck || nextRateLimitCheck <= now) {
      nextRateLimitCheck = later
      githubRest.misc.getRateLimit({})
        .then(response => {
          if (!response.data) {
            console.error('could not get rateLimit!', response)
          } else {
            const { data } = response

            try { // sanitize dates
              data.resources.core.resetDate = new Date(data.resources.core.reset * 1000).toString()
              data.resources.search.resetDate = new Date(data.resources.search.reset * 1000).toString()
              data.resources.graphql.resetDate = new Date(data.resources.graphql.reset * 1000).toString()
              data.rate.resetDate = new Date(data.rate.reset * 1000).toString()
            } catch (e) {}
            const message = {
              message: 'GitHub rate limit',
              level: 'notice',
              data
            }
            if (DEV) {
              const util = require('util')
              console.log(util.inspect(message, null, {depth: null}))
            } else {
              console.log(JSON.stringify(message))
            }
          }
        })
    }
  }

  return {
    githubApolloFetch,
    githubRest
  }
}
