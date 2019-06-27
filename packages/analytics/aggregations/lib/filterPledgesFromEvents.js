const Context = require('../../lib/Context')
const moment = require('moment')
const data = require('./data')

const eventTimeWithinPledgeTime = (eventTime, pledgeCreatedAt) => {
  const minCreatedAt = moment(pledgeCreatedAt).subtract(24 * 3, 'hours')
  const maxCreatedAt = moment(pledgeCreatedAt).add(24 * 3, 'hours')
  const itemCreatedAt = moment(eventTime)
  if (itemCreatedAt.isBetween(minCreatedAt, maxCreatedAt, null, '[]')) {
    return true
  }
  // console.log('conversion_items out of timerange', {
  //  diff: moment(pledgeCreatedAt).from(itemCreatedAt)
  // })
  return false
}

let initialData
const loadInitialData = async () => {
  if (initialData) {
    return initialData
  }
  const context = await Context.create()
  initialData = {
    pledges: await data.pledges.get(context),
    actionUrlPledgeMap: await data.actionUrlPledgeMap.get(context)
  }
  await Context.close(context)
  return initialData
}

// visitorEventsBatch: [[actions/conversion_items]] array of actions array
const filter = (visitorEventsBatch, existingVisitors, sharedMemory = false) => {
  if (!initialData) {
    throw new Error('loadInitialData must be called first')
  }
  const {
    pledges: allPledges,
    actionUrlPledgeMap
  } = initialData

  if (!visitorEventsBatch) {
    return
  }

  return visitorEventsBatch
    .map((visitorEvents) => {
      const idvisitor = visitorEvents[0].idvisitor
      const existingPledgesForVisitor = existingVisitors && existingVisitors[idvisitor]
      const type = visitorEvents[0].idorder
        ? 'conversion_item'
        : 'action'

      let newVisitorPledges = visitorEvents
        .reduce(
          (pledges, event) => {
            const pledge = type === 'action'
              ? actionUrlPledgeMap[event.idaction_url]
              : allPledges.find(p => p.id === event.idorder)

            if (
              pledge &&
              moment(pledge.createdAt).isAfter(moment.utc('2018-01-14')) &&
              eventTimeWithinPledgeTime(event.server_time, pledge.createdAt) &&
              pledges.findIndex(p => p.id === pledge.id) === -1 &&
              (
                !existingPledgesForVisitor ||
                existingPledgesForVisitor.findIndex(p => p.id === pledge.id) === -1
              )
            ) {
              pledges.push(pledge)
            }
            return pledges
          },
          []
        )
        .map(pledge => ({
          ...pledge,
          visitorIds: [idvisitor],
          actions: type === 'action' ? visitorEvents : null
        }))

      if (!newVisitorPledges.length && (!existingPledgesForVisitor || !existingPledgesForVisitor.length)) {
        return null
      }

      if (!existingPledgesForVisitor) {
        return newVisitorPledges.length
          ? newVisitorPledges
          : null
      }

      existingPledgesForVisitor.forEach(existingPledge => {
        if (sharedMemory) {
          if (existingPledge.actions) {
            existingPledge.actions.push(...visitorEvents)
          } else {
            existingPledge.actions = [...visitorEvents]
          }
        } else {
          if (type === 'action') {
            existingPledge.actions = visitorEvents
          }
        }
      })

      return newVisitorPledges.length
        ? existingPledgesForVisitor.concat(newVisitorPledges)
        : existingPledgesForVisitor
    })
    .filter(Boolean)
    .reduce(
      (flatArray, array) => {
        if (!array) {
          return
        }
        flatArray.push(...array)
        return flatArray
      },
      []
    )
}

module.exports = {
  filter,
  loadInitialData
}
