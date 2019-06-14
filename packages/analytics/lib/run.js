const moment = require('moment')

module.exports = (input) => {
  // deserialize input
  const {
    command,
    analytics,
    statsData
  } = input
  let startDate, endDate
  if (input.startDate) {
    startDate = moment(input.startDate)
    endDate = moment(input.endDate)
    statsData.startDate = startDate.toString()
    statsData.endDate = endDate.toString()
  }

  const Context = require('./Context')

  return Context.create({ statsData })
    .then(async (context) => {
      context.stats.start()

      await require(`../aggregations/${analytics}`)[command](
        ...[startDate, endDate, context].filter(Boolean)
      )
      return context
    })
    .then(context => Context.close(context))
}
