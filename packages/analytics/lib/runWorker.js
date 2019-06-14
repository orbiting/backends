const workerpool = require('workerpool')

workerpool.worker({
  run: require('./run')
})
