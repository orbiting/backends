const workerpool = require('workerpool')

workerpool.worker({
  run2: require('./run')
})
