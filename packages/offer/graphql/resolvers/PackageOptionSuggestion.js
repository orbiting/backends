const { timeFormat } = require('@orbiting/backend-modules-formats')

const dateFormat = timeFormat('%x')

module.exports = {
  label: (packageOptionSuggestion) => {
    const { label } = packageOptionSuggestion

    return label || 'ups?' // @TODO: Default to something meaningful
  },
  description: (packageOptionSuggestion) => {
    const { description } = packageOptionSuggestion

    return description || 'äh?' // @TODO: Default to something meaningful
  },
  userPrice: (packageOptionSuggestion) => {
    return !!packageOptionSuggestion.userPrice
  },
  favorite: (packageOptionSuggestion) => {
    return !!packageOptionSuggestion.favorite
  },
}
