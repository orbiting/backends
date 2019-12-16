const { ascending, descending } = require('d3-array')
const graphqlFields = require('graphql-fields')

const { paginate: { paginator } } = require('@orbiting/backend-modules-utils')

/**
 * Returns a function which can be passed to paginator. It adds all required
 * properties to ensure pagination is kept in order.
 */
const payloadModifer = (parent) => ({
  after = {},
  before = {},
  focusId,
  tag,
  orderBy = 'HOT',
  orderDirection = 'DESC',
  flatDepth = 0
}) => ({
  parent:
    (after.payload && after.payload.parent) ||
    (before.payload && before.payload.parent) ||
    parent,
  focusId:
    (after.payload && after.payload.focusId) ||
    (before.payload && before.payload.focusId) ||
    focusId,
  tag:
    (after.payload && after.payload.tag) ||
    (before.payload && before.payload.tag) ||
    tag,
  orderBy:
    (after.payload && after.payload.orderBy) ||
    (before.payload && before.payload.orderBy) ||
    orderBy,
  orderDirection:
    (after.payload && after.payload.orderDirection) ||
    (before.payload && before.payload.orderDirection) ||
    orderDirection,
  flatDepth:
    (after.payload && after.payload.flatDepth) ||
    (before.payload && before.payload.flatDepth) ||
    flatDepth
})

/**
 * Map of functions on how to determine a sort value.
 */
const sortValueMap = {
  HOT: node => node.hotness,
  VOTES: node => node.upVotes - node.downVotes,
  DATE: node => node.createdAt,
  REPLIES: (node, index, nodes) => nodes.filter(n => n.parentIds && n.parentIds.includes(node.id)).length
}

/**
 * Returns a function which then appends a sort value.
 */
const appendSortValue = (by) => {
  const sortValue = sortValueMap[by]

  if (!sortValue) {
    return node => ({ ...node, _sort: false })
  }

  return (node, ...args) => ({
    ...node,
    _sort: sortValue(node, ...args)
  })
}

/**
 * Sorts value
 */
const sortValue = (direction) => (a, b) =>
  direction === 'DESC'
    ? descending(a._sort, b._sort)
    : ascending(a._sort, b._sort)

/**
 * Will ensure a node w/ focus ID an its parents (not children however) are prepended to
 * nodes array.
 */
const bubbleUpFocused = (focusId, nodes) => {
  const focusNode = focusId && nodes.find(n => n.id === focusId)

  if (!focusNode) {
    return nodes
  }

  const siblingFocusNodes = nodes
    .filter(n =>
      n.id !== focusNode.id && (
        !focusNode.parentIds ||
        n.id === focusNode.parentIds[0] ||
        (n.parentIds && n.parentIds[0] === focusNode.parentIds[0])
      )
    )

  const leftoverNodes = nodes
    .filter(n =>
      n.id !== focusNode.id &&
      focusNode.parentIds && n.id !== focusNode.parentIds[0] &&
      (!n.parentIds || n.parentIds[0] !== focusNode.parentIds[0])
    )

  return [focusNode, ...siblingFocusNodes, ...leftoverNodes].filter(Boolean)
}

module.exports = async (discussion, args, context, info) => {
  const { loaders } = context

  // Short-circuits resolver if only Connection.totalCount and/or Connection.id are queried for.
  const requestedFields = Object.keys(graphqlFields(info))
  const wantsTotalCountOnly = !requestedFields.some(key => !['id', 'totalCount'].includes(key))

  if (wantsTotalCountOnly) {
    return {
      id: discussion.id,
      totalCount: loaders.Discussion.byIdCommentsCount.load(discussion.id)
    }
  }

  const nodes = await loaders.Comment.byDiscussionId.load(discussion.id)

  // Use a specific parent node as anchor for root comments
  const parentNode = args.parentId && nodes.find(n => n.id === args.parentId)

  return paginator(
    args,
    payloadModifer(parentNode && { id: parentNode.id, depth: parentNode.depth }),
    (args, payload) => {
      const { parent, focusId, tag, orderBy, orderDirection, flatDepth } = payload

      // Maximum depth is determined by flatDepth arguments, and maybe a parent
      // node's depth. In latter case parent node's depth is topped w/ flatDepth argument.
      const maximumDepth =
        (parent && parent.depth + 1 + flatDepth) ||
        (flatDepth === 0 && 1) ||
        flatDepth

      const concoctNodes = nodes
        .filter(n => n.depth < maximumDepth)
        .filter(n => !parent || (n.parentIds && n.parentIds.includes(parent.id)))
        .filter(n => !tag || (n.tags && n.tags.includes(tag)))
        .map(appendSortValue(orderBy))
        .sort(sortValue(orderDirection))

      return bubbleUpFocused(focusId, concoctNodes)
    },
    (args, payload, connection) => {
      const { parent } = payload

      const countNodes = nodes.filter(n => !parent || (n.parentIds && n.parentIds.includes(parent.id)))
      const anchorDepth = (parent && parent.depth + 1) || 0

      return {
        ...connection,
        // Count returns all available nodes
        totalCount: countNodes.filter(n => n.depth >= anchorDepth).length,
        // Count returns all available nodes on same depth level
        directTotalCount: countNodes.filter(n => n.depth === anchorDepth).length,
        focus: args.focusId && nodes.find(n => n.id === args.focusId),
        id: discussion.id
      }
    }
  )
}
