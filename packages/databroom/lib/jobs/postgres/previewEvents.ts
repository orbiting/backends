import { forEachRow, Options, JobContext, JobFn } from '../../index'

interface PreviewEvent {
  id: string
}

const AGE_DAYS = 90

export default module.exports = function setup(options: Options, context: JobContext): JobFn {
  const { pgdb, debug } = context
  const { dryRun } = options
  const now = new Date()

  return async function() {
    const qryConditions = {
      'createdAt <': now.setDate(now.getDate() - AGE_DAYS),
    }

    const tx = await pgdb.transactionBegin()
    try {
      const handlerDebug = debug.extend('handler')
      const handler = async function (row: PreviewEvent): Promise<void> {
        handlerDebug('delete %s', row.id)

        if (!dryRun) {
          await tx.public.previewEvents.delete({ id: row.id })
        }
      }

      await forEachRow(
        'previewEvents',
        qryConditions,
        options,
        handler,
        context,
      )

      await tx.transactionCommit()
    } catch (e) {
      await tx.transactionRollback()
      throw e
    }
  }
}
