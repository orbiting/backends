const {
  SLACK_API_TOKEN
} = process.env

const { WebClient } = require('@slack/web-api')

let webClient
if (SLACK_API_TOKEN) {
  webClient = new WebClient(SLACK_API_TOKEN)
} else {
  console.warn('Posting to slack disabled: missing SLACK_API_TOKEN')
}

const publish = (channel, content, options = {}) => postMessage({
  ...options,
  channel,
  text: content
})

const postMessage = (message) => {
  if (!webClient) {
    const errorMessage = [
      'Slack cannot publish the following message, missing SLACK_API_TOKEN or channel:',
      JSON.stringify(message, null, 2)
    ].join('\n')
    const error = new Error(errorMessage)

    console.warn(error)
    return Promise.reject(error)
  }

  return webClient.chat.postMessage(message)
    .catch((e) => {
      const errorMessage = [
        'Slack cannot publish the following message:',
        JSON.stringify(message, null, 2),
        'due to the folloing error:',
        JSON.stringify(e, null, 2)
      ].join('\n')
      const error = new Error(errorMessage)
      console.error(error)

      return Promise.reject(e)
    })
}

module.exports = publish
module.exports.postMessage = postMessage
