import { basename } from 'path'
import { debug as _debug, Debugger } from 'debug'
import * as stream from 'stream'
import fg from 'fast-glob'

import { ConnectionContext } from '@orbiting/backend-modules-types'

export interface Options {
  dryRun?: boolean
  nice?: boolean
}
export interface JobContext extends ConnectionContext {
  debug: Debugger
}

interface JobMeta {
  name: string
  path: string
}
export interface JobFn {
  (): Promise<any>
}

interface RowHandler {
  (row: any): Promise<any>
}
interface BatchHandler {
  (row: any[]): Promise<void>
}

interface Handlers {
  rowHandler?: RowHandler
  batchHandler?: BatchHandler
}

const BATCH_SIZE = 1000
export const NICE_ROWS_LIMIT_FACTOR = 0.01
export const NICE_ROWS_LIMIT_MINIMUM = BATCH_SIZE * 10

const debug = _debug('databroom')

async function getJobs(): Promise<JobMeta[]> {
  const glob = 'jobs/**/*.js'

  debug('find in %s with "%s', __dirname, glob)
  const paths = await fg(glob, {
    cwd: __dirname,
    onlyFiles: true,
    absolute: true,
  })
  debug('%i jobs found', paths.length)

  return paths.map((path) => ({ name: basename(path, '.js'), path }))
}

export async function setup(
  options: Options,
  context: ConnectionContext,
): Promise<JobFn[]> {
  debug('setup job fns with %o', options)

  const jobs = await getJobs()

  return jobs.map((job) => {
    debug('setup %s', job.name)
    return require(job.path)(options, {
      ...context,
      debug: debug.extend(`job:${job.name}`),
    })
  })
}

export async function forEachRow(
  table: string,
  conditions: object,
  options: Options,
  handlers: Handlers,
  context: JobContext,
  fields: string[] = ['id'],
): Promise<void> {
  const hrstart = process.hrtime()
  const { pgdb, debug: _debug } = context
  const { nice } = options
  const debug = _debug

  debug('table: %s', table)
  debug('conditions: %o', conditions)
  debug('options: %o', options)

  const qryConditions = conditions
  const pogiTable = pgdb.public[table]

  if (!pogiTable) {
    debug('table %s does not exist', table)
    return
  }

  debug('counting rows ...')
  const count = await pogiTable.count(qryConditions)
  debug('%i rows found', count)

  const limit = Math.max(
    Math.ceil(count * NICE_ROWS_LIMIT_FACTOR),
    NICE_ROWS_LIMIT_MINIMUM,
  )

  const qryOptions = {
    ...(nice && { limit }),
    fields,
    stream: true,
  }
  debug('query options: %o', qryOptions)

  const qryStream = await pogiTable.find(qryConditions, qryOptions)

  debug('processing stream with handler ...')
  await processStream(qryStream, handlers)
  debug('processing stream is done')

  const [seconds] = process.hrtime(hrstart)
  debug('duration: %ds', seconds)
}

export async function processStream(
  stream: stream.Readable,
  handlers: Handlers,
): Promise<void> {
  const { rowHandler: _rowHandler, batchHandler } = handlers

  const rowHandler =
    _rowHandler ||
    function defaultRowHandler(row: any) {
      return row.id
    }
  const rowsBatch: any[] = []

  return new Promise((resolve, reject) => {
    stream.on('data', async function onData(row) {
      try {
        stream.pause()

        const maybeRow = await rowHandler(row)

        if (batchHandler) {
          rowsBatch.push(maybeRow || row)

          if (rowsBatch.length >= BATCH_SIZE) {
            await batchHandler(rowsBatch)
            rowsBatch.length = 0
          }
        }

        stream.resume()
      } catch (e) {
        reject(e)
      }
    })

    stream.on('end', async function onEnd() {
      try {
        if (batchHandler && rowsBatch.length > 0) {
          await batchHandler(rowsBatch)
          rowsBatch.length = 0
        }

        resolve()
      } catch (e) {
        reject(e)
      }
    })

    stream.on('error', reject)
  })
}
