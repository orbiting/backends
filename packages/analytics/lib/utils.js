const GroupBy = (keyProp) => {
  let key
  let group = []

  const push = (item) => {
    if (!item) {
      return
    }
    let completeGroup
    if (item[keyProp] != key) {
      completeGroup = group
      group = []
      key = item[keyProp]
    }
    group.push(item)
    return completeGroup && completeGroup.length
      ? completeGroup
      : null
  }
  const flush = () => {
    const completeGroup = group
    group = []
    key = null
    return completeGroup
  }

  return {
    push,
    flush
  }
}

const Batch = (batchSize) => {
  let batch = []

  const push = (item) => {
    if (!item) {
      return
    }
    let completeBatch
    if (batch.length > batchSize) {
      completeBatch = batch
      batch = []
    }
    batch.push(item)
    return completeBatch
  }
  const flush = () => {
    const completeBatch = batch
    batch = []
    return completeBatch
  }

  return {
    push,
    flush
  }
}

const ThreadPool = (filename, numWorkers) => {
  const {
    Worker, isMainThread
  } = require('worker_threads')
  const Promise = require('bluebird')

  if (!isMainThread) {
    throw new Error('only do this on the main thread')
  }

  function Defer () {
    var resolve, reject
    var promise = new Promise(function () {
      resolve = arguments[0]
      reject = arguments[1]
    })
    return {
      resolve: resolve,
      reject: reject,
      promise: promise
    }
  }

  const promises = []

  const workers = Array(numWorkers).fill(1).map((_, i) => {
    const worker = new Worker(filename)

    worker.on('message', (message) => {
      const defer = promises.pop()
      if (message.error) {
        console.warn(message.error)
        defer.reject(message.error)
      } else {
        defer.resolve(message.result)
      }
    })

    worker.on('exit', (code) => {
      if (code !== 0) { console.error(`Worker stopped with exit code ${code}`) }
    })
    // worker.setMaxListeners(10000)
    return worker
  })

  let nextIndex = 0
  const exec = (moduleName, functionName, props) => {
    const defer = Defer()
    promises.push(defer)

    const worker = workers[nextIndex]
    if (nextIndex + 1 >= workers.length) {
      nextIndex = 0
    } else {
      nextIndex++
    }
    worker.postMessage({ moduleName, functionName, props })
    return defer.promise
  }

  const execAll = (moduleName, functionName, props) => {
    const allPromises = Array(numWorkers).fill(1).map(
      () => exec(moduleName, functionName, props)
    )
    return Promise.all(allPromises)
  }

  return {
    exec,
    execAll,
    terminate: (a) => a
  }
}

const mergeArraysUnique = (intoArray, fromArray, elementProp) => {
  if (!intoArray) {
    throw new Error('need intoArray!')
  }
  if (fromArray) {
    fromArray.forEach(element => {
      if (elementProp) {
        if (intoArray.findIndex(e => e[elementProp] == element[elementProp]) === -1) {
          intoArray.push(element)
        }
      } else {
        if (intoArray.indexOf(element) === -1) {
          intoArray.push(element)
        }
      }
    })
  }
}

module.exports = {
  GroupBy,
  Batch,
  ThreadPool,
  mergeArraysUnique
}
