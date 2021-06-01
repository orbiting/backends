const moment = require('moment')

const { mdastToString } = require('@orbiting/backend-modules-utils')

const feedAudio = require('./feed-audio.json')

feedAudio.data?.search?.nodes?.forEach((node) => {
  const meta = node?.entity?.meta

  if (meta?.audioSource?.mp3) {
    console.log([
      meta.title,
      `https://www.republik.ch${meta.path}`,
      moment(meta.publishDate).format('DD.MM.YYYY'),
      mdastToString({ children: meta.credits }),
      meta.audioSource.mp3,
      meta.audioSource.durationMs,
    ].join('\t'))
  }

})
