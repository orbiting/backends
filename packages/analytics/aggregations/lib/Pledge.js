const { mergeArraysUnique } = require('../../lib/utils')
const filterPledgesFromEvents = require('./filterPledgesFromEvents')

const mergePledgesInPlace = (existingPledge, pledge) => {
  if (pledge.actions && pledge.actions.length) {
    if (!existingPledge.actions) {
      existingPledge.actions = [...pledge.actions]
    } else {
      existingPledge.actions.push(...pledge.actions)
    }
    /* check if actions are unique
    existingPledge.actions.forEach( (a, i) => {
      const index = existingPledge.actions.findIndex(a2 => a2.id == a.id)
      if(index !== i) {
        console.log('double action!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', {
          a,
          a2: existingPledge.actions[index],
          i,
          index
        })
      }
    })
    */
  }
  if (pledge.visitorIds) {
    mergeArraysUnique(existingPledge.visitorIds, pledge.visitorIds)
  }
}

const Collector = (pool) => {
  const _visitors = {}
  const _pledges = {}

  const loadInitialData = async () => {
    if (pool) {
      await pool.execAll('filterPledgesFromEvents', 'loadInitialData')
    } else {
      await filterPledgesFromEvents.loadInitialData()
    }
  }

  const merge = (pledges, updateVisitors = true) => {
    pledges.forEach(pledge => {
      const existingPledge = _pledges[pledge.id]
      if (existingPledge) {
        if (existingPledge !== pledge) { // otherwise filter has already added the events
          mergePledgesInPlace(existingPledge, pledge)
        }
      } else {
        _pledges[pledge.id] = pledge
      }

      if (updateVisitors) {
        pledge.visitorIds.forEach((visitorId) => {
          const existingVisitor = _visitors[visitorId]
          if (existingVisitor) {
            if (existingVisitor.findIndex(p => p.id === pledge.id) === -1) {
              existingVisitor.push(pledge)
            }
          } else {
            _visitors[visitorId] = [pledge]
          }
        })
      }
    })
  }

  const collect = async (visitorEventsBatch, updateVisitors = false) => {
    if (!visitorEventsBatch || !visitorEventsBatch.length) {
      return
    }

    const existingVisitors = visitorEventsBatch.reduce(
      (visitors, visitorEvents) => {
        const { idvisitor } = visitorEvents[0]
        const existingVisitor = _visitors[idvisitor]
        if (existingVisitor) {
          visitors[idvisitor] = existingVisitor
        }
        return visitors
      },
      {}
    )

    let pledges
    if (pool) {
      pledges = await pool.exec(
        'filterPledgesFromEvents',
        'filter',
        [visitorEventsBatch, existingVisitors],
        false
      )
        .catch(err => {
          console.error(err)
        })
    } else {
      pledges = filterPledgesFromEvents.filter(visitorEventsBatch, existingVisitors, true)
    }

    if (pledges) {
      merge(pledges, updateVisitors)
    }
  }

  const getVisitorsDict = () =>
    _visitors

  const getPledgesDict = () =>
    _pledges

  const getPledgesArray = () =>
    Object.keys(_pledges).map(key => _pledges[key])
      .filter(p => p.actions && p.actions.length)

  const getStats = () => {
    const pledgesArray = getPledgesArray()
    const numPledges = pledgesArray.length
    let numActions = 0
    let total = 0
    pledgesArray.forEach(p => {
      if (p.actions) {
        numActions += p.actions.length
      }
      total += p.total
    })
    const numPledgesWithoutActions = Object.keys(_pledges).length - pledgesArray.length
    return {
      numVisitors: Object.keys(_visitors).length,
      pledges: numPledges,
      numActions,
      total: total / 100,
      avgNumActions: numActions / numPledges,
      numPledgesWithoutActions
    }
  }

  return {
    collect,
    getVisitorsDict,
    getPledgesDict,
    getPledgesArray,
    getStats,
    loadInitialData
  }
}

module.exports = {
  Collector
}
