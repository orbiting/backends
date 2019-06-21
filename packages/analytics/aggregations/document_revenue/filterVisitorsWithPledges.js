const workerpool = require('workerpool')
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
const getInitialData = async () => {
  if (initialData) {
    return initialData
  }
  const context = await Context.create()
  initialData = {
    pledges: await data.pledges.get(context),
    actionUrlPledgeMap: await data.actionUrlPledgeMap.get(context)
  }
  return initialData
}

const filter = async (visitorEvents) => {
  const {
    pledges,
    actionUrlPledgeMap
  } = await getInitialData()

  if (!visitorEvents) {
    return
  }

  const idvisitor = Buffer.from(visitorEvents[0].idvisitor).toString('hex')
  const type = visitorEvents[0].idorder
    ? 'conversion_item'
    : 'action'

  const visitorPledges = []

  visitorEvents.forEach( event => {
    const pledge = type === 'action'
      ? actionUrlPledgeMap[event.idaction_url]
      : pledges.find(p => p.id === event.idorder)

    if (!pledge) {
      return
    }

    if (!eventTimeWithinPledgeTime(event.server_time, pledge.createdAt)) {
      return
    }

    if (!visitorPledges.find( p => p.id === pledge.id)) {
      visitorPledges.push(pledge)
    }
  })

  //console.log(`num visitorPledges: ${visitorPledges.length}`)

  return visitorPledges.map( pledge => ({
    ...pledge,
    idvisitor,
    ...type === 'action'
      ? { actions: visitorEvents }
      : {}
  }))

}

workerpool.worker({
  filter
})
