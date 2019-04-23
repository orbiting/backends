const {
  SLACK_API_TOKEN
} = process.env

let SlackWebClient
if (SLACK_API_TOKEN) {
  SlackWebClient = new (require('@slack/web-api').WebClient)(SLACK_API_TOKEN)
} else {
  console.warn('Posting to slack disabled: missing SLACK_API_TOKEN')
}

const publish = async (channel, content) => {
  if (SlackWebClient && channel) {
    await SlackWebClient.chat.postMessage({
      channel,
      text: content
    })
      .catch((e) => {
        console.error(e)
      })
  } else {
    console.warn(
      `Slack cannot publish: missing SLACK_API_TOKEN or channel.\n\tmessage: ${content}\n`
    )
  }
}

const postMessage = async (message) => {
  if (SlackWebClient) {
    await SlackWebClient.chat.postMessage(message)
      .catch((e) => {
        console.error(e)
      })
  } else {
    console.warn(
      `Slack cannot publish: missing SLACK_API_TOKEN or channel.`
    )
  }
}

module.exports = publish
module.exports.postMessage = postMessage
