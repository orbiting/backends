#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2')
const { parse } = require('url')
const { ascending, descending, range, sum } = require('d3-array')

// node --max-old-space-size=4096 script/piwik/visits.js

// https://developer.matomo.org/guides/persistence-and-the-mysql-backend

// documents.json
// https://api.republik.ch/graphiql?query=%7B%0A%20%20documents%20%7B%0A%20%20%20%20nodes%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20path%0A%20%20%20%20%20%20%20%20template%0A%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20publishDate%0A%20%20%20%20%20%20%20%20feed%0A%20%20%20%20%20%20%20%20credits%0A%20%20%20%20%20%20%20%20series%20%7B%0A%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20format%20%7B%0A%20%20%20%20%20%20%20%20%20%20meta%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20title%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D%0A
const documents = require('./documents.json').data.documents.nodes

// https://ultradashboard.republik.ch/question/181
const redirections = require('./redirections.json')

// https://ultradashboard.republik.ch/question/182
const pledges = require('./pledges.json')

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

const getCurrentPath = path => {
  let currentPath = path
  let redirection
  while (redirection = redirections.find(r => r.source === currentPath)) {
    currentPath = redirection.target
  }
  return currentPath
}

const analyse = async () => {
  const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'piwik'
  })
  const connection = con.promise()

  const [ urlActions ] = await connection.query(`SELECT idaction, name FROM piwik_log_action WHERE type = 1`)

  console.log('url actions', urlActions.length)

  const actionIdToDocument = urlActions.reduce((agg, d) => {
    if (d.name.startsWith('republik.ch')) {
      let path = getCurrentPath(
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
        d.name
          .replace('republik.ch', ''),
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
    const pledge = pledges.find(p => p.id === pledgeId)
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
      hoursTimeSpent: new Map(range(24).map(h => [h, 0])),
      minutesSpent: new Map(),
      daysTimeSpend: new Map(range(7).map(d => [d, 0])),
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
    const hour = docAction.server_time.getHours()
    incrementMap(rec.hours, hour)
    if (docAction.time_spent) {
      incrementMap(rec.hoursTimeSpent, hour)
      const minutesSpent = Math.floor(docAction.time_spent / 60)
      incrementMap(rec.minutesSpent, minutesSpent)
      const day = docAction.server_time.getDay()
      incrementMap(rec.daysTimeSpend, day)
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
      const { pledge } = pledgeAction
      if (rec.pledgeIds.has(pledge.id)) {
        return
      }
      rec.chf += pledge.total / 100
      rec.pledgeIds.add(pledge.id)
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
      const actions = visit.actions.map(({idaction_url, server_time, time_spent}) => {
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
          const pledge = pledges.find(p => p.id === pledgeId)
          if (pledge) {
            return {
              server_time: new Date(server_time),
              pledge
            }
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
          .find((action, i) => i > docI && action.pledge)

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
    .map(d => ({key: d[0], count: d[1]}))

  const toJS = stat => Object.keys(stat).map(key => {
    const segment = stat[key]
    return {
      segment: key,
      visitors: segment.visitors.size,
      chf: segment.chf,
      referrer: mapToJs(
        segment.referrer,
        (a, b) => descending(a[1], b[1])
      ),
      hours: mapToJs(segment.hours),
      minutesSpent: mapToJs(segment.minutesSpent),
      daysTimeSpend: mapToJs(segment.daysTimeSpend)
        .map(d => ({key: shortDays[d.key], count: d.count}))
    }
  })

  console.log('visitors', stat.all.visitors.size)
  fs.writeFileSync(
    path.join(__dirname, 'stats.json'),
    JSON.stringify({
      segments: segments.map(segment => segment.key),
      total: toJS(stat),
      docs: Array.from(docStats).map(([doc, stat]) => ({
        title: doc.meta.title,
        path: doc.meta.path,
        stats: toJS(stat)
      }))
    }, undefined, 2)
  )

  connection.end()
}

analyse()
