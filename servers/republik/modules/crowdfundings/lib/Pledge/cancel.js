// const debug = require('debug')('crowdfundings:lib:Pledge:cancel')
const Promise = require('bluebird')
const moment = require('moment')

/**
 * Returns an Array of objects, containing period and "helper" flags.
 *
 * @example: [{
 *  _raw: <Original Period>,
 *  isCausedByPledge: <Boolean>,
 *  isObsolete: <Boolean>,
 *  updateAttributes: { beginDate: <Date>, endDate: <Date>, ... }
 * }]
 *
 * - _raw contains untempered period as is provided.
 * - isCausedByPledge indicates if period at hand was caused by pledge to cancel.
 * - isObsolete indicates if period is or was not used.
 * - updateAttributes contains fields required to be updated in database.
 */
const evaluatePeriods = ({ pledgeId, membership, periods }, { now = moment() } = {}) => {
  if (!pledgeId) {
    throw new Error('pledgeId is missing')
  }

  if (!membership) {
    throw new Error('membership is missing')
  }

  if (!periods) {
    throw new Error('periods is missing')
  }

  // Will contain a end date. Will be used to glue a subsequent period.
  let glueEndDate = false

  return periods
    .filter(period => period.membershipId === membership.id)
    .map(period => {
      // Is period caused by pledge
      const isCausedByPledge =
        (membership.pledgeId === pledgeId && !period.pledgeId) || // Initial period
        period.pledgeId === pledgeId // Subsequent period

      let isObsolete = false
      let updateAttributes = {}

      if (isCausedByPledge) {
        if (period.beginDate > now) {
          // "Delete period"
          // Period in future. Not used. Hence: Delete it. (Or flag deleted)
          isObsolete = true
          glueEndDate = now
        } else if (period.endDate > now) {
          // "Update aka shorten period"
          // Period began. Shorten it.
          updateAttributes = {
            endDate: now
          }

          glueEndDate = now
        }
      } else if (glueEndDate) {
        // "Glue period"
        // Subsequent period, not caused by pledge. Has to be glued to previous endDate.
        const interval = moment.duration(moment(period.endDate).diff(moment(period.beginDate)))
        const endDate = moment(glueEndDate).add(interval)

        // Set beginDate to previous end date ("glueEndDate"), and add interval to endDate.
        updateAttributes = {
          beginDate: glueEndDate,
          endDate
        }

        glueEndDate = endDate
      }

      return {
        _raw: period,
        isCausedByPledge,
        isObsolete,
        updateAttributes
      }
    })
}

const evaluatePledge = async function ({ pledgeId }, { pgdb }) {
  console.log('aa')

  // Find affected memberships via
  // a) membership.pledgeId
  // b) membershipPeriod.membershipId, linked on membershipPeriod.pledgeId
  const pledgePeriods = await pgdb.public.membershipPeriods.find({ pledgeId })
  const periodMembershipIds = pledgePeriods.map(p => p.membershipId).filter(Boolean)

  console.log('bb', pledgePeriods)

  const query = { or: [{ pledgeId }] }
  if (periodMembershipIds.length > 0) {
    query.or.push({ id: periodMembershipIds })
  }

  const pledgeMemberships = await pgdb.public.memberships.find(query)

  console.log('cc', pledgeMemberships)

  // Process each membership and its periods.
  return Promise.map(pledgeMemberships, async function (membership) {
    const periods = await pgdb.public.membershipPeriods.find(
      { membershipId: membership.id },
      { orderBy: { beginDate: 'ASC' } }
    )

    console.log('dd', pledgeMemberships)

    return {
      _raw: membership,
      periods: await this.evaluatePeriods({ pledgeId, membership, periods })
    }
  }.bind(this))
}

const updateMembershipPeriods = async function ({ evaluatedPeriods }, { pgdb }) {
  const now = moment()

  /**
   * After evaluating each period, set flags and suggest attributes to update, this sequence
   * does actual delete or update periods.
   */
  return Promise.map(
    evaluatedPeriods,
    async ({ isObsolete, updateAttributes, _raw: period }) => {
      if (isObsolete) {
        return pgdb.public.membershipPeriods.delete({ id: period.id })
      }

      if (updateAttributes) {
        return pgdb.public.membershipPeriods.update(
          { id: period.id },
          { ...updateAttributes, updatedAt: now }
        )
      }
    },
    { concurrency: 10 }
  )
}

module.exports = {
  evaluatePeriods,
  evaluatePledge,
  updateMembershipPeriods
}
