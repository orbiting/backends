const getElections = require('../../../lib/getElections')
const resolveCandidate = require('../../../lib/resolveCandidate')
const { upsert } = require('../../../lib/db')

const {
  Roles,
  ensureSignedIn
} = require('@orbiting/backend-modules-auth')

module.exports = async (_, { slug }, { pgdb, user: me, req }) => {
  ensureSignedIn(req)
  Roles.ensureUserIsInRoles(me, ['admin', 'associate'])

  const election = (await getElections(pgdb, me, {slug}))[0]

  if (!election) {
    throw new Error(`No election for slug ${slug}`)
  }

  const comment = await upsert(
    pgdb.public.comments,
    {
      userId: me.id,
      discussionId: election.discussion.id,
      content: me._raw.statement,
      hotness: 0.0
    },
    {userId: me.id, discussionId: election.discussion.id}
  )

  const rawCandidate = await upsert(
    pgdb.public.electionCandidacies,
    {
      userId: me.id,
      electionId: election.id,
      commentId: comment.id
    },
    {userId: me.id, electionId: election.id}
  )

  return resolveCandidate(pgdb, rawCandidate)
}
