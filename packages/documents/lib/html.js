const {
  newsletterEmailSchema,
  editorialNewsletterSchema,
  articleEmailSchema,
} = require('@orbiting/backend-modules-styleguide')
const { renderEmail } = require('mdast-react-render/lib/email')

const get = (doc) => {
  const { template } = doc.content.meta

  if (template === 'editorialNewsletter') {
    return renderEmail(doc.content, editorialNewsletterSchema.default())
  }

  if (template === 'article') {
    return renderEmail(doc.content, articleEmailSchema)
  }

  return renderEmail(doc.content, newsletterEmailSchema)
}

module.exports = {
  get,
}
