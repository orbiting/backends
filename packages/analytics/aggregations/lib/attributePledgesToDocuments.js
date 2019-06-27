const Context = require('../../lib/Context')
const moment = require('moment')
const data = require('./data')
const Promise = require('bluebird')
const { descending } = require('d3-array')

let initialData
const attribute = async (pledges = []) => {
  const context = await Context.create()
  if (!initialData) {
    initialData = {
      actionUrlDocumentMap: await data.actionUrlDocumentMap.get(context)
    }
  }
  const { pgdbTs } = context
  const { actionUrlDocumentMap } = initialData

  await Promise.map(
    pledges,
    async (pledge) => {
      if (!pledge) {
        return
      }
      const pledgeCreatedAt = moment(pledge.createdAt)

      const actions = pledge.actions
        .filter(action => moment.utc(action.server_time).isBefore(pledgeCreatedAt))
        .map(action => ({
          ...action,
          doc: actionUrlDocumentMap[action.idaction_url],
          createdAt: moment.utc(action.server_time)
        }))
        .filter(
          action =>
            !!action.doc &&
              action.doc.meta.path !== '/' &&
              action.doc.meta.path !== '/feuilleton' &&
              action.doc.meta.path !== '/verlag'
        )
        .sort((a, b) => descending(a.createdAt, b.createdAt))

      if (actions.length > 0) {
        await addToDocumentsField(
          actions[0].doc.meta,
          pledge.pkgName,
          pledge.total,
          'revenue_closest',
          context
        )

        const numMaxActions = 100
        const hopActions = actions.slice(0, numMaxActions)
        const numActions = hopActions.length
        // https://www.wolframalpha.com/input/?i=sum+k+%C2%B2
        const scoreTotal = (1 / 6) * numActions * (numActions + 1) * (2 * numActions + 1)
        await Promise.each(
          hopActions,
          (action, index) => {
            const revenue_hops = pledge.total * (Math.pow(numActions - index, 2) / scoreTotal)
            // console.log({ index, revenue_hops, total: pledge.total})
            return addToDocumentsField(
              action.doc.meta,
              pledge.pkgName,
              Math.round(revenue_hops),
              'revenue_hops',
              context
            )
          }
        )
      }

      await pgdbTs.query(`
       INSERT INTO documents_hops (num_hops, num_pledges, pledges_totals, pkg_name)
       VALUES (:num_hops, :num_pledges, :pledges_totals, :pkgName)
       ON CONFLICT (num_hops, pkg_name) DO UPDATE
         SET num_pledges = documents_hops.num_pledges + EXCLUDED.num_pledges,
             pledges_totals = documents_hops.pledges_totals + EXCLUDED.pledges_totals
      `, {
        num_hops: actions.length,
        num_pledges: 1,
        pledges_totals: pledge.total,
        pkgName: pledge.pkgName
      })

      await pgdbTs.query(`
        INSERT INTO document_pledges (id, pkg_name, total, num_visitor_ids, num_actions)
        VALUES (:id, :pkg_name, :total, :num_visitor_ids, :num_actions)
      `, {
        id: pledge.id,
        pkg_name: pledge.pkgName,
        total: pledge.total,
        num_visitor_ids: pledge.visitorIds.length,
        num_actions: pledge.actions.length
      })
    },
    { concurrency: 1000 }
  )

  await Context.close(context)
}

const addToDocumentsField = ({ title, path }, pkgName, value, fieldName, { pgdbTs }) =>
  pgdbTs.query(`
    INSERT INTO documents (title, path, pkg_name, ${fieldName})
    VALUES (:title, :path, :pkgName, :value)
    ON CONFLICT (path, pkg_name) DO UPDATE
      SET ${fieldName} = documents.${fieldName} + EXCLUDED.${fieldName}
  `, {
    title: title || path,
    path,
    pkgName,
    value
  })

module.exports = {
  attribute
}
