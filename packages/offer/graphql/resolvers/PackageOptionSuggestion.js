const applyReplacements = (replacements, string) =>
  Object.keys(replacements).reduce(
    (prev, searchValue) =>
      prev.replace(
        new RegExp(`{${searchValue}}`, 'gmi'),
        replacements[searchValue] || '',
      ),
    string,
  )

module.exports = {
  label: (packageOptionSuggestion) => {
    const { label, claimerName, endDate } = packageOptionSuggestion

    return applyReplacements({ claimerName, endDate }, label || 'ups?')
  },
  description: (packageOptionSuggestion) => {
    const { description, claimerName, endDate } = packageOptionSuggestion

    return applyReplacements({ claimerName, endDate }, description || 'äh?')
  },
  userPrice: (packageOptionSuggestion) => {
    return !!packageOptionSuggestion.userPrice
  },
  favorite: (packageOptionSuggestion) => {
    return !!packageOptionSuggestion.favorite
  },
}
