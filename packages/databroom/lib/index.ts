import { basename } from 'path'
import { debug as _debug, Debugger } from 'debug'
import * as stream from 'stream'
import fg from 'fast-glob'

import { Context } from '@orbiting/backend-modules-types'


export interface Options {
  dryRun?: boolean
  nice?: boolean
}
export interface JobContext extends Context {
  debug: Debugger
}

interface JobMeta {
  name: string
  path: string
}
export interface JobFn {
  (): Promise<any>
}

interface ProcessStreamHandler {
  (row: any): Promise<any>
}

const debug = _debug('databroom')

async function getJobs(): Promise<JobMeta[]> {
  const glob = 'jobs/**/*.js'

  debug('find in %s with "%s', __dirname, glob)
  const paths = await fg(
    glob,
    { cwd: __dirname, onlyFiles: true, absolute: true }
  )
  debug('%i jobs found', paths.length)

  return paths.map(path => ({ name: basename(path, '.js'), path }))
}

export async function setup(options: Options, context: Context): Promise<JobFn[]> {
  debug('setup job fns with %o', options)

  const jobs = await getJobs()

  return jobs.map(job => {
    debug('setup %s', job.name)
    return require(job.path)(options, { ...context, debug: debug.extend(`job:${job.name}`) })
  })
}

export async function forEachRow(
  table: string,
  conditions: object,
  options: object,
  handler: ProcessStreamHandler,
  context: JobContext
): Promise<void> {
  const hrstart = process.hrtime()
  const { pgdb, debug } = context
  const debugTable = debug

  debugTable('table: %s', table)
  debugTable('conditions: %o', conditions)
  debugTable('options: %o', options)

  const qryConditions = conditions
  const pogiTable = pgdb.public[table]

  debugTable('counting rows ...')
  const count = await pogiTable.count(qryConditions)
  debugTable('%i rows found', count)

  const qryOptions = {
    ...options,
    stream: true,
  }

  const qryStream = await pogiTable.find(qryConditions, qryOptions)

  debugTable('processing stream with handler ...')
  await processStream(
    qryStream,
    handler
  )
  debugTable('processing stream is done')

  const [seconds] = process.hrtime(hrstart)
  debugTable('duration: %ds', seconds)
}

export async function processStream(stream: stream.Readable, rowHandler: ProcessStreamHandler): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('data', async (row) => {
      stream.pause()
      await rowHandler(row)
      stream.resume()
    })

    stream.on('end', resolve)
    stream.on('error', reject)
  })
}
