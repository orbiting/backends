import * as Bluebird from 'bluebird'
import moment from 'moment'
// import { PgTable } from 'pogi'

import { GraphqlContext } from '@orbiting/backend-modules-types'
import { UserTransformed } from '@orbiting/backend-modules-auth/lib/transformUser'
import { timeFormat } from '@orbiting/backend-modules-formats'

const dateFormat = timeFormat('%x')

// Replace globale Promise w/ Bluebird
declare global {
  export interface Promise<T> extends Bluebird<T> {}
}

// @TODO: Expose properly in package
const { getPackages } = require('../../republik-crowdfundings/lib/User')
const {
  resolveMemberships,
} = require('../../republik-crowdfundings/lib/CustomPackages')

interface OfferStatus {
  id: string
  label: string
  description: string
}

interface Package {
  id: string
}

interface Offer {
  id: string
  status: OfferStatus | null
  packages: Package[]
}

// @TODO, weg von hier.
interface PledgeRow {
  id: string
}

interface MembershipRow {
  active: boolean
}

interface MembershipTypeRow {
  id: string
  name: string
}

interface PackageOption {
  membershipType?: MembershipTypeRow
}

interface PaymentRow {
  status: string
}

interface Pledge {
  payments: PaymentRow[]
}

interface PledgeOption {
  packageOption: PackageOption
}
interface MembershipPeriod {
  beginDate: Date
  endDate: Date
  pledge: Pledge
  pledgeOption?: PledgeOption
}

interface Membership {
  id: string
  active: boolean
  renew: boolean
  userId: string
  periods: MembershipPeriod[]
  latestPeriod: MembershipPeriod
  membershipType: MembershipTypeRow
}

const getFirstDay = (
  memberships: Membership[],
  user: UserTransformed,
): string | false => {
  if (!memberships.length) {
    return false
  }

  const firstDayDate = memberships
    .filter((m) => m.userId === user.id)
    .map((m) => m.periods.map((p) => p.beginDate).flat())
    .flat()
    .reduce((prev, curr) => (curr < prev ? curr : prev), new Date())

  return dateFormat(firstDayDate)
}

const findActiveMembership = (
  memberships: Membership[],
  user: UserTransformed,
): Membership | false => {
  return (
    memberships.find((m) => m.active === true && m.userId === user.id) || false
  )
}

const findLastActiveMembership = (
  memberships: Membership[],
  user: UserTransformed,
): Membership | false => {
  if (!memberships.length) {
    return false
  }

  const userMemberships = memberships.filter((m) => m.userId === user.id)
  if (!userMemberships.length) {
    return false
  }

  return userMemberships.reduce((prev, curr) =>
    curr.latestPeriod.endDate > prev.latestPeriod.endDate ? curr : prev,
  )
}

const getMembershipStatus = (
  context: GraphqlContext,
  membership: Membership,
  firstDay: string | false,
) => {
  const { t } = context
  // endingDate
  // daysUntilEnd
  // renew
  // (graceInterval)
  // autoPay?

  // derived:
  // overdue?
  //

  // Mitglied seit xx

  // Ihr nächster Mitgliederbeitrag ist am xx fällig
  //

  // Ihr Mitgliederbeitrag, fällig am xx ist noch nicht beglichen (Pledge Pending)

  // Mitgliedschaft
  // Mitgliedschaft wird automatisch am xx erneuert
  // Mitgliedschaftsbeitrag ist am xx fällig
  // Mitgliedschaftsbeitrag ist seit xx überfällig
  // Abonnement wird am xx automatisch verlängert
  // Abonnement ist seit xx überfällig
  //

  const { latestPeriod, active, renew } = membership

  const endDate = dateFormat(latestPeriod.endDate)
  const daysUntilEnd = Math.max(
    Math.round(
      moment
        .duration(moment(latestPeriod.endDate).clone().diff(moment()))
        .asDays(),
    ),
    0,
  )

  const membershipTypeName =
    latestPeriod.pledgeOption?.packageOption?.membershipType?.name ||
    membership.membershipType.name

  const replacements = {
    firstDay,
    endDate,
    daysUntilEnd,
    active,
    renew,
    membershipTypeName,
  }

  return {
    label: t(
      'offer/status/label',
      replacements,
      `membershipTypeName: ${membershipTypeName}, firstDay: ${firstDay}`,
    ),
    description: t(
      'offer/status/description',
      replacements,
      `active: ${active}, renew: ${renew}, endDate: ${endDate}, daysUntilEnd: ${daysUntilEnd}`,
    ),
  }
}

export const getStatus = async function (
  context: GraphqlContext,
  overrideUser?: UserTransformed,
): Promise<OfferStatus | null> {
  const { user: contextUser, pgdb } = context
  const user = overrideUser || contextUser
  if (!user) {
    return null
  }

  const pledges: PledgeRow[] = await pgdb.public.pledges.find({
    userId: user?.id,
    status: 'SUCCESSFUL', // @TODO: Broaden?
  })

  // @TODO: Payments? für overdue et al.
  const memberships_: MembershipRow[] = await pgdb.public.memberships.find({
    or: [
      { userId: user.id },
      pledges?.length > 0 && {
        pledgeId: pledges.map((pledge) => pledge.id),
      },
    ].filter(Boolean),
  })

  // @TODO: Replace any with Membership[]
  const memberships: Membership[] = await resolveMemberships({
    memberships: memberships_,
    pgdb,
  })

  // A users very first day
  const firstDay = getFirstDay(memberships, user)

  // @TODO: Might not use after all
  /* const hasWaitingPayments =
    memberships.length &&
    memberships
      .map((m) => m.periods.map((p) => p.pledge?.payments).flat())
      .flat()
      .filter(p => p.status === 'WAITING') */

  // active membership
  // last membership, which was active
  // active gifted membership
  // probelesen

  const activeMembership = findActiveMembership(memberships, user)
  if (activeMembership) {
    return {
      ...getMembershipStatus(context, activeMembership, firstDay),
      id: 'active-membership',
    }
  }

  const lastActiveMembership = findLastActiveMembership(memberships, user)
  if (lastActiveMembership) {
    return {
      ...getMembershipStatus(context, lastActiveMembership, firstDay),
      id: 'last-active-membership',
    }
  }

  /* const activeMembership = findActiveMembership(memberships, user)
  if (activeMembership) {
    return {
      ...getMembershipStatus(context, activeMembership, firstDay),
      id: 'active-membership',
    }
  } */

  return null
}

export const getOffer = async function (
  context: GraphqlContext,
  overrideUser?: UserTransformed,
): Promise<Offer> {
  const { user: contextUser, pgdb } = context
  const user = overrideUser || contextUser

  const [status, packages] = await Promise.all([
    getStatus(context, overrideUser),
    getPackages({
      pledger: user,
      pgdb,
    }),
  ])

  return {
    id: Buffer.from(['offer', 'userId', user?.id].join('')).toString('base64'),
    status,
    packages,
  }
}
