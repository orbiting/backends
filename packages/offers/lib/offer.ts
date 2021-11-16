
import * as Bluebird from 'bluebird'
import { GraphqlContext } from '@orbiting/backend-modules-types'
import { UserTransformed } from '@orbiting/backend-modules-auth/lib/transformUser'

// Replace globale Promise w/ Bluebird
declare global { export interface Promise<T> extends Bluebird<T> {} }

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

export const getStatus = async function (
  context: GraphqlContext,
  overrideUser?: UserTransformed,
): Promise<OfferStatus | null> {
  const { user: contextUser, pgdb } = context

  const pledges: PledgeRow[] = await pgdb.public.pledges.find({
    userId: overrideUser?.id || contextUser?.id,
    status: 'SUCCESSFUL', // @TODO: Broaden?
  })

  // @TODO: Payments? für overdue et al.
  const memberships_ = await pgdb.public.memberships.find({
    or: [
      { userId: overrideUser?.id || contextUser?.id },
      pledges?.length > 0 && {
        pledgeId: pledges.map((pledge) => pledge.id),
      },
    ].filter(Boolean),
  })

  await resolveMemberships({
    memberships: memberships_,
    pgdb,
  })

  return {
    id: Buffer.from('foobar').toString('base64'),
    label: 'Status label',
    description: 'Status description',
  }
}

export const getOffer = async function (
  context: GraphqlContext,
  overrideUser?: UserTransformed,
): Promise<Offer> {
  const { user: contextUser, pgdb } = context

  const [status, packages] = await Promise.all([
    getStatus(context, overrideUser),
    getPackages({
      pledger: overrideUser || contextUser,
      pgdb,
    }),
  ])

  return {
    id: Buffer.from('foobar').toString('base64'),
    status,
    packages,
  }
}
