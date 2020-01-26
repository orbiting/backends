#!/usr/bin/env node

/* eslint-disable node/no-deprecated-api, camelcase */

require('@orbiting/backend-modules-env').config()

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2')
const { parse } = require('url')
const { ascending, descending, range, sum } = require('d3-array')
const { timeFormat } = require('d3-time-format')

const PgDb = require('@orbiting/backend-modules-base/lib/PgDb')
const Elasticsearch = require('@orbiting/backend-modules-base/lib/Elasticsearch')
const Redis = require('@orbiting/backend-modules-base/lib/Redis')
const RedisPubSub = require('@orbiting/backend-modules-base/lib/RedisPubSub')
const { t } = require('@orbiting/backend-modules-translate')

const search = require('@orbiting/backend-modules-search/graphql/resolvers/_queries/search')

const loaderBuilders = {
  ...require('@orbiting/backend-modules-discussions/loaders'),
  ...require('@orbiting/backend-modules-documents/loaders')
}

const getContext = (payload) => {
  const loaders = {}
  const context = {
    ...payload,
    loaders,
    user: {
      name: 'Analystic-bot',
      email: 'ruggedly@project-r.construction',
      roles: ['editor', 'member']
    }
  }
  Object.keys(loaderBuilders).forEach(key => {
    loaders[key] = loaderBuilders[key](context)
  })
  return context
}

// node --max-old-space-size=4096 script/piwik/visits.js

// https://developer.matomo.org/guides/persistence-and-the-mysql-backend

// const getWeek = timeFormat('%W')
const getMonth = timeFormat('%m')

const referrerNames = {
  'm.facebook.com': 'Facebook',
  'l.facebook.com': 'Facebook',
  'lm.facebook.com': 'Facebook',
  'www.facebook.com': 'Facebook',
  't.co': 'Twitter',
  'twitter.com': 'Twitter',
  'mobile.twitter.com': 'Twitter',
  'com.twitter.android': 'Twitter',
  'com.samruston.twitter': 'Twitter',
  'tweetdeck.twitter.com': 'Twitter',
  'en.m.wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia',
  'de.m.wikipedia.org': 'Wikipedia',
  'de.wikipedia.org': 'Wikipedia',
  'com.google.android.gm': 'GMail Android App',
  'deref-gmx.net': 'Webmail',
  'deref-web-02.de': 'Webmail',
  'rich-v01.bluewin.ch': 'Webmail',
  'rich-v02.bluewin.ch': 'Webmail',
  'mail.yahoo.com': 'Webmail',
  'outlook.live.com': 'Webmail',
  'webmail1.sunrise.ch': 'Webmail',
  'office.hostpoint.ch': 'Webmail',
  'mail.zhaw.ch': 'Webmail',
  'mail.google.com': 'Webmail',
  'idlmail04.lotus.uzh.ch': 'Webmail',
  'com.google.android.googlequicksearchbox': 'Google'
}
const shortDays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

const analyse = async (context, { fileBaseData = false } = {}) => {
  const { pgdb } = context
  const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'piwik190307'
  })
  const connection = con.promise()

  const [urlActions] = await connection.query('SELECT idaction, name FROM piwik_log_action WHERE type = 1')

  console.log('url actions', urlActions.length)

  const documents = fileBaseData
    ? require('./documents.json').data.documents.nodes.filter(doc => doc.meta.template === 'article') // https://api.republik.ch/graphiql?query=%7B%0A%20%20documents(first%3A%202000)%20%7B%0A%20%20%20%20nodes%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20path%0A%20%20%20%20%20%20%20%20template%0A%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20publishDate%0A%20%20%20%20%20%20%20%20feed%0A%20%20%20%20%20%20%20%20credits%0A%20%20%20%20%20%20%20%20series%20%7B%0A%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20format%20%7B%0A%20%20%20%20%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D%0A
    : await search(null, {
      first: 10000,
      unrestricted: true,
      filter: {
        template: 'article',
        type: 'Document'
      },
      sort: {
        key: 'publishedAt',
        direction: 'DESC'
      }
    }, context).then(d => d.nodes.map(n => n.entity))

  console.log('documents', documents.length)

  const redirections = fileBaseData
    ? require('./redirections.json') // https://ultradashboard.republik.ch/question/181
    : await pgdb.query('SELECT source, target FROM redirections WHERE "deletedAt" is null')
  console.log('redirections', redirections.length)

  const pledges = fileBaseData
    ? require('./pledges.json').filter(p => p.name !== 'PROLONG') // https://ultradashboard.republik.ch/question/182
    : await pgdb.query(`
      SELECT p.id, p.total, p."createdAt", pack.name
      FROM pledges p
      JOIN packages pack on pack.id = p."packageId"
      WHERE p.status != 'DRAFT' AND p.status != 'CANCELLED' AND pack.name != 'PROLONG'
    `)
  console.log('pledges', pledges.length)

  const pledgeIndex = pledges.reduce((index, pledge) => {
    index[pledge.id] = pledge
    return index
  })

  const getCurrentPath = path => {
    let currentPath = path
    while (redirections.find(r => r.source === currentPath)) {
      currentPath = redirections.find(r => r.source === currentPath).target
    }
    return currentPath
  }
  const actionIdToDocument = urlActions.reduce((agg, d) => {
    if (d.name.startsWith('republik.ch')) {
      const path = getCurrentPath(
        d.name
          .replace('republik.ch', '')
          .split('?')[0]
      )
      const doc = documents.find(d => d.meta.path === path)
      if (doc) {
        agg[d.idaction] = doc
      }
    }
    return agg
  }, {})
  console.log('doc actions', Object.keys(actionIdToDocument).length)

  const pledgeIds = new Set()
  const actionIdToPledgeId = urlActions.reduce((agg, d) => {
    if (d.name.startsWith('republik.ch/konto')) {
      const url = parse(
        d.name.replace('republik.ch', ''),
        true
      )
      if (url.query.id) {
        agg[d.idaction] = url.query.id
        pledgeIds.add(url.query.id)
      }
    }
    return agg
  }, {})

  console.log('pledge actions', Object.keys(actionIdToPledgeId).length)
  console.log('chf total', sum(Array.from(pledgeIds), pledgeId => {
    const pledge = pledgeIndex[pledgeId]
    if (pledge) {
      return pledge.total
    }
    return 0
  }) / 100)

  // «visits»
  // SELECT
  //   idvisitor,
  //   idvisit,
  //   referer_type,
  //   referer_url,
  //   referer_name,
  //   visit_total_time,
  //   location_country,
  //   custom_dimension_1, -- role
  //   config_os
  // FROM piwik_log_visit
  // WHERE idsite = 5

  // «page view»
  // SELECT
  //   idvisitor,
  //   idvisit,
  //   server_time,
  //   idaction_url,
  //   idaction_url_ref, -- previous action in the visit
  //   time_spent,
  //   time_spent_ref_action -- time spent doing the previous action
  // FROM piwik_log_link_visit_action
  // WHERE idsite = 5

  const query = con.query(`
    SELECT
      v.idvisitor,
      v.idvisit,
      v.referer_type,
      v.referer_url,
      v.referer_name,
      v.visit_total_time,
      v.location_country as country,
      v.custom_dimension_1 as roles,
      v.config_os as os,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'server_time', va.server_time,
          'idaction_url', va.idaction_url,
          'idaction_url_ref', va.idaction_url_ref,
          'time_spent', va.time_spent,
          'time_spent_ref_action', va.time_spent_ref_action
        )
      ) as actions
    FROM piwik_log_visit v
    JOIN piwik_log_link_visit_action va ON va.idvisit = v.idvisit
    WHERE v.idsite = 5
    GROUP BY v.idvisit
  `)

  const stat = {}
  const docStats = new Map()

  const createRecord = () => {
    return {
      visitors: new Set(),
      hours: new Map(range(24).map(h => [h, 0])),
      minutesSpent: new Map(),
      days: new Map(range(7).map(d => [d, 0])),
      pledgeIds: new Set(),
      chf: 0,
      referrer: new Map()

      // afterHoursChf: new Map(),
      // afterDays: new Map(),
      // countries: new Map(),
      // os: new Map()
    }
  }
  const segments = [
    {
      key: 'all',
      test: () => true
    },
    {
      key: 'guest',
      test: visit => visit.roles === 'guest'
    },
    {
      key: 'member',
      test: visit => visit.roles && visit.roles.includes('member')
    },
    {
      key: 'mobile',
      test: visit => visit.os === 'IOS' || visit.os === 'AND'
    }
  ]
  const incrementMap = (map, key) => {
    map.set(key, (map.get(key) || 0) + 1)
  }
  const increment = (stat, key, visit, docAction, pledgeAction) => {
    const rec = stat[key] = stat[key] || createRecord()

    rec.visitors.add(visit.idvisitor)
    const day = docAction.server_time.getDay()
    incrementMap(rec.days, day)
    const hour = docAction.server_time.getHours()
    incrementMap(rec.hours, hour)
    if (docAction.time_spent) {
      const minutesSpent = Math.floor(docAction.time_spent / 60)
      incrementMap(rec.minutesSpent, minutesSpent)
    }

    let referrer
    switch (visit.referer_type) {
      case 6:
        referrer = visit.referer_name.startsWith('republik/newsletter-editorial')
          ? 'Republik-Newsletter'
          : `Kampagne ${visit.referer_name}`
        break
      case 3:
      case 2:
        referrer = referrerNames[visit.referer_name] || visit.referer_name
        break
      case 1:
        referrer = 'Direkt / Keine Angabe'
        break
      default:
        referrer = 'Unbekannt'
        break
    }
    incrementMap(rec.referrer, referrer)

    if (pledgeAction) {
      const { pledgeId } = pledgeAction
      rec.pledgeIds.add(pledgeId)
    }
  }
  const record = (visit, docAction, pledgeAction) => {
    const doc = docAction.doc

    if (!docStats.has(doc)) {
      docStats.set(doc, {})
    }
    const docStat = docStats.get(doc)

    segments.forEach(segment => {
      if (segment.test(visit)) {
        increment(stat, segment.key, visit, docAction, pledgeAction)
        increment(docStat, segment.key, visit, docAction, pledgeAction)
      }
    })
  }

  await new Promise((resolve, reject) => query
    .on('result', visit => {
      const actions = visit.actions.map(({ idaction_url, server_time, time_spent }) => {
        const doc = actionIdToDocument[idaction_url]
        if (doc) {
          const nextAction = visit.actions.find(a => a.idaction_url_ref === idaction_url)
          return {
            server_time: new Date(server_time),
            time_spent: nextAction
              ? nextAction.time_spent_ref_action
              : time_spent,
            doc
          }
        }
        const pledgeId = actionIdToPledgeId[idaction_url]
        if (pledgeId) {
          return {
            server_time: new Date(server_time),
            pledgeId
          }
        }
      })
        .filter(Boolean)
        .sort((a, b) => ascending(a.server_time, b.server_time))

      actions.forEach((docAction, docI) => {
        if (!docAction.doc) {
          return
        }
        const pledgeAction = actions
          .find((action, i) => i > docI && action.pledgeId)

        record(visit, docAction, pledgeAction)
      })
    })
    .on('error', err => reject(err))
    .on('end', () => resolve())
  )

  const mapToJs = (
    map,
    compare = (a, b) => ascending(a[0], b[0])
  ) => Array.from(map)
    .sort(compare)
    .map(d => ({ key: d[0], count: d[1] }))

  const missingPledges = new Set()
  const toJS = stat => Object.keys(stat).reduce((agg, key) => {
    const segment = stat[key]

    const segmentPledges = Array.from(segment.pledgeIds).map(id => {
      const pledge = pledgeIndex[id]
      if (!pledge) {
        missingPledges.add(id)
      }
      return pledge
    }).filter(Boolean)

    agg[key] = {
      segment: key,
      visitors: segment.visitors.size,
      chf: sum(segmentPledges, p => p.total) / 100,
      pledgeMonths: mapToJs(segmentPledges
        .map(p => getMonth(new Date(p.createdAt)))
        .reduce(
          (map, month) => {
            incrementMap(map, month)
            return map
          },
          new Map()
        )
      ),
      referrer: mapToJs(
        segment.referrer,
        (a, b) => descending(a[1], b[1])
      ),
      hours: mapToJs(segment.hours),
      days: mapToJs(segment.days)
        .map(d => ({ key: shortDays[d.key], count: d.count })),
      minutesSpent: mapToJs(segment.minutesSpent)
    }
    return agg
  }, {})

  console.log('visitors', stat.all.visitors.size)
  fs.writeFileSync(
    path.join(__dirname, 'stats.json'),
    JSON.stringify({
      segments: segments.map(segment => segment.key),
      total: toJS(stat),
      docs: Array.from(docStats).map(([doc, stat]) => ({
        publishDate: doc.meta.publishDate,
        title: doc.meta.title,
        path: doc.meta.path,
        stats: toJS(stat)
      }))
    }, undefined, 2)
  )
  console.log('unmatched pledges', missingPledges.size, '(e.g. prolong, canceled)')

  connection.end()
}

PgDb.connect().then(async pgdb => {
  const context = getContext({
    pgdb,
    elastic: Elasticsearch.connect(),
    redis: Redis.connect(),
    pubsub: RedisPubSub.connect(),
    t
  })

  await analyse(context)
}).then(() => {
  process.exit()
}).catch(e => {
  console.log(e)
  process.exit(1)
})
