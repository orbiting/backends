const { ascending, descending } = require('d3-array')
const graphqlFields = require('graphql-fields')

const { paginate: { paginator } } = require('@orbiting/backend-modules-utils')

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

const sortValueMap = {
  HOT: node => node.hotness,
  VOTES: node => node.upVotes - node.downVotes,
  DATE: node => node.createdAt,
  REPLIES: (node, index, nodes) => nodes.filter(n => n.parentIds && n.parentIds.includes(node.id)).length
}

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

const sortValue = (direction) => (a, b) =>
  direction === 'DESC'
    ? descending(a._sort, b._sort)
    : ascending(a._sort, b._sort)

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
      const maximumDepth = ((parent && parent.depth + 1 + flatDepth) || flatDepth)

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
        totalCount: countNodes.filter(n => n.depth >= anchorDepth).length,
        directTotalCount: countNodes.filter(n => n.depth === anchorDepth).length,
        focus: args.focusId && nodes.find(n => n.id === args.focusId),
        id: discussion.id
      }
    }
  )
}
