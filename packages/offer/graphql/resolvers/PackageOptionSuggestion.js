const { timeFormat } = require('@orbiting/backend-modules-formats')

const dateFormat = timeFormat('%x')

module.exports = {
  label: (packageOptionSuggestion, args, context) => {
    const { label, _payload } = packageOptionSuggestion
    const { t } = context

    const { membership, isOwnMembership, packageName, rewardType, rewardName, order } = _payload

    if (!!membership && !isOwnMembership) {
      const { claimerName } = membership

      return t.first([
        `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/order:${order}/gifted/suggestion/label`,
        `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/gifted/suggestion/label`,
        `api/package:${packageName}/option/order:${order}/gifted/suggestion/label`,
        `api/package/option/reward:${rewardType}:${rewardName}/gifted/suggestion/label`,
      ], { claimerName }, label)
    }

    return t.first([
      `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/order:${order}/suggestion/label`,
      `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/suggestion/label`,
      `api/package:${packageName}/option/order:${order}/suggestion/label`,
      `api/package/option/reward:${rewardType}:${rewardName}/suggestion/label`,
    ], null, label)
  },
  description: (packageOptionSuggestion, args, context) => {
    const { description, _payload } = packageOptionSuggestion
    const { t } = context

    const { membership, isOwnMembership, packageName, rewardType, rewardName, order } = _payload

    if (!!membership && !isOwnMembership) {
      const { latestPeriod, claimerName } = membership

      const endDate = dateFormat(latestPeriod.endDate)

      return t.first([
        `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/order:${order}/gifted/suggestion/description`,
        `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/gifted/suggestion/description`,
        `api/package:${packageName}/option/order:${order}/gifted/suggestion/description`,
        `api/package/option/reward:${rewardType}:${rewardName}/gifted/suggestion/description`,
      ], { claimerName, endDate }, description)
    }

    return t.first([
      `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/order:${order}/suggestion/description`,
      `api/package:${packageName}/option/reward:${rewardType}:${rewardName}/suggestion/description`,
      `api/package:${packageName}/option/order:${order}/suggestion/description`,
      `api/package/option/reward:${rewardType}:${rewardName}/suggestion/description`,
    ], null, description)
  },
  userPrice: (packageOptionSuggestion, args, context) => {
    return !!packageOptionSuggestion.userPrice
  },
  favorite: (packageOptionSuggestion, args, context) => {
    return !!packageOptionSuggestion.favorite
  },
}
