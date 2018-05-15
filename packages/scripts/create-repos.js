#!/usr/bin/env node

/**
 * A script to create a list of repositories if they do not exist. To use
 * in shell with a pipe stream.
 *
 * @example echo heidi | DEBUG=scripts:* packages/scripts/create-repos.js
 */
const config = require('config')
const debug = require('debug')('scripts:create-repos')
const path = require('path')

const { lib: { clients } } = require('@orbiting/backend-modules-github')

const repos = []

const ensureRepo = async (githubRest, { repo, path }) => {
  try {
    debug(`check if repo "${repo}" exists...`)
    // Check if repo exists already
    await githubRest.repos.get({
      owner: config.get(`github.duplikator.target.login`),
      repo
    })

    // If it does exist, delete it
    debug(`repo "${repo}" found, deleting...`)
    await githubRest.repos.delete({
      owner: config.get(`github.duplikator.target.login`),
      repo
    })
  } catch (err) {
    if (!(err.name === 'HttpError' && err.code === 404)) {
      throw err
    }
    debug(`repo "${repo}" not found`)
  }

  try {
    debug(`creating repo "${repo}"...`)
    const { data } = await githubRest.repos.createForOrg({
      org: config.get(`github.duplikator.target.login`),
      name: repo,
      private: true
    })

    console.log(path, data.ssh_url, data.name)
  } catch (err) {
    if (err.name === 'HttpError' && err.code === 422) {
      debug(`unable to create repo "${repo}""...`)
      const resp = JSON.parse(err.message)
      console.error(
        repo,
        resp.errors.map(error => error.message).join(', ')
      )
    } else {
      throw err
    }
  }
}

process.stdin.setEncoding('utf8')

process.stdin.on('readable', () => {
  const chunk = process.stdin.read()

  if (chunk !== null) {
    chunk.split('\n').forEach(line => {
      const repo = line.match(/(.+\/)?(.+)$/)
      if (repo) {
        repos.push({
          path: path.resolve(repo.input),
          repo: repo[2]
        })
      }
    })

    debug(`piped in: ${repos.length} repo name(s)`)
  }
})

process.stdin.on('end', () => {
  debug(`piped in: ended`)
  clients('duplikator.target').then(async ({ githubRest }) => {
    for (let i = 0; i < repos.length; ++i) {
      await ensureRepo(githubRest, repos[i])
    }
  })
})
