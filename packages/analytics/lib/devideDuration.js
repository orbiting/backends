const moment = require('moment')

module.exports = (startDate, endDate, divider) => {
  const durationMs = endDate.diff(startDate)
  const dates = Array(divider).fill(1).map((_, i) => ({
    startDate: i > 0
      ? moment(startDate).add(i * (durationMs / divider))
      : moment(startDate),
    endDate: i < divider - 1
      ? moment(startDate).add((i + 1) * (durationMs / divider))
      : moment(endDate)
  }))

  /*
  console.log(dates.map( obj => ({
    startDate: obj.startDate.toString(),
    end: obj.endDate.toString(),
    diff: obj.endDate.diff(obj.startDate, 'seconds')
  })))
  */

  return dates
}
