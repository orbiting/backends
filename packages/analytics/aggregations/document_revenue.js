const Mysql = require('../lib/Mysql')
const path = require('path')
const { clearLocks } = require('../lib/redisCache')
const Promise = require('bluebird')
const { GroupBy, Batch, ThreadPool } = require('../lib/utils')
const { attribute: attributePledgesToDocuments } = require('./lib/attributePledgesToDocuments')
const { Collector: PledgeCollector } = require('./lib/Pledge')

// piwik_log_link_visit_action
// +------------+-------------------------+-------------+-------------+------------+
// | Non_unique | Key_name                | Column_name | Cardinality | Index_type |
// +------------+-------------------------+-------------+-------------+------------+
// |          0 | PRIMARY                 | idlink_va   |    23372230 | BTREE      |
// |          1 | index_idvisit           | idvisit     |    10406769 | BTREE      |
// |          1 | index_idsite_servertime | idsite      |         601 | BTREE      |
// |          1 | index_idsite_servertime | server_time |    16624410 | BTREE      |
// +------------+-------------------------+-------------+-------------+------------+

const insert = async (startDate, endDate, context, numWorkers = 1) => {
  // clear cache locks from potentially aborted last run
  await clearLocks(context.redis)

  let pool
  if (numWorkers > 1) {
    console.warn('running multiple workers for filter and attribute is experimental')
    pool = ThreadPool(path.join(__dirname, './lib/thread_worker.js'), numWorkers)
  }

  const pledgeCollector = PledgeCollector(pool)
  await pledgeCollector.loadInitialData()

  context.stats.startTimer('conversion_item_stream')
  await Mysql.stream(`
      SELECT
        idvisitor,
        idorder,
        server_time
      FROM piwik_log_conversion_item
      ORDER BY idvisitor
    `,
    (conversionItem) => ({
      idvisitor: Buffer.from(conversionItem.idvisitor).toString('hex')
    }),
    (conversionItemsByVisitorBatch) => {
      return pledgeCollector.collect(conversionItemsByVisitorBatch, true)
    },
    context,
    {
      queueConcurrency: 10 * numWorkers,
      groupBy: GroupBy('idvisitor'),
      batch: Batch(pool ? 100 * numWorkers : 2)
    }
  )
  context.stats.stopTimer('conversion_item_stream')

  context.stats.startTimer('actions_stream')
  await Mysql.stream(`
    SELECT
      idlink_va AS id,
      idvisitor,
      idaction_url,
      idaction_url_ref,
      server_time,
      time_spent,
      time_spent_ref_action
    FROM piwik_log_link_visit_action
    ORDER BY idvisitor
    `,
    (action) => ({
      idvisitor: Buffer.from(action.idvisitor).toString('hex')
    }),
    async (actionsByVisitorBatch) => {
      return pledgeCollector.collect(actionsByVisitorBatch, false)
    },
    context,
    {
      doQueue: true,
      queueConcurrency: 10 * numWorkers,
      groupBy: GroupBy('idvisitor'),
      batch: Batch(pool ? 500 : 2)
    }
  )
  context.stats.stopTimer('actions_stream')

  const pledgesArray = pledgeCollector.getPledgesArray()

  context.stats.startTimer('attributing')
  if (pool) {
    const numPerSlice = Math.ceil(pledgesArray.length / numWorkers)
    await Promise.all(
      Array(numWorkers).fill(1).map((_, i) => {
        return pool.exec(
          'attributePledgesToDocuments',
          'attribute',
          [pledgesArray.slice(i * numPerSlice, (i + 1) * numPerSlice)]
        )
      })
    )
    await pool.terminate()
  } else {
    await attributePledgesToDocuments(pledgesArray)
  }
  context.stats.stopTimer('attributing')

  Object.apply(context.stats.data, pledgeCollector.getStats())
  context.stats.data.finished = 'true'
}

const drop = ({ pgdbTs, redis }) =>
  Promise.all([
    pgdbTs.public.documents.delete(),
    pgdbTs.public.documents_hops.delete(),
    pgdbTs.public.document_pledges.delete()
  ])

module.exports = {
  insert,
  drop
}
