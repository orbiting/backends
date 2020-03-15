const newsletterEmailSchema = require('@project-r/template-newsletter/lib/email')
const editorialNewsletterSchema = require('@project-r/styleguide/lib/templates/EditorialNewsletter/email')
const articleSchema = require('@project-r/styleguide/lib/templates/Article/email')
const { renderEmail } = require('mdast-react-render/lib/email')

const get = doc => {
  const { template } = doc.content.meta

  let emailSchema
  if (template === 'editorialNewsletter') {
    emailSchema = editorialNewsletterSchema.default() // Because styleguide currently doesn't support module.exports
  } else if (template === 'article') {
    emailSchema = articleSchema.default()
  } else {
    emailSchema = newsletterEmailSchema // PROJECT-R template
  }
  return renderEmail(doc.content, emailSchema)
}

module.exports = {
  get
}
