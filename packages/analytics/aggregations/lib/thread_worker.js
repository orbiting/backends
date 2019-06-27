const Promise = require('bluebird')
const {
  isMainThread, parentPort
} = require('worker_threads')

const modules = {
  filterPledgesFromEvents: require('./filterPledgesFromEvents'),
  attributePledgesToDocuments: require('./attributePledgesToDocuments')
}

if (isMainThread) {
  console.error('this is the worker')
}

parentPort.on('message', ({ moduleName, functionName, props = [] }) => {
  return Promise.method(modules[moduleName][functionName])(...props)
    .then((result) => parentPort.postMessage({ result }))
    .catch((error) => parentPort.postMessage({ error }))
})
