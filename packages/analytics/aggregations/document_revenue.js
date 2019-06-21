const Mysql = require('../lib/Mysql')
const workerpool = require('workerpool')
const path = require('path')
const { clearLocks } = require('./document_revenue/redisCache')

// piwik_log_link_visit_action
// +------------+-------------------------+-------------+-------------+------------+
// | Non_unique | Key_name                | Column_name | Cardinality | Index_type |
// +------------+-------------------------+-------------+-------------+------------+
// |          0 | PRIMARY                 | idlink_va   |    23372230 | BTREE      |
// |          1 | index_idvisit           | idvisit     |    10406769 | BTREE      |
// |          1 | index_idsite_servertime | idsite      |         601 | BTREE      |
// |          1 | index_idsite_servertime | server_time |    16624410 | BTREE      |
// +------------+-------------------------+-------------+-------------+------------+

const insert = async (startDate, endDate, context) => {

  // clear cache locks from potentially aborted last run
  await clearLocks(context.redis)

  const numWorkers = 10
  const pool = workerpool.pool(
    path.join(__dirname, './document_revenue/filterVisitorsWithPledges.js'),
    {
      maxWorkers: numWorkers,
      minWorkers: numWorkers,
      nodeWorker: 'thread'
    }
  )

  let visitorEvents = []
  let idvisitor

  const visitors = {}
  const pledges = {}

  await Mysql.stream(`
      SELECT
        idvisitor,
        idorder,
        server_time
      FROM piwik_log_conversion_item
      ORDER BY idvisitor
    `,
    async (conversionItem) => {
      if (conversionItem.idvisitor !== idvisitor) {

        if (visitorEvents.length) {
          const sendEvents = visitorEvents
          visitorEvents = []
          const result = await pool.exec('filter', [sendEvents])
            .catch(err => {
              console.error(err)
            })
          if (result) {
            result.forEach( pledge => {
              visitors[pledge.idvisitor] = pledge
              pledges[pledge.id] = pledge
            })
          }
        }

      }
      visitorEvents.push(conversionItem)

    },
    context,
    {
      doQueue: true,
      queueConcurrency: 2 * numWorkers
    }
  )

  idvisitor = null

  await Mysql.stream(`
    SELECT
      idvisitor,
      idaction_url,
      idaction_url_ref,
      server_time,
      time_spent,
      time_spent_ref_action
    FROM piwik_log_link_visit_action
    ORDER BY idvisitor
    `,
    async (action) => {
    },
    context,
    {
      doBatch: false
    }
  )

  await pool.terminate()
  //console.log({ visitors, pledges })
  console.log({
    numVisitors: Object.keys(visitors).length,
    pledges: Object.keys(pledges).length
  })

}


module.exports = {
  insert
}
