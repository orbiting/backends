module.exports = {
  document: async (zone, args, context) => {
    const { documentId } = zone

    if (!documentId) {
      return null
    }

    return context.loaders.Document.byId.load(documentId)
  },
}
