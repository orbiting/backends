const {
  hasUserCandidacies,
  hasUserCandidaciesInCandidacyPhase,
  hasUserCandidaciesInElectionPhase
} = require('@orbiting/backend-modules-voting/lib/Candidacy')
const { Roles } = require('@orbiting/backend-modules-auth')

exports.isEligible = async user => {
  return Roles.userIsInRoles(user, ['member'])
}

/**
 * Check if profile (actually user) has submitted a candidacy.
 */
exports.isInCandidacy = hasUserCandidacies
exports.isInCandidacyInCandidacyPhase = hasUserCandidaciesInCandidacyPhase
exports.isInCandidacyInElectionPhase = hasUserCandidaciesInElectionPhase
