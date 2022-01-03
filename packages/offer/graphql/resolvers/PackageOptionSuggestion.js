module.exports = {
  label: (packageOptionSuggestion, args, context) => {
    const { t } = context

    return packageOptionSuggestion.label || t('api/offer/package/option/suggestion/label')
  },
  description: (packageOptionSuggestion, args, context) => {
    const { t } = context

    return packageOptionSuggestion.description || t('api/offer/package/option/suggestion/description')
  },
  userPrice: (packageOptionSuggestion, args, context) => {
    return !!packageOptionSuggestion.userPrice
  },
  favorite: (packageOptionSuggestion, args, context) => {
    return !!packageOptionSuggestion.favorite
  }
}
