const test = require('tape-async')

const { mock: { pgdb }, sinon } = require('@orbiting/backend-modules-testing')

const { cancel } = require('../../../../../modules/crowdfundings/lib/Pledge')

test.only('a', async t => {
  const evaluatePeriodsStub = sinon.stub(cancel, 'evaluatePeriods')
  evaluatePeriodsStub.resolves(undefined)

  const periodsFindStub = sinon.stub(pgdb.public.membershipPeriods, 'find')
  const membershipsFindStub = sinon.stub(pgdb.public.memberships, 'find')

  periodsFindStub.withArgs({ pledgeId: 'pledge-A' }).resolves([])

  const memberships = [
    { id: 'membership-a', pledgeId: 'pledge-A' }
  ]

  membershipsFindStub
    .withArgs({ or: [{ pledgeId: 'pledge-A' }] })
    .resolves(memberships)

  periodsFindStub
    .withArgs({ membershipId: 'membership-a' }, { orderBy: { beginDate: 'ASC' } })
    .resolves([
      { id: 'period-1', membershipId: 'membership-a' }
    ])

  const result = await cancel.evaluatePledge({ pledgeId: 'pledge-A' }, { pgdb })

  t.deepEqual(
    result,
    [ { _raw: memberships[0], periods: undefined } ],
    'evaluatePledge returned expected result'
  )

  t.true(evaluatePeriodsStub.calledOnce, 'evalutePeriods called once')
})
