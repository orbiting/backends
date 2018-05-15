require('@orbiting/backend-modules-env').config()

module.exports = {
  github: {
    default: {
      __name: 'GITHUB_DEFAULT',
      __format: 'json'
    },
    duplikator: {
      source: {
        __name: 'GITHUB_DUPLIKATOR_SOURCE',
        __format: 'json'
      },
      target: {
        __name: 'GITHUB_DUPLIKATOR_TARGET',
        __format: 'json'
      }
    }
  }
}
