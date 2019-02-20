const test = require('tape-async')
const moment = require('moment')

// Unit Under Test
const { cancel: { evaluatePeriods: UUT } } = require('../../../../../modules/crowdfundings/lib/Pledge')

const getInterval = (start, end) => moment.duration(moment(end).diff(moment(start)))

test('Pledge A caused initial, past period: leave untampered', t => {
  const pledgeId = 'pledge-A'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }
  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(20, 'days'),
      endDate: moment().subtract(10, 'days')
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }),
    [{
      _raw: periods[0],
      isCausedByPledge: true,
      isObsolete: false,
      updateAttributes: {}
    }],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge A caused initial, current period: update period.endDate', t => {
  const now = moment()
  const pledgeId = 'pledge-A'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }
  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days')
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [{
      _raw: periods[0],
      isCausedByPledge: true,
      isObsolete: false,
      updateAttributes: { endDate: now }
    }],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge A caused initial, future period: flag period obsolete', t => {
  const now = moment()
  const pledgeId = 'pledge-A'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }
  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().add(10, 'days'),
      endDate: moment().add(20, 'days')
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [{
      _raw: periods[0],
      isCausedByPledge: true,
      isObsolete: true,
      updateAttributes: {}
    }],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge A caused initial, past period: flag period obsolete and leave subsequent untampered', t => {
  const now = moment()
  const pledgeId = 'pledge-A'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }
  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(20, 'days'),
      endDate: moment().subtract(10, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days'),
      pledgeId: 'pledge-B'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: true,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused subsequent, past period: leave periods untampered', t => {
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }
  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(30, 'days'),
      endDate: moment().subtract(20, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().subtract(20, 'days'),
      endDate: moment().subtract(10, 'days'),
      pledgeId: 'pledge-B'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: false,
        updateAttributes: {}
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused subsequent, current period: update current period', t => {
  const now = moment()
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }
  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(20, 'days'),
      endDate: moment().subtract(10, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days'),
      pledgeId: 'pledge-B'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: false,
        updateAttributes: {
          endDate: now
        }
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused subsequent, future period: flag future period obsolete', t => {
  const now = moment()
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }

  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().add(10, 'days'),
      endDate: moment().add(20, 'days'),
      pledgeId: 'pledge-B'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: true,
        updateAttributes: {}
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused middle, past period: leave untampered', t => {
  const now = moment()
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }

  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(30, 'days'),
      endDate: moment().subtract(20, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().subtract(20, 'days'),
      endDate: moment().subtract(10, 'days'),
      pledgeId: 'pledge-B'
    },
    {
      id: 'period-3',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().subtract(5, 'days'),
      pledgeId: 'pledge-C'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[2],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused middle, current period: update period.endDate and subsequent period', t => {
  const now = moment()
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }

  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(20, 'days'),
      endDate: moment().subtract(10, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days'),
      pledgeId: 'pledge-B'
    },
    {
      id: 'period-3',
      membershipId: 'membership-a',
      beginDate: moment().add(10, 'days'),
      endDate: moment().add(20, 'days'),
      pledgeId: 'pledge-C'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: false,
        updateAttributes: {
          endDate: now
        }
      },
      {
        _raw: periods[2],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {
          beginDate: now,
          endDate: now.add(getInterval(periods[2].beginDate, periods[2].endDate))
        }
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused middle, future period: flag period obsolete and update subsequent period', t => {
  const now = moment()
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }

  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().add(10, 'days'),
      endDate: moment().add(20, 'days'),
      pledgeId: 'pledge-B'
    },
    {
      id: 'period-3',
      membershipId: 'membership-a',
      beginDate: moment().add(20, 'days'),
      endDate: moment().add(30, 'days'),
      pledgeId: 'pledge-C'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: true,
        updateAttributes: {}
      },
      {
        _raw: periods[2],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {
          beginDate: now,
          endDate: now.add(getInterval(periods[2].beginDate, periods[2].endDate))
        }
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('Pledge B caused 2 middle, future periods: flag periods obsolete and update subsequent period', t => {
  const now = moment()
  const pledgeId = 'pledge-B'
  const membership = {
    id: 'membership-a',
    pledgeId: 'pledge-A'
  }

  const periods = [
    {
      id: 'period-1',
      membershipId: 'membership-a',
      beginDate: moment().subtract(10, 'days'),
      endDate: moment().add(10, 'days')
    },
    {
      id: 'period-2',
      membershipId: 'membership-a',
      beginDate: moment().add(10, 'days'),
      endDate: moment().add(20, 'days'),
      pledgeId: 'pledge-B'
    },
    {
      id: 'period-3',
      membershipId: 'membership-a',
      beginDate: moment().add(20, 'days'),
      endDate: moment().add(22, 'days'),
      pledgeId: 'pledge-B'
    },
    {
      id: 'period-4',
      membershipId: 'membership-a',
      beginDate: moment().add(22, 'days'),
      endDate: moment().add(32, 'days'),
      pledgeId: 'pledge-C'
    }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }, { now }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[1],
        isCausedByPledge: true,
        isObsolete: true,
        updateAttributes: {}
      },
      {
        _raw: periods[2],
        isCausedByPledge: true,
        isObsolete: true,
        updateAttributes: {}
      },
      {
        _raw: periods[3],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {
          beginDate: now,
          endDate: now.add(getInterval(periods[3].beginDate, periods[3].endDate))
        }
      }
    ],
    'evalutePeriods returned expected result'
  )

  t.end()
})

test('throws Errors if argument is missing', t => {
  t.throws(
    () => UUT({
      // pledgeId: 1,
      membership: {},
      periods: []
    }),
    /pledgeId is missing/,
    'throw error if pledgeId argument is missing'
  )
  t.throws(
    () => UUT({
      pledgeId: 1,
      // memberships: {},
      periods: []
    }),
    /membership is missing/,
    'throw error if membership argument is missing'
  )
  t.throws(
    () => UUT({
      pledgeId: 1,
      membership: {}
      // periods: []
    }),
    /periods is missing/,
    'throw error if periods argument is missing'
  )

  t.end()
})

test('filters periods of other memberships', t => {
  const pledgeId = 'pledge-0000'
  const membership = { id: 'membership-a', pledgeId: 'pledge-9999' }
  const periods = [
    { id: 1, membershipId: 'membership-a' },
    { id: 2, membershipId: 'membership-b' },
    { id: 3, membershipId: 'membership-a' },
    { id: 4, membershipId: 'membership-c' }
  ]

  t.deepEqual(
    UUT({ pledgeId, membership, periods }),
    [
      {
        _raw: periods[0],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      },
      {
        _raw: periods[2],
        isCausedByPledge: false,
        isObsolete: false,
        updateAttributes: {}
      }
    ]
  )

  t.end()
})
