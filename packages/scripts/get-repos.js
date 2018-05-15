#!/usr/bin/env node

/**
 * A script to print all available, private repositories.
 *
 * @example DEBUG=scripts:* packages/scripts/get-repos.js > current-repos.txt
 */

const config = require('config')
const debug = require('debug')('scripts:get-repos')

const { lib: { clients } } = require('@orbiting/backend-modules-github')

clients('duplikator.source').then(async ({ githubRest }) => {
  const options = {
    org: config.get(`github.duplikator.source.login`),
    type: 'private'
  }

  debug(`requesting private repos for org "${options.org}"...`)
  let resp = await githubRest.repos.getForOrg(options)
  let { data } = resp

  while (githubRest.hasNextPage(resp)) {
    resp = await githubRest.getNextPage(resp)
    data = data.concat(resp.data)
    debug(`fetching repos... (${data.length} repos)`)
  }

  data.forEach(repo => console.log(repo.ssh_url, repo.name))
  debug(`found ${data.length} repos`)
})
